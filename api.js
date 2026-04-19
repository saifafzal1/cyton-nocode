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

export async function generateCypressSpec(steps, results) {
  const res = await fetch(`${BASE}/api/cypress/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ steps, results }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || 'Generation failed');
  }
  return res.json();
}

export async function fixCypressSpec(spec, errorOutput) {
  const res = await fetch(`${BASE}/api/cypress/fix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spec, errorOutput }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || 'Fix failed');
  }
  return res.json();
}

export async function runCypressSpec(spec) {
  const res = await fetch(`${BASE}/api/cypress/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spec }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || 'Run failed');
  }
  return res.json();
}
