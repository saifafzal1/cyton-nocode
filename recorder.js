'use strict';
const { chromium } = require('playwright');

let browser    = null;
let recCtx     = null;
let recPage    = null;
let pollTimer  = null;
let _onStep    = null;
let _onStop    = null;
let stepSeq    = 0;
let lastNavUrl = null;

// ── Injected into every page ───────────────────────────────────────────────
// Buffers raw DOM events into window.__recordBuffer[].
// No cross-context function calls — Node.js drains the buffer via evaluate().
const INIT_SCRIPT = `
window.__recordBuffer = window.__recordBuffer || [];

window.__getSelector = function(el) {
  if (!el || el === document.body) return 'body';
  if (el.id) return '#' + el.id;
  var n = el.getAttribute('name');
  if (n) return el.tagName.toLowerCase() + '[name="' + n + '"]';
  var t = el.getAttribute('data-testid') || el.getAttribute('data-test-id');
  if (t) return '[data-testid="' + t + '"]';
  var path = [], cur = el;
  while (cur && cur !== document.body && cur !== document.documentElement) {
    if (cur.id) { path.unshift('#' + cur.id); break; }
    var tag = cur.tagName.toLowerCase();
    var parent = cur.parentElement;
    if (parent) {
      var same = Array.from(parent.children).filter(function(s){ return s.tagName === cur.tagName; });
      if (same.length > 1) tag += ':nth-of-type(' + (same.indexOf(cur) + 1) + ')';
    }
    path.unshift(tag);
    cur = cur.parentElement;
  }
  return path.join(' > ') || el.tagName.toLowerCase();
};

(function() {
  // Clicks — skip plain text inputs (change event captures those)
  document.addEventListener('click', function(e) {
    var el = e.target;
    var tag = el.tagName.toLowerCase();
    var type = (el.getAttribute('type') || '').toLowerCase();
    if (tag === 'input' && ['text','email','password','number','date','search','tel','url'].indexOf(type) !== -1) return;
    if (tag === 'textarea' || tag === 'select') return;
    var text = (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    window.__recordBuffer.push({ type: 'click', selector: window.__getSelector(el), text: text });
  }, true);

  // Fills, selects, check/uncheck
  document.addEventListener('change', function(e) {
    var el = e.target;
    var tag = el.tagName.toLowerCase();
    var type = (el.getAttribute('type') || '').toLowerCase();
    if (tag === 'select') {
      var opt = el.options[el.selectedIndex];
      window.__recordBuffer.push({ type: 'select', selector: window.__getSelector(el), value: opt ? opt.text : '' });
    } else if (tag === 'input' && type === 'checkbox') {
      window.__recordBuffer.push({ type: el.checked ? 'check' : 'uncheck', selector: window.__getSelector(el) });
    } else if (tag === 'input' && type === 'radio') {
      window.__recordBuffer.push({ type: 'click', selector: window.__getSelector(el), text: 'radio' });
    } else if ((tag === 'input' || tag === 'textarea') && ['checkbox','radio','submit','button','file','image'].indexOf(type) === -1) {
      window.__recordBuffer.push({ type: 'fill', selector: window.__getSelector(el), value: el.value, label: el.getAttribute('name') || el.id || el.placeholder || '' });
    }
  }, true);
})();
`;

// ── Convert raw browser event → step object ────────────────────────────────
function makeStep(raw) {
  const id = String(Date.now() + (++stepSeq));
  switch (raw.type) {
    case 'navigate':
      return { id, action: 'navigate', target: raw.url,      value: '', expected: raw.title || '', description: `Navigate to ${raw.title || raw.url}` };
    case 'click':
      return { id, action: 'click',    target: raw.selector, value: '', expected: '', description: `Click ${raw.text || raw.selector}` };
    case 'fill':
      return { id, action: 'fill',     target: raw.selector, value: raw.value, expected: '', description: `Fill "${raw.label || raw.selector}" → "${raw.value}"` };
    case 'select':
      return { id, action: 'select',   target: raw.selector, value: raw.value, expected: '', description: `Select "${raw.value}"` };
    case 'check':
      return { id, action: 'check',    target: raw.selector, value: '', expected: '', description: `Check ${raw.selector}` };
    case 'uncheck':
      return { id, action: 'uncheck',  target: raw.selector, value: '', expected: '', description: `Uncheck ${raw.selector}` };
    default: return null;
  }
}

// ── Poll the page buffer every 300 ms ─────────────────────────────────────
async function drainBuffer() {
  if (!recPage) return;
  try {
    const events = await recPage.evaluate(() => {
      const buf = window.__recordBuffer || [];
      window.__recordBuffer = [];
      return buf;
    });
    for (const raw of events) {
      const step = makeStep(raw);
      if (step && _onStep) _onStep(step);
    }
  } catch { /* page mid-navigation — ignore */ }
}

// ── Public API ─────────────────────────────────────────────────────────────
async function startRecording(onStep, onStop) {
  if (browser) await stopRecording();

  _onStep    = onStep;
  _onStop    = onStop;
  stepSeq    = 0;
  lastNavUrl = null;

  browser = await chromium.launch({ headless: false });
  recCtx  = await browser.newContext();

  // Inject buffer script into every page / navigation
  await recCtx.addInitScript({ content: INIT_SCRIPT });

  recPage = await recCtx.newPage();

  // Capture page navigations on the Node side
  recPage.on('framenavigated', async (frame) => {
    if (frame !== recPage.mainFrame()) return;
    const url = recPage.url();
    if (!url || url === 'about:blank' || url === lastNavUrl) return;
    lastNavUrl = url;
    await recPage.waitForTimeout(400).catch(() => {});
    const title = await recPage.title().catch(() => '');
    if (_onStep) _onStep(makeStep({ type: 'navigate', url, title }));
  });

  // Start polling the DOM event buffer
  pollTimer = setInterval(drainBuffer, 300);

  // If user closes the recording browser manually
  browser.on('disconnected', () => {
    _cleanup();
    if (_onStop) { _onStop(); _onStop = null; }
  });
}

async function stopRecording() {
  const cb = _onStop;
  _cleanup();
  try { if (browser) await browser.close(); } catch {}
  browser = null;
  if (cb) cb();
}

function _cleanup() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  _onStep = null;
  recCtx  = null;
  recPage = null;
}

module.exports = { startRecording, stopRecording };
