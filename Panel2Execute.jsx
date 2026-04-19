import { useState, useEffect, useRef } from 'react';
import { executeSteps } from './api';
import socket from './socket';

const ACTIONS = [
  'navigate','click','fill','select','check','uncheck',
  'assert_visible','assert_text','assert_url','wait','press_key',
];

const inputStyle = {
  background: 'var(--bg)', border: '1px solid var(--border)',
  color: 'var(--text)', borderRadius: 4, padding: '4px 8px',
  fontSize: 11, fontFamily: 'var(--mono)', width: '100%', outline: 'none',
  transition: 'border-color .15s',
};

export default function Panel2Execute({ steps, onStepUpdate, logs, stepStatuses, results, setResults, onReset }) {
  const [running, setRunning]       = useState(false);
  const [debugMode, setDebugMode]   = useState(false);
  const [stepDelay, setStepDelay]   = useState(0);
  const [pausedAt, setPausedAt]     = useState(null);
  const [pauseDraft, setPauseDraft] = useState(null); // editable copy of paused step
  const [lastError, setLastError]   = useState(null); // error from last attempt of paused step
  const [stopped, setStopped]       = useState(false);
  const logsEndRef = useRef(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Server tells us which step is paused and what its last error was
  useEffect(() => {
    const onPaused = ({ stepId, error }) => {
      setPausedAt(stepId);
      setLastError(error || null);
      // Pre-populate draft with current step data so user can edit it
      const step = steps.find(s => s.id === stepId);
      if (step) setPauseDraft({ ...step });
    };
    socket.on('step:paused', onPaused);
    return () => socket.off('step:paused', onPaused);
  }, [steps]);

  const handleRun = async () => {
    setRunning(true);
    setStopped(false);
    setPausedAt(null);
    setPauseDraft(null);
    setLastError(null);
    setResults(null);
    try {
      const { results: r } = await executeSteps(steps, { debug: debugMode, stepDelay });
      setResults(r);
    } catch (e) {
      // visible in log stream
    } finally {
      setRunning(false);
      setPausedAt(null);
      setPauseDraft(null);
    }
  };

  const handleContinue = () => {
    setPausedAt(null);
    setPauseDraft(null);
    setLastError(null);
    socket.emit('step:continue');
  };

  const handleJump = (targetIndex) => {
    setPausedAt(null);
    setPauseDraft(null);
    setLastError(null);
    socket.emit('step:jump', { targetIndex });
  };

  const handleRetry = () => {
    if (!pauseDraft) return;
    // Persist the edit back into the steps list in App
    onStepUpdate(pauseDraft);
    setLastError(null);
    // Send updated step to server — it will re-run and emit step:paused again
    socket.emit('step:retry', pauseDraft);
  };

  const handleStop = () => {
    setStopped(true);
    setPausedAt(null);
    setPauseDraft(null);
    setLastError(null);
    socket.emit('step:stop');
  };

  const passed = results?.filter(r => r.passed).length ?? 0;
  const failed = results?.filter(r => !r.passed).length ?? 0;

  const pausedIndex = pausedAt ? steps.findIndex(s => s.id === pausedAt) : -1;
  const canBack     = pausedIndex > 0;
  const canForward  = pausedIndex >= 0 && pausedIndex < steps.length - 1;

  const getStepIcon = (step) => {
    if (pausedAt === step.id) return '⏸';
    const result = results?.find(r => r.id === step.id);
    if (result) return result.passed ? '✔' : '✖';
    const s = stepStatuses[step.id];
    if (s?.status === 'running') return '⏳';
    return '○';
  };

  const getStepColor = (step) => {
    if (pausedAt === step.id) return 'var(--warning)';
    const result = results?.find(r => r.id === step.id);
    if (result) return result.passed ? 'var(--success)' : 'var(--error)';
    const s = stepStatuses[step.id];
    if (s?.status === 'running') return 'var(--accent)';
    return 'var(--text3)';
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, height: 'calc(100vh - 130px)' }}>

      {/* ── Left panel ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>

        {/* Main toolbar */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={handleRun} disabled={running || !steps.length}>
            {running && !pausedAt ? '⏳ Running…' : '▶ Run Tests'}
          </button>
          {running && (
            <button className="btn btn-secondary" onClick={handleStop}
              style={{ borderColor: 'var(--error)', color: 'var(--error)' }}>
              ⏹ Stop
            </button>
          )}
          <button className="btn btn-secondary" onClick={onReset} disabled={running}>↩ New CSV</button>
          {results && !running && (
            <div style={{ marginLeft: 'auto', fontSize: 12, display: 'flex', gap: 10 }}>
              <span style={{ color: 'var(--success)' }}>{passed} passed</span>
              <span style={{ color: 'var(--error)' }}>{failed} failed</span>
            </div>
          )}
        </div>

        {/* Debug controls */}
        <div style={{
          background: 'var(--bg2)',
          border: `1px solid ${pausedAt ? 'var(--warning)' : debugMode ? 'rgba(245,158,11,.4)' : 'var(--border)'}`,
          borderRadius: 8, padding: '10px 14px', flexShrink: 0, transition: 'border-color .2s',
        }}>
          {/* Toggle + delay row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
              <div onClick={() => !running && setDebugMode(d => !d)} style={{
                width: 36, height: 20, borderRadius: 10, position: 'relative',
                cursor: running ? 'not-allowed' : 'pointer',
                background: debugMode ? 'var(--warning)' : 'var(--bg3)',
                border: '1px solid var(--border)', transition: 'background .2s',
              }}>
                <div style={{
                  position: 'absolute', top: 2, left: debugMode ? 17 : 2,
                  width: 14, height: 14, borderRadius: '50%',
                  background: debugMode ? '#000' : 'var(--text3)',
                  transition: 'left .2s',
                }} />
              </div>
              <span style={{ fontSize: 12, color: debugMode ? 'var(--warning)' : 'var(--text3)', fontWeight: debugMode ? 600 : 400 }}>
                Debug mode{debugMode ? ' — step-by-step' : ''}
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text3)' }}>
              <span>Step delay</span>
              <input type="range" min={0} max={3000} step={250} value={stepDelay}
                onChange={e => setStepDelay(Number(e.target.value))} disabled={running}
                style={{ width: 80, accentColor: 'var(--accent)', cursor: running ? 'not-allowed' : 'pointer' }} />
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, minWidth: 40, color: 'var(--text2)' }}>{stepDelay}ms</span>
            </label>
          </div>

          {/* ── Paused: inline step editor ── */}
          {pausedAt && pauseDraft && (
            <div style={{ marginTop: 12, borderTop: '1px solid rgba(245,158,11,.3)', paddingTop: 12 }}>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 700 }}>⏸ Paused at step {pausedIndex + 1}</span>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>— edit and retry, navigate back/forward, or continue</span>
              </div>

              {/* Error from last attempt */}
              {lastError && (
                <div style={{
                  marginBottom: 8, padding: '6px 10px', borderRadius: 4,
                  background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)',
                  fontSize: 11, color: 'var(--error)', fontFamily: 'var(--mono)',
                }}>
                  ✖ {lastError}
                </div>
              )}

              {/* Editable fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: 6, marginBottom: 8 }}>
                {/* Action */}
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>Action</div>
                  <select value={pauseDraft.action}
                    onChange={e => setPauseDraft(d => ({ ...d, action: e.target.value }))}
                    style={{ ...inputStyle, fontFamily: 'var(--mono)' }}>
                    {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                {/* Target */}
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>Target</div>
                  <input value={pauseDraft.target}
                    onChange={e => setPauseDraft(d => ({ ...d, target: e.target.value }))}
                    style={inputStyle} placeholder="CSS selector or URL"
                    onFocus={e => e.target.style.borderColor = 'var(--warning)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                </div>
                {/* Value */}
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>Value</div>
                  <input value={pauseDraft.value}
                    onChange={e => setPauseDraft(d => ({ ...d, value: e.target.value }))}
                    style={inputStyle} placeholder="value"
                    onFocus={e => e.target.style.borderColor = 'var(--warning)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                </div>
                {/* Expected */}
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>Expected</div>
                  <input value={pauseDraft.expected}
                    onChange={e => setPauseDraft(d => ({ ...d, expected: e.target.value }))}
                    style={inputStyle} placeholder="expected"
                    onFocus={e => e.target.style.borderColor = 'var(--warning)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                </div>
                {/* Description */}
                <div style={{ gridColumn: '2 / -1' }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>Description</div>
                  <input value={pauseDraft.description}
                    onChange={e => setPauseDraft(d => ({ ...d, description: e.target.value }))}
                    style={{ ...inputStyle, fontFamily: 'var(--sans)' }} placeholder="description"
                    onFocus={e => e.target.style.borderColor = 'var(--warning)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => handleJump(pausedIndex - 1)}
                  disabled={!canBack} title="Re-run the previous step on the current browser state">
                  ↑ Back to step {pausedIndex}
                </button>
                <button className="btn btn-sm" onClick={handleRetry}
                  style={{ background: 'var(--warning)', color: '#000', fontWeight: 600 }}>
                  ↩ Retry this step
                </button>
                <button className="btn btn-primary btn-sm" onClick={handleContinue}>
                  ▶ Continue
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => handleJump(pausedIndex + 1)}
                  disabled={!canForward} title="Skip this step and jump forward">
                  ↓ Skip to step {pausedIndex + 2}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={handleStop}
                  style={{ color: 'var(--error)', marginLeft: 'auto' }}>
                  ⏹ Stop
                </button>
              </div>
            </div>
          )}

          {stopped && !running && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--warning)' }}>Execution stopped by user.</div>
          )}
        </div>

        {/* Summary bar */}
        {results && !running && (
          <div style={{
            background: passed === steps.length ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)',
            border: `1px solid ${passed === steps.length ? 'var(--success)' : 'var(--error)'}`,
            borderRadius: 6, padding: '8px 14px', fontSize: 12, flexShrink: 0,
          }}>
            {passed === steps.length
              ? `✔ All ${passed} steps passed`
              : `${passed}/${steps.length} steps passed · ${failed} failed`}
          </div>
        )}

        {/* Step list */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {steps.map((step, i) => {
            const result    = results?.find(r => r.id === step.id);
            const isPaused  = pausedAt === step.id;
            const isRunning = stepStatuses[step.id]?.status === 'running';

            return (
              <div key={step.id} style={{
                display: 'flex', gap: 8, padding: '8px 10px', borderRadius: 6,
                alignItems: 'flex-start',
                background: isPaused  ? 'rgba(245,158,11,.08)'
                          : result && !result.passed ? 'rgba(239,68,68,.06)'
                          : isRunning ? 'rgba(99,102,241,.08)'
                          : 'var(--bg2)',
                border: `1px solid ${
                  isPaused  ? 'rgba(245,158,11,.5)'
                  : result && !result.passed ? 'rgba(239,68,68,.2)'
                  : isRunning ? 'rgba(99,102,241,.3)'
                  : 'var(--border)'
                }`,
                transition: 'background .2s, border-color .2s',
              }}>
                {/* Step number */}
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600,
                  color: isPaused ? 'var(--warning)' : 'var(--text3)',
                  background: 'var(--bg3)', border: '1px solid var(--border)',
                  borderRadius: 4, padding: '1px 5px', flexShrink: 0,
                  minWidth: 26, textAlign: 'center', marginTop: 1,
                }}>
                  {i + 1}
                </span>
                {/* Status icon */}
                <span style={{
                  color: getStepColor(step), fontFamily: 'var(--mono)',
                  width: 16, flexShrink: 0, fontSize: 12, paddingTop: 1,
                }}>
                  {getStepIcon(step)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: isPaused ? 'var(--warning)' : 'var(--text)', marginBottom: 2, fontWeight: isPaused ? 600 : 400 }}>
                    {/* Show live edited description when paused */}
                    {isPaused && pauseDraft ? pauseDraft.description : step.description}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                    <span style={{ color: 'var(--accent)' }}>
                      {isPaused && pauseDraft ? pauseDraft.action : step.action}
                    </span>
                    {(isPaused && pauseDraft ? pauseDraft.target   : step.target)   && <span> · {isPaused && pauseDraft ? pauseDraft.target   : step.target}</span>}
                    {(isPaused && pauseDraft ? pauseDraft.value    : step.value)    && <span> · "{isPaused && pauseDraft ? pauseDraft.value    : step.value}"</span>}
                    {(isPaused && pauseDraft ? pauseDraft.expected : step.expected) && <span> → "{isPaused && pauseDraft ? pauseDraft.expected : step.expected}"</span>}
                  </div>
                  {result?.error && (
                    <div style={{ fontSize: 10, color: 'var(--error)', marginTop: 3 }}>{result.error}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right panel: log stream ── */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        background: 'var(--bg2)', borderRadius: 8,
        border: '1px solid var(--border)', overflow: 'hidden', minHeight: 0,
      }}>
        <div style={{
          padding: '8px 14px', borderBottom: '1px solid var(--border)',
          fontSize: 11, fontWeight: 600, color: 'var(--text3)', flexShrink: 0,
          display: 'flex', justifyContent: 'space-between',
        }}>
          <span>Execution Log</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {debugMode && <span style={{ color: 'var(--warning)', fontSize: 10 }}>⏸ debug</span>}
            {running   && <span style={{ color: 'var(--accent)' }}>● live</span>}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0', fontFamily: 'var(--mono)', fontSize: 11 }}>
          {logs.length === 0 && (
            <div style={{ padding: '10px 14px', color: 'var(--text3)' }}>Logs will appear here when tests run…</div>
          )}
          {logs.map((log, i) => (
            <div key={i} style={{
              padding: '2px 14px',
              color: log.level === 'ok'    ? 'var(--success)'
                   : log.level === 'error' ? 'var(--error)'
                   : log.level === 'warn'  ? 'var(--warning)'
                   : 'var(--text2)',
            }}>
              {log.message}
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
}
