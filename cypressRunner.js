'use strict';
const { spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');

const DEFAULT_SPEC_DIR = path.join(__dirname, 'cypress', 'e2e');
const CYPRESS_BIN = path.join(__dirname, 'node_modules', '.bin', 'cypress');

function resolveSpecPath(outputDir) {
  const dir = outputDir
    ? (path.isAbsolute(outputDir) ? outputDir : path.join(__dirname, outputDir))
    : DEFAULT_SPEC_DIR;
  return path.join(dir, '_generated.cy.js');
}

function saveSpec(spec, specPath) {
  const dir = path.dirname(specPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(specPath, spec, 'utf8');
}

function runCypress(spec, onLog, outputDir) {
  const SPEC_PATH = resolveSpecPath(outputDir);
  return new Promise((resolve) => {
    saveSpec(spec, SPEC_PATH);
    onLog(`[cypress] Spec saved → ${SPEC_PATH}`);

    const proc = spawn(CYPRESS_BIN, ['run', '--spec', SPEC_PATH, '--headless'], {
      cwd: __dirname,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    });

    let output = '';

    const handleData = (data) => {
      const text = data.toString();
      output += text;
      for (const line of text.split('\n')) {
        const trimmed = line.trimEnd();
        if (trimmed) onLog(trimmed);
      }
    };

    proc.stdout.on('data', handleData);
    proc.stderr.on('data', handleData);

    proc.on('close', (exitCode) => {
      const passMatch = output.match(/(\d+) passing/);
      const failMatch = output.match(/(\d+) failing/);
      const passed = passMatch ? parseInt(passMatch[1], 10) : 0;
      const failed = failMatch ? parseInt(failMatch[1], 10) : 0;

      // Grab the error block for auto-fix context
      const errorLines = output
        .split('\n')
        .filter(l => /AssertionError|Error:|^\s+\d+\)/.test(l))
        .join('\n');

      resolve({ passed, failed, exitCode, output, errorOutput: errorLines });
    });

    proc.on('error', (err) => {
      const msg = `[ERROR] ${err.message}`;
      onLog(msg);
      resolve({ passed: 0, failed: 0, exitCode: 1, output: msg, errorOutput: msg });
    });
  });
}

module.exports = { runCypress };
