'use strict';
const { chromium } = require('playwright');

async function executeSteps(steps, { debug = false, stepDelay = 0 } = {}) {
  // Use a Map so re-running a step overwrites its previous result
  const resultMap = new Map();

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page    = await context.newPage();

  global.emitLog('Browser launched', 'info');
  if (debug)     global.emitLog('Debug mode ON — execution will pause after each step', 'warn');
  if (stepDelay) global.emitLog(`Step delay: ${stepDelay}ms`, 'info');

  let i = 0;
  while (i < steps.length) {
    if (global.shouldStop) {
      global.emitLog('Execution stopped by user', 'warn');
      break;
    }

    const step = steps[i];
    const result = {
      id:          step.id,
      description: step.description,
      action:      step.action,
      passed:      false,
      error:       null,
    };

    global.emitLog(`▷ [${i + 1}] ${step.description}`, 'info');
    global.emitStep(step.id, 'running');

    try {
      await runStep(page, step);
      result.passed = true;
      global.emitLog(`✔ [${i + 1}] ${step.description}`, 'ok');
      global.emitStep(step.id, 'passed');
    } catch (err) {
      result.error = err.message;
      global.emitLog(`✖ [${i + 1}] ${step.description}: ${err.message}`, 'error');
      global.emitStep(step.id, 'failed', err.message);
    }

    resultMap.set(step.id, result);

    if (stepDelay > 0 && !global.shouldStop) {
      await page.waitForTimeout(stepDelay).catch(() => {});
    }

    let nextIndex = i + 1;

    // Debug pause — supports retry, jump-back, jump-forward, continue, stop
    if (debug && global.debugPause && !global.shouldStop) {
      let currentError = result.error;
      let retrying = true;
      while (retrying && !global.shouldStop) {
        const { action, updatedStep, targetIndex } = await global.debugPause(step.id, currentError);

        if (action === 'retry' && updatedStep) {
          global.emitLog(`↩ Retrying [${i + 1}]: ${updatedStep.description}`, 'warn');
          global.emitStep(updatedStep.id, 'running');
          try {
            await runStep(page, updatedStep);
            result.passed = true;
            result.error  = null;
            currentError  = null;
            resultMap.set(updatedStep.id, { ...result });
            global.emitLog(`✔ (retry) ${updatedStep.description}`, 'ok');
            global.emitStep(updatedStep.id, 'passed');
          } catch (err) {
            result.passed = false;
            result.error  = err.message;
            currentError  = err.message;
            resultMap.set(updatedStep.id, { ...result });
            global.emitLog(`✖ (retry) ${updatedStep.description}: ${err.message}`, 'error');
            global.emitStep(updatedStep.id, 'failed', err.message);
          }
          // Stay in retry loop so user can retry again or navigate

        } else if (action === 'jump') {
          nextIndex = targetIndex;
          retrying  = false;

        } else {
          retrying = false; // 'continue' or 'stop'
        }
      }
    }

    if (global.shouldStop) break;
    i = nextIndex;
  }

  await browser.close();

  // Return results in original step order, only for steps that ran
  const results = steps.filter(s => resultMap.has(s.id)).map(s => resultMap.get(s.id));
  const passed = results.filter(r => r.passed).length;
  global.emitLog(`Done — ${passed}/${results.length} steps passed`, passed === results.length ? 'ok' : 'error');
  return results;
}

async function runStep(page, step) {
  const { action, target, value, expected } = step;
  const TIMEOUT = 12000;

  switch (action) {
    case 'navigate':
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
      await page.waitForTimeout(600);
      if (expected) {
        const title = await page.title();
        if (!title.includes(expected))
          throw new Error(`Title "${title}" does not contain "${expected}"`);
      }
      break;

    case 'click':
      await page.waitForSelector(target, { state: 'visible', timeout: TIMEOUT });
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {}),
        page.click(target),
      ]);
      break;

    case 'fill': {
      await page.waitForSelector(target, { state: 'visible', timeout: TIMEOUT });

      // For Bootstrap datepicker widgets: use the API directly so the internal
      // model and the displayed value stay in sync, then immediately hide the
      // picker so it cannot interfere with the next step's click.
      const isDatepicker = await page.evaluate(({ sel, val }) => {
        const el = document.querySelector(sel);
        if (!el || !window.$ || !$(el).data('datepicker')) return false;
        $(el).datepicker('update', val);
        $(el).datepicker('hide');
        $(el).trigger('change');
        return true;
      }, { sel: target, val: value });

      if (!isDatepicker) {
        // Regular input — fill directly
        await page.fill(target, value);

        // Native-setter fallback for widgets that intercept input events
        const actual = await page.inputValue(target).catch(() => null);
        if (actual !== value) {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(150);
          await page.evaluate(({ sel, val }) => {
            const el = document.querySelector(sel);
            if (!el) return;
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(el, val);
            el.dispatchEvent(new Event('input',  { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }, { sel: target, val: value });
        }
      }

      // Hard verify — throw so the step shows failed rather than silently continuing
      const final = await page.inputValue(target).catch(() => null);
      if (final !== value) {
        throw new Error(`fill: could not set "${target}" to "${value}" (got "${final}")`);
      }
      break;
    }

    case 'select':
      await page.waitForSelector(target, { state: 'visible', timeout: TIMEOUT });
      await page.selectOption(target, { label: value });
      break;

    case 'check':
      await page.waitForSelector(target, { timeout: TIMEOUT });
      await page.check(target);
      break;

    case 'uncheck':
      await page.waitForSelector(target, { timeout: TIMEOUT });
      await page.uncheck(target);
      break;

    case 'assert_visible':
      await page.waitForSelector(target, { state: 'visible', timeout: TIMEOUT });
      break;

    case 'assert_text': {
      await page.waitForSelector(target, { timeout: TIMEOUT });
      const text = await page.textContent(target);
      if (!text || !text.includes(expected))
        throw new Error(`Expected "${expected}" in element text, got "${text?.trim()}"`);
      break;
    }

    case 'assert_url': {
      const url = page.url();
      if (!url.includes(expected))
        throw new Error(`Expected URL to contain "${expected}", got "${url}"`);
      break;
    }

    case 'wait':
      await page.waitForTimeout(parseInt(value, 10) || 1000);
      break;

    default:
      throw new Error(`Unknown action: "${action}"`);
  }
}

module.exports = { executeSteps };
