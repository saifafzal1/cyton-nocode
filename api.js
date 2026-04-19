const BASE = 'http://localhost:3001';

export async function uploadCSV(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}/api/upload`, { method: 'POST', body: form });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || 'Upload failed');
  }
  return res.json();
}

export async function startRecording() {
  const res = await fetch(`${BASE}/api/record/start`, { method: 'POST' });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Could not start recording'); }
  return res.json();
}

export async function stopRecording() {
  const res = await fetch(`${BASE}/api/record/stop`, { method: 'POST' });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Could not stop recording'); }
  return res.json();
}

export async function executeSteps(steps, options = {}) {
  const res = await fetch(`${BASE}/api/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ steps, ...options }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || 'Execution failed');
  }
  return res.json();
}
