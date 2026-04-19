import { useState, useEffect } from 'react';
import socket from './socket';
import Panel1Import from './Panel1Import';
import Panel2Execute from './Panel2Execute';

const PANELS = [
  { id: 1, label: '1 · Import CSV' },
  { id: 2, label: '2 · Execute & Results' },
];

export default function App() {
  const [activePanel, setActivePanel] = useState(1);
  const [steps, setSteps]             = useState([]);
  const [logs, setLogs]               = useState([]);
  const [stepStatuses, setStepStatuses] = useState({});
  const [results, setResults]         = useState(null);
  const [connected, setConnected]     = useState(false);

  useEffect(() => {
    setConnected(socket.connected);
    socket.on('connect',    () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('log', ({ message, level }) =>
      setLogs(prev => [...prev.slice(-299), { message, level }])
    );
    socket.on('step', ({ stepId, status, error }) =>
      setStepStatuses(prev => ({ ...prev, [stepId]: { status, error } }))
    );
    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('log');
      socket.off('step');
    };
  }, []);

  const handleImported = (parsed) => {
    setSteps(parsed);
    setLogs([]);
    setStepStatuses({});
    setResults(null);
    setActivePanel(2);
  };

  const handleReset = () => {
    setSteps([]);
    setLogs([]);
    setStepStatuses({});
    setResults(null);
    setActivePanel(1);
  };

  const passed = results?.filter(r => r.passed).length ?? 0;
  const total  = results?.length ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        background: 'var(--bg2)', borderBottom: '1px solid var(--border)',
        padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6, background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
        }}>▶</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>CSV Test Runner</div>
          <div style={{ fontSize: 10, color: 'var(--text3)' }}>Direct Playwright · No LLM · Structured CSV</div>
        </div>
        {steps.length > 0 && (
          <div style={{
            marginLeft: 16, fontSize: 11, color: 'var(--text3)',
            background: 'var(--bg3)', padding: '3px 10px', borderRadius: 4,
            border: '1px solid var(--border)',
          }}>
            {steps.length} steps loaded
          </div>
        )}
      </div>

      {/* Step tabs */}
      <div style={{ display: 'flex', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {PANELS.map(p => (
          <button
            key={p.id}
            onClick={() => setActivePanel(p.id)}
            style={{
              flex: 1, padding: '9px 4px', background: 'none', border: 'none',
              borderBottom: `2px solid ${activePanel === p.id ? 'var(--accent)' : 'transparent'}`,
              color: activePanel === p.id ? 'var(--text)' : 'var(--text3)',
              fontSize: 11, fontWeight: activePanel === p.id ? 600 : 400,
              cursor: 'pointer', transition: 'all .15s', fontFamily: 'var(--sans)',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {activePanel === 1 && <Panel1Import onImported={handleImported} initialSteps={steps} />}
        {activePanel === 2 && (
          <Panel2Execute
            steps={steps}
            onStepUpdate={(updated) => setSteps(prev => prev.map(s => s.id === updated.id ? updated : s))}
            logs={logs}
            stepStatuses={stepStatuses}
            results={results}
            setResults={setResults}
            onReset={handleReset}
          />
        )}
      </div>

      {/* Status bar */}
      <div style={{
        background: 'var(--bg2)', borderTop: '1px solid var(--border)',
        padding: '4px 16px', display: 'flex', alignItems: 'center', gap: 12,
        fontSize: 11, color: 'var(--text3)', flexShrink: 0,
      }}>
        <span style={{ color: connected ? 'var(--success)' : 'var(--error)' }}>
          {connected ? '● Connected' : '○ Disconnected'}
        </span>
        {results && (
          <span style={{ color: passed === total ? 'var(--success)' : 'var(--error)' }}>
            {passed}/{total} steps passed
          </span>
        )}
        <span style={{ marginLeft: 'auto' }}>Panel {activePanel}/2</span>
      </div>
    </div>
  );
}
