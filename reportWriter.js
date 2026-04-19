'use strict';
const fs   = require('fs');
const path = require('path');

function saveReport(steps, results) {
  const reportsDir = path.join(__dirname, 'reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  const ts       = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const passed   = results.filter(r => r.passed).length;
  const failed   = results.filter(r => !r.passed).length;
  const jsonPath = path.join(reportsDir, `run-${ts}.json`);
  const htmlPath = path.join(reportsDir, `run-${ts}.html`);

  // JSON report
  fs.writeFileSync(jsonPath, JSON.stringify({
    runAt:   new Date().toISOString(),
    summary: { total: results.length, passed, failed },
    results,
  }, null, 2), 'utf8');

  // HTML report
  const rows = results.map(r => {
    const step = steps.find(s => s.id === r.id) || {};
    const statusClass = r.passed ? 'pass' : 'fail';
    const icon        = r.passed ? '✔' : '✖';
    return `
      <tr class="${statusClass}">
        <td>${r.id}</td>
        <td>${icon}</td>
        <td>${esc(r.description)}</td>
        <td><code>${esc(step.action || '')}</code></td>
        <td><code>${esc(step.target || '')}</code></td>
        <td>${r.error ? `<span class="err">${esc(r.error)}</span>` : '—'}</td>
      </tr>`;
  }).join('');

  const passRate = results.length ? Math.round((passed / results.length) * 100) : 0;

  fs.writeFileSync(htmlPath, `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Test Report — ${ts}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#0f1117; color:#e2e8f0; margin:0; padding:24px; }
    h1   { font-size:18px; margin-bottom:4px; }
    .meta { font-size:12px; color:#64748b; margin-bottom:20px; }
    .summary { display:flex; gap:16px; margin-bottom:24px; }
    .card { background:#161b27; border:1px solid #2a3045; border-radius:8px; padding:14px 20px; min-width:100px; text-align:center; }
    .card .num  { font-size:28px; font-weight:700; }
    .card .lbl  { font-size:11px; color:#64748b; margin-top:2px; }
    .pass .num  { color:#22c55e; }
    .fail .num  { color:#ef4444; }
    .total .num { color:#6366f1; }
    .bar-wrap { background:#1e2535; border-radius:4px; height:6px; margin-bottom:24px; overflow:hidden; }
    .bar-fill { height:100%; background:#22c55e; border-radius:4px; transition:width .4s; }
    table { width:100%; border-collapse:collapse; font-size:12px; }
    th    { background:#161b27; padding:9px 12px; text-align:left; color:#64748b; font-weight:500; border-bottom:1px solid #2a3045; }
    td    { padding:8px 12px; border-bottom:1px solid #1e2535; vertical-align:top; }
    tr.pass td:nth-child(2) { color:#22c55e; }
    tr.fail td:nth-child(2) { color:#ef4444; }
    tr.fail { background:rgba(239,68,68,.04); }
    code  { font-family:'JetBrains Mono',monospace; font-size:11px; color:#6366f1; }
    .err  { color:#ef4444; font-size:11px; }
  </style>
</head>
<body>
  <h1>CSV Test Runner — Execution Report</h1>
  <div class="meta">Run at ${new Date().toLocaleString()} · ${results.length} steps</div>

  <div class="summary">
    <div class="card total"><div class="num">${results.length}</div><div class="lbl">Total</div></div>
    <div class="card pass"><div class="num">${passed}</div><div class="lbl">Passed</div></div>
    <div class="card fail"><div class="num">${failed}</div><div class="lbl">Failed</div></div>
    <div class="card total"><div class="num">${passRate}%</div><div class="lbl">Pass rate</div></div>
  </div>

  <div class="bar-wrap"><div class="bar-fill" style="width:${passRate}%"></div></div>

  <table>
    <thead>
      <tr><th>#</th><th>Status</th><th>Description</th><th>Action</th><th>Target</th><th>Error</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`, 'utf8');

  return { jsonPath, htmlPath };
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { saveReport };
