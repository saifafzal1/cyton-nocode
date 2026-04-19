'use strict';
const http = require('http');

const MODEL     = 'qwen2.5-coder:14b';
const OLLAMA_URL = 'http://localhost:11434/api/chat';

// ── Prompt builder ─────────────────────────────────────────────────────────
function buildGeneratePrompt(steps, results) {
  const stepRows = steps.map(s =>
    `${s.id} | ${s.action} | ${s.target || ''} | ${s.value || ''} | ${s.expected || ''} | ${s.description}`
  ).join('\n');

  const resultRows = results?.length
    ? results.map(r => `${r.id} | ${r.passed ? 'PASS' : 'FAIL'} | ${r.error || ''}`).join('\n')
    : 'Not yet executed';

  return `You are a Cypress test automation expert. Convert these structured test steps into a complete, working Cypress spec file.

## Test Steps
id | action | target | value | expected | description
${stepRows}

## Playwright Execution Results (context only)
id | status | error
${resultRows}

## Action mapping rules (follow exactly)
- navigate  → cy.visit(target); if expected set: cy.title().should('include', 'EXPECTED');
- click     → cy.get('TARGET').click();
- fill      → cy.get('TARGET').clear().type('VALUE');
- select    → cy.get('TARGET').select('VALUE');
- check     → cy.get('TARGET').check();
- uncheck   → cy.get('TARGET').uncheck();
- assert_visible → cy.get('TARGET').should('be.visible');
- assert_text    → cy.get('TARGET').should('contain.text', 'EXPECTED');
- assert_url     → cy.url().should('include', 'EXPECTED');
- wait      → cy.wait(VALUE);
- press_key → cy.get('TARGET').type('{KEY}'); (map: Enter→{enter} Escape→{esc} Tab→{tab} ArrowDown→{downarrow})
              if no target: cy.get('body').type('{KEY}');

## Additional rules
- Use Cypress 13 syntax — never use async/await
- Use the EXACT selectors from the steps — do not invent new ones
- Add cy.wait(500) after every navigate step
- Add defaultCommandTimeout of 15000 at the top
- Wrap all steps in describe/it blocks
- Return ONLY raw JavaScript — no markdown fences, no explanations

## Output template
describe('Generated Test Suite', () => {
  it('should complete the full flow', () => {
    Cypress.config('defaultCommandTimeout', 15000);
    // steps here
  });
});`;
}

function buildFixPrompt(spec, errorOutput) {
  return `You are a Cypress test automation expert. The spec below has errors. Fix it.

## Current spec
${spec}

## Error output
${errorOutput}

## Rules
- Fix ONLY the broken parts — keep the same describe/it structure
- Do not change passing steps
- Return ONLY the corrected JavaScript, no markdown, no explanations`;
}

// ── Ollama streaming call ──────────────────────────────────────────────────
function callOllama(prompt, onToken) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    });

    const req = http.request(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let full = '';
      res.on('data', (chunk) => {
        for (const line of chunk.toString().split('\n')) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line);
            const token = obj.message?.content || '';
            if (token) { full += token; onToken(token); }
          } catch {}
        }
      });
      res.on('end', () => resolve(full));
    });

    req.on('error', (e) => reject(new Error(`Ollama unreachable: ${e.message}. Is 'ollama serve' running?`)));
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Ollama request timed out')); });
    req.write(body);
    req.end();
  });
}

function stripFences(code) {
  return code
    .replace(/^```(?:javascript|js|typescript|ts)?\s*\n?/gm, '')
    .replace(/^```\s*$/gm, '')
    .trim();
}

// ── Public API ─────────────────────────────────────────────────────────────
async function generateCypressSpec(steps, results, onToken) {
  const raw = await callOllama(buildGeneratePrompt(steps, results), onToken);
  return stripFences(raw);
}

async function fixCypressSpec(spec, errorOutput, onToken) {
  const raw = await callOllama(buildFixPrompt(spec, errorOutput), onToken);
  return stripFences(raw);
}

module.exports = { generateCypressSpec, fixCypressSpec };
