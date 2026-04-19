import { useState, useRef, useEffect } from 'react';
import { uploadCSV, startRecording, stopRecording } from './api';
import socket from './socket';

const ACTIONS = [
  'navigate','click','fill','select','check','uncheck',
  'assert_visible','assert_text','assert_url','wait','press_key',
];

const ACTION_DOCS = [
  ['navigate',       'target=URL · expected=page title substring'],
  ['click',          'target=CSS selector'],
  ['fill',           'target=CSS selector · value=text to type'],
  ['select',         'target=CSS selector · value=option label'],
  ['check',          'target=CSS selector (checkbox)'],
  ['uncheck',        'target=CSS selector (checkbox)'],
  ['assert_visible', 'target=CSS selector'],
  ['assert_text',    'target=CSS selector · expected=text substring'],
  ['assert_url',     'expected=URL substring'],
  ['wait',           'value=milliseconds'],
  ['press_key',      'value=key (Enter, Escape, Tab, ArrowDown…) · target=CSS selector to focus first (optional)'],
];

const inputStyle = {
  background: 'var(--bg)', border: '1px solid var(--accent)',
  color: 'var(--text)', borderRadius: 4, padding: '3px 6px',
  fontSize: 11, fontFamily: 'var(--mono)', width: '100%', outline: 'none',
};

const cellStyle = { padding: '4px 6px', verticalAlign: 'middle' };

function SampleDownloads() {
  const [files, setFiles] = useState([]);
  useEffect(() => {
    fetch('http://localhost:3001/api/samples')
      .then(r => r.json())
      .then(d => setFiles(d.files || []))
      .catch(() => {});
  }, []);

  if (!files.length) return null;
  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>Sample CSV files</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {files.map(f => (
          <a
            key={f}
            href={`http://localhost:3001/samples/${f}`}
            download={f}
            style={{
              fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--mono)',
              background: 'var(--bg3)', border: '1px solid var(--border)',
              borderRadius: 4, padding: '3px 8px', textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            ↓ {f}
          </a>
        ))}
      </div>
    </div>
  );
}

