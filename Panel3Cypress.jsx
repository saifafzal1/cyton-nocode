import { useState, useEffect, useRef } from 'react';
import socket from './socket';

const BASE = 'http://localhost:3001';
const MAX_FIX_ATTEMPTS = 3;

const btn = (extra = {}) => ({
  padding: '6px 14px', borderRadius: 5, border: 'none', cursor: 'pointer',
  fontSize: 12, fontWeight: 600, fontFamily: 'var(--sans)', ...extra,
});

export default function Panel3Cypress({ steps, results }) {
  const [spec, setSpec]           = useState('');
  const [generating, setGenerating] = useState(false);
  const [running, setRunning]     = useState(false);
  const [autoFixing, setAutoFixing] = useState(false);
  const [fixAttempt, setFixAttempt] = useState(0);
  const [runResult, setRunResult] = useState(null);
  const [runLogs, setRunLogs]     = useState([]);
  const [error, setError]         = useState('');

  const logsRef    = useRef(null);
  const tokenBuf   = useRef('');
  const specRef    = useRef(spec);
  specRef.current  = spec;

  // Auto-scroll logs
  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [runLogs]);

  // Socket listeners
  useEffect(() => {
    const onToken = (token) => {
      tokenBuf.current += token;
      setSpec(tokenBuf.current);
    };
    const onDone  = ({ spec: s }) => { tokenBuf.current = s; setSpec(s); };
    const onLog   = (line) => setRunLogs(prev => [...prev, line]);
    const onErr   = (msg)  => setError(msg);

    socket.on('cypress:token',  onToken);
    socket.on('cypress:done',   onDone);
    socket.on('cypress:runlog', onLog);
    socket.on('cypress:error',  onErr);
    return () => {
      socket.off('cypress:token',  onToken);
      socket.off('cypress:done',   onDone);
      socket.off('cypress:runlog', onLog);
      socket.off('cypress:error',  onErr);
    };
  }, []);

  const canGenerate = steps?.length > 0 && !generating && !running && !autoFixing;
  const canRun      = spec.trim().length > 0 && !generating && !running && !autoFixing;

  async function handleGenerate() {
    setError('');
    setSpec('');
    tokenBuf.current = '';
    setRunResult(null);
    setRunLogs([]);
    setGenerating(true);
    try {
      await fetch(`${BASE}/api/cypress/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steps, results }),
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleRun(specToRun = null) {
    setError('');
    setRunLogs([]);
    setRunResult(null);
    setRunning(true);
    try {
      const res = await fetch(`${BASE}/api/cypress/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec: specToRun ?? specRef.current }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Run failed');
      setRunResult(data);
      return data;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setRunning(false);
    }
  }

  async function handleAutoFix() {
    setError('');
    setAutoFixing(true);
    setFixAttempt(0);
    setRunLogs([]);
    setRunResult(null);

    let currentSpec = specRef.current;

    for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
      setFixAttempt(attempt);
      setRunLogs(prev => [...prev, `\n── Auto-fix attempt ${attempt}/${MAX_FIX_ATTEMPTS} ──`]);

      // Run
      setRunning(true);
      let result;
      try {
        const res = await fetch(`${BASE}/api/cypress/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spec: currentSpec }),
        });
        result = await res.json();
        setRunResult(result);
      } catch (e) {
        setError(e.message);
        setRunning(false);
        break;
      }
      setRunning(false);

      if (result.failed === 0 && result.exitCode === 0) {
        setRunLogs(prev => [...prev, `\n✔ All tests passed after ${attempt} attempt(s).`]);
        break;
      }

      if (attempt === MAX_FIX_ATTEMPTS) {
        setRunLogs(prev => [...prev, `\n✖ Could not fix after ${MAX_FIX_ATTEMPTS} attempts.`]);
        break;
      }

      // Fix
      setRunLogs(prev => [...prev, `\n── Sending to LLM for fix… ──`]);
      setGenerating(true);
      tokenBuf.current = '';
      setSpec('');
      try {
        const res = await fetch(`${BASE}/api/cypress/fix`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spec: currentSpec, errorOutput: result.errorOutput || result.output }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Fix failed');
        currentSpec = data.spec;
      } catch (e) {
        setError(e.message);
        setGenerating(false);
        break;
      }
      setGenerating(false);
    }

    setAutoFixing(false);
    setFixAttempt(0);
  }

  function handleDownload() {
    const blob = new Blob([spec], { type: 'text/javascript' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'generated.cy.js'; a.click();
    URL.revokeObjectURL(url);
  }

  const busy = generating || running || autoFixing;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          style={btn({ background: canGenerate ? 'var(--accent)' : 'var(--bg3)', color: canGenerate ? '#fff' : 'var(--text3)', opacity: canGenerate ? 1 : 0.5 })}
          onClick={handleGenerate} disabled={!canGenerate}
        >
          {generating ? '⏳ Generating…' : '✨ Generate Spec'}
        </button>

        <button
          style={btn({ background: canRun ? '#22c55e' : 'var(--bg3)', color: canRun ? '#fff' : 'var(--text3)', opacity: canRun ? 1 : 0.5 })}
          onClick={() => handleRun()} disabled={!canRun}
        >
          {running && !autoFixing ? '▶ Running…' : '▶ Run'}
        </button>

        <button
          style={btn({ background: canRun ? '#f59e0b' : 'var(--bg3)', color: canRun ? '#fff' : 'var(--text3)', opacity: canRun ? 1 : 0.5 })}
          onClick={handleAutoFix} disabled={!canRun}
        >
          {autoFixing ? `🔄 Auto-fixing (${fixAttempt}/${MAX_FIX_ATTEMPTS})…` : '🔄 Auto-fix'}
        </button>

        {spec && (
          <button
            style={btn({ background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)' })}
            onClick={handleDownload} disabled={busy}
          >
            ⬇ Download .cy.js
          </button>
        )}

        {!steps?.length && (
          <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 4 }}>
            Import and execute steps in Panels 1 &amp; 2 first
          </span>
        )}

        {runResult && (
          <span style={{
            marginLeft: 'auto', fontSize: 12, fontWeight: 600,
            color: runResult.failed === 0 ? 'var(--success)' : 'var(--error)',
          }}>
            {runResult.passed} passed · {runResult.failed} failed
          </span>
        )}
      </div>

      {error && (
        <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,.1)', border: '1px solid var(--error)', borderRadius: 6, fontSize: 12, color: 'var(--error)' }}>
          {error}
        </div>
      )}

      {/* Main content — editor + logs side by side */}
      <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>

        {/* Spec editor */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, fontWeight: 600 }}>
            CYPRESS SPEC {generating && <span style={{ color: 'var(--accent)' }}>· streaming…</span>}
          </div>
          <textarea
            value={spec}
            onChange={e => setSpec(e.target.value)}
            spellCheck={false}
            style={{
              flex: 1, width: '100%', resize: 'none',
              background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--text)', padding: 12,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 12,
              lineHeight: 1.6, outline: 'none', boxSizing: 'border-box',
            }}
            placeholder={generating ? 'Generating spec…' : 'Spec will appear here after generation. You can also paste or edit manually.'}
          />
        </div>

        {/* Run logs */}
        <div style={{ width: 340, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
            <span>RUN OUTPUT {running && <span style={{ color: '#22c55e' }}>· running…</span>}</span>
            {runLogs.length > 0 && (
              <button onClick={() => setRunLogs([])} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 10 }}>
                clear
              </button>
            )}
          </div>
          <div
            ref={logsRef}
            style={{
              flex: 1, overflowY: 'auto', background: 'var(--bg2)',
              border: '1px solid var(--border)', borderRadius: 6,
              padding: '10px 12px', fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}
          >
            {runLogs.length === 0
              ? <span style={{ color: 'var(--text3)' }}>Run output will appear here…</span>
              : runLogs.map((line, i) => {
                  const color = line.includes('passing') ? 'var(--success)'
                              : line.includes('failing') || line.includes('Error') ? 'var(--error)'
                              : line.startsWith('──') ? 'var(--accent)'
                              : 'var(--text)';
                  return <div key={i} style={{ color }}>{line}</div>;
                })
            }
          </div>
        </div>

      </div>
    </div>
  );
}
