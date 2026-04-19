'use strict';
const { chromium } = require('playwright');

let browser  = null;
let recCtx   = null;
let recPage  = null;
let _onStep  = null;
let _onStop  = null;
let stepSeq  = 0;
let lastNavUrl = null;

// ── CSS selector generator (runs inside the browser page) ──────────────────
const SELECTOR_SCRIPT = `
window.__getSelector = function(el) {
  if (!el || el === document.body) return 'body';
  if (el.id) return '#' + el.id;
  var name = el.getAttribute('name');
  if (name) return el.tagName.toLowerCase() + '[name="' + name + '"]';
  var tid = el.getAttribute('data-testid') || el.getAttribute('data-test-id');
  if (tid) return '[data-testid="' + tid + '"]';
  var path = [];
  var cur = el;
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
`;

// ── Event capture script (runs inside the browser page) ────────────────────
const CAPTURE_SCRIPT = SELECTOR_SCRIPT + `
(function() {
  // Click — only for buttons, links, checkboxes, radios; skip plain text inputs
  document.addEventListener('click', function(e) {
    var el = e.target;
    var tag = el.tagName.toLowerCase();
    var type = (el.getAttribute('type') || '').toLowerCase();
    if (tag === 'input' && ['text','email','password','number','date','search','tel','url'].includes(type)) return;
    if (tag === 'textarea' || tag === 'select') return;
    var text = (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().replace(/\\s+/g,' ').slice(0,60);
    window.__captureAction({ type: 'click', selector: window.__getSelector(el), text: text });
  }, true);

  // Change — fill / select / check / uncheck
  document.addEventListener('change', function(e) {
    var el = e.target;
    var tag = el.tagName.toLowerCase();
    var type = (el.getAttribute('type') || '').toLowerCase();
    if (tag === 'select') {
      var opt = el.options[el.selectedIndex];
      window.__captureAction({ type: 'select', selector: window.__getSelector(el), value: opt ? opt.text : '' });
    } else if (tag === 'input' && type === 'checkbox') {
      window.__captureAction({ type: el.checked ? 'check' : 'uncheck', selector: window.__getSelector(el) });
    } else if (tag === 'input' && type === 'radio') {
      window.__captureAction({ type: 'click', selector: window.__getSelector(el), text: 'radio' });
    } else if ((tag === 'input' || tag === 'textarea') && !['checkbox','radio','submit','button','file','image'].includes(type)) {
      window.__captureAction({ type: 'fill', selector: window.__getSelector(el), value: el.value, label: el.getAttribute('name') || el.id || el.placeholder || '' });
    }
  }, true);
})();
`;

function makeStep(raw) {
  const id = String(Date.now() + (++stepSeq));
  switch (raw.type) {
    case 'navigate':
      return { id, action: 'navigate', target: raw.url, value: '', expected: raw.title || '', description: `Navigate to ${raw.title || raw.url}` };
    case 'click':
      return { id, action: 'click', target: raw.selector, value: '', expected: '', description: `Click ${raw.text || raw.selector}` };
    case 'fill':
      return { id, action: 'fill', target: raw.selector, value: raw.value, expected: '', description: `Fill "${raw.label || raw.selector}" → "${raw.value}"` };
    case 'select':
      return { id, action: 'select', target: raw.selector, value: raw.value, expected: '', description: `Select "${raw.value}"` };
    case 'check':
      return { id, action: 'check', target: raw.selector, value: '', expected: '', description: `Check ${raw.selector}` };
    case 'uncheck':
      return { id, action: 'uncheck', target: raw.selector, value: '', expected: '', description: `Uncheck ${raw.selector}` };
    default:
      return null;
  }
}

async function startRecording(onStep, onStop) {
  if (browser) await stopRecording();

  _onStep = onStep;
  _onStop = onStop;
  stepSeq = 0;
  lastNavUrl = null;

  browser  = await chromium.launch({ headless: false });
  recCtx   = await browser.newContext();

  // Expose Node callback into every page of this context
  await recCtx.exposeFunction('__captureAction', (raw) => {
    const step = makeStep(raw);
    if (step && _onStep) _onStep(step);
  });

  // Inject capture script on every page load/navigation
  await recCtx.addInitScript(CAPTURE_SCRIPT);

  recPage = await recCtx.newPage();

  // Capture navigations
  recPage.on('framenavigated', async (frame) => {
    if (frame !== recPage.mainFrame()) return;
    const url = recPage.url();
    if (!url || url === 'about:blank' || url === lastNavUrl) return;
    lastNavUrl = url;
    await recPage.waitForTimeout(400).catch(() => {});
    const title = await recPage.title().catch(() => '');
    if (_onStep) _onStep(makeStep({ type: 'navigate', url, title }));
  });

  // If user closes the recording browser manually
  browser.on('disconnected', () => {
    cleanup();
    if (_onStop) _onStop();
  });
}

async function stopRecording() {
  const cb = _onStop;
  cleanup();
  try { if (browser) await browser.close(); } catch {}
  browser = null;
  if (cb) cb();
}

function cleanup() {
  _onStep = null;
  _onStop = null;
  recCtx  = null;
  recPage = null;
}

module.exports = { startRecording, stopRecording };