export default function Panel1Import({ onImported, initialSteps }) {
  const [dragging, setDragging]     = useState(false);
  const [steps, setSteps]           = useState(initialSteps?.length ? initialSteps : null);
  const [error, setError]           = useState(null);
  const [loading, setLoading]       = useState(false);
  const [editingId, setEditingId]   = useState(null);
  const [draft, setDraft]           = useState({});
  const [recording, setRecording]   = useState(false);
  const [recError, setRecError]     = useState(null);
  const inputRef = useRef();

  // ── Recording: receive steps streamed from server ────────────────────────
  useEffect(() => {
    const onStep = (step) => {
      setSteps(prev => [...(prev || []), step]);
    };
    const onStopped = () => {
      setRecording(false);
    };
    socket.on('recorded:step',    onStep);
    socket.on('recorded:stopped', onStopped);
    return () => {
      socket.off('recorded:step',    onStep);
      socket.off('recorded:stopped', onStopped);
    };
  }, []);

  const handleStartRecording = async () => {
    setRecError(null);
    try {
      await startRecording();
      setRecording(true);
    } catch (e) {
      setRecError(e.message);
    }
  };

  const handleStopRecording = async () => {
    try {
      await stopRecording();
    } catch {}
    setRecording(false);
  };

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.name.endsWith('.csv')) { setError('Please upload a .csv file'); return; }
    setLoading(true); setError(null); setSteps(null); setEditingId(null);
    try {
      const { steps } = await uploadCSV(file);
      setSteps(steps);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  // ── Inline edit helpers ──────────────────────────────────────────────────────
  const startEdit = (step) => {
    setEditingId(step.id);
    setDraft({ ...step });
  };

  const cancelEdit = () => { setEditingId(null); setDraft({}); };

  const saveEdit = () => {
    setSteps(prev => prev.map(s => s.id === editingId ? { ...draft } : s));
    setEditingId(null); setDraft({});
  };

  const deleteStep = (id) => {
    setSteps(prev => prev.filter(s => s.id !== id));
    if (editingId === id) { setEditingId(null); setDraft({}); }
  };

  const addStep = () => {
    const newId = String(Date.now());
    const newStep = { id: newId, action: 'click', target: '', value: '', expected: '', description: 'New step' };
    setSteps(prev => [...(prev || []), newStep]);
    setEditingId(newId);
    setDraft({ ...newStep });
  };

  const moveStep = (id, dir) => {
    setSteps(prev => {
      const idx = prev.findIndex(s => s.id === id);
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  };

  return (
    <div style={{ maxWidth: 1060, margin: '0 auto' }}>

      {/* Drop zone */}
      <div
        onClick={() => inputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 8, padding: '28px 20px', textAlign: 'center',
          cursor: 'pointer', background: dragging ? 'var(--bg3)' : 'var(--bg2)',
          marginBottom: 16, transition: 'all .15s',
        }}
      >
        <div style={{ fontSize: 26, marginBottom: 6 }}>📂</div>
        <div style={{ fontWeight: 600, marginBottom: 3 }}>Drop a CSV file here or click to browse</div>
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
          Columns: <code>id · action · target · value · expected · description</code>
        </div>
        <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files[0])} />
      </div>

      {/* Recording indicator */}
      {recording && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.4)',
          borderRadius: 8, padding: '10px 16px', marginBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--error)', fontSize: 16, animation: 'pulse 1s infinite' }}>⏺</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--error)' }}>Recording…</span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>Interact with the browser — steps are captured automatically</span>
          </div>
          <button className="btn btn-sm" onClick={handleStopRecording}
            style={{ background: 'var(--error)', color: '#fff', fontWeight: 600 }}>
            ⏹ Stop Recording
          </button>
        </div>
      )}

      {recError && (
        <div style={{ color: 'var(--error)', background: 'var(--bg2)', border: '1px solid var(--error)', borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: 12 }}>
          ⚠ {recError}
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 16 }}>Parsing CSV…</div>}

      {error && (
        <div style={{ color: 'var(--error)', background: 'var(--bg2)', border: '1px solid var(--error)', borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: 12 }}>
          ⚠ {error}
        </div>
      )}

      {/* Actions reference + quick-start */}
      {!steps && !loading && (
        <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: 16, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text2)' }}>Supported actions</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {!recording
                ? <button className="btn btn-sm" onClick={handleStartRecording}
                    style={{ background: 'var(--error)', color: '#fff', fontWeight: 600 }}>⏺ Record</button>
                : <button className="btn btn-sm" onClick={handleStopRecording}
                    style={{ background: 'var(--error)', color: '#fff', fontWeight: 600 }}>⏹ Stop</button>
              }
              <button className="btn btn-secondary btn-sm" onClick={addStep}>+ Add step manually</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {ACTION_DOCS.map(([action, desc]) => (
              <div key={action} style={{ background: 'var(--bg3)', padding: '6px 10px', borderRadius: 4, display: 'flex', gap: 10, alignItems: 'baseline' }}>
                <code style={{ color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 11, flexShrink: 0 }}>{action}</code>
                <span style={{ color: 'var(--text3)', fontSize: 10 }}>{desc}</span>
              </div>
            ))}
          </div>
          <SampleDownloads />
        </div>
      )}

      {/* Steps table */}
      {steps && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 600 }}>{steps.length} test steps</span>
              {editingId && <span style={{ fontSize: 11, color: 'var(--accent)' }}>● Editing row {editingId}</span>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {!recording
                ? <button className="btn btn-sm" onClick={handleStartRecording} disabled={!!editingId}
                    style={{ background: 'var(--error)', color: '#fff', fontWeight: 600 }}>⏺ Record</button>
                : <button className="btn btn-sm" onClick={handleStopRecording}
                    style={{ background: 'var(--error)', color: '#fff', fontWeight: 600 }}>⏹ Stop</button>
              }
              <button className="btn btn-secondary btn-sm" onClick={addStep} disabled={!!editingId}>+ Add step</button>
              <button className="btn btn-secondary btn-sm" onClick={() => { setSteps(null); setError(null); setEditingId(null); }}>
                Change file
              </button>
              <button className="btn btn-primary" onClick={() => onImported(steps)} disabled={!!editingId}>
                {editingId ? 'Save edits first' : 'Run Tests →'}
              </button>
            </div>
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg2)' }}>
                  {['#', 'Action', 'Target', 'Value', 'Expected', 'Description', ''].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)', color: 'var(--text3)', fontWeight: 500, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {steps.map((s, i) => {
                  const isEditing = editingId === s.id;
                  const rowBg = isEditing ? 'rgba(99,102,241,.08)' : i % 2 === 0 ? 'transparent' : 'var(--bg2)';
                  const borderColor = isEditing ? 'var(--accent)' : 'var(--border)';

                  return (
                    <tr key={s.id} style={{ borderBottom: `1px solid ${borderColor}`, background: rowBg }}>

                      {/* ID */}
                      <td style={{ ...cellStyle, padding: '7px 10px', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11, width: 36 }}>{s.id}</td>

                      {/* Action */}
                      <td style={{ ...cellStyle, width: 130 }}>
                        {isEditing ? (
                          <select value={draft.action} onChange={e => setDraft(d => ({ ...d, action: e.target.value }))}
                            style={{ ...inputStyle, fontFamily: 'var(--mono)' }}>
                            {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                          </select>
                        ) : (
                          <code style={{ color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 11 }}>{s.action}</code>
                        )}
                      </td>

                      {/* Target */}
                      <td style={{ ...cellStyle, maxWidth: 180 }}>
                        {isEditing ? (
                          <input value={draft.target} onChange={e => setDraft(d => ({ ...d, target: e.target.value }))} style={inputStyle} placeholder="CSS selector or URL" />
                        ) : (
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: 180 }}>{s.target}</span>
                        )}
                      </td>

                      {/* Value */}
                      <td style={{ ...cellStyle, width: 120 }}>
                        {isEditing ? (
                          <input value={draft.value} onChange={e => setDraft(d => ({ ...d, value: e.target.value }))} style={inputStyle} placeholder="value" />
                        ) : (
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)' }}>{s.value}</span>
                        )}
                      </td>

                      {/* Expected */}
                      <td style={{ ...cellStyle, width: 120 }}>
                        {isEditing ? (
                          <input value={draft.expected} onChange={e => setDraft(d => ({ ...d, expected: e.target.value }))} style={inputStyle} placeholder="expected" />
                        ) : (
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)' }}>{s.expected}</span>
                        )}
                      </td>

                      {/* Description */}
                      <td style={{ ...cellStyle }}>
                        {isEditing ? (
                          <input value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} style={{ ...inputStyle, fontFamily: 'var(--sans)' }} placeholder="description" />
                        ) : (
                          <span style={{ color: 'var(--text)' }}>{s.description}</span>
                        )}
                      </td>

                      {/* Row actions */}
                      <td style={{ ...cellStyle, whiteSpace: 'nowrap', width: 140 }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-primary btn-sm" onClick={saveEdit}>Save</button>
                            <button className="btn btn-secondary btn-sm" onClick={cancelEdit}>Cancel</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 4, opacity: 0.6 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.6}>
                            <button title="Edit" className="btn btn-secondary btn-sm" onClick={() => startEdit(s)} disabled={!!editingId}>✎</button>
                            <button title="Move up"   className="btn btn-secondary btn-sm" onClick={() => moveStep(s.id, -1)} disabled={i === 0 || !!editingId}>↑</button>
                            <button title="Move down" className="btn btn-secondary btn-sm" onClick={() => moveStep(s.id,  1)} disabled={i === steps.length - 1 || !!editingId}>↓</button>
                            <button title="Delete"    className="btn btn-secondary btn-sm" style={{ color: 'var(--error)' }} onClick={() => deleteStep(s.id)} disabled={!!editingId}>✕</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text3)' }}>
            Tip: click ✎ to edit a row inline · ↑↓ to reorder · ✕ to delete · + Add step for new rows
          </div>
        </>
      )}
    </div>
  );
}
