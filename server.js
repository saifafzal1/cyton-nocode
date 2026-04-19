'use strict';
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors    = require('cors');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const { parseCSV }          = require('./csvParser');
const { executeSteps }      = require('./executor');
const { saveReport }        = require('./reportWriter');
const { startRecording, stopRecording } = require('./recorder');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: 'http://localhost:5173', methods: ['GET', 'POST'] },
});

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '5mb' }));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({ dest: uploadDir });

// Emit real-time log to all connected clients
global.emitLog = (message, level = 'info') => {
  io.emit('log', { message, level, ts: new Date().toISOString() });
};

// Emit per-step status update
global.emitStep = (stepId, status, error = null) => {
  io.emit('step', { stepId, status, error });
};

// POST /api/upload — parse CSV, return steps array
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  try {
    const steps = parseCSV(req.file.path);
    res.json({ steps });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/execute — run all steps in Playwright, stream logs via socket
app.post('/api/execute', async (req, res) => {
  const { steps, debug = false, stepDelay = 0 } = req.body;
  if (!Array.isArray(steps) || steps.length === 0)
    return res.status(400).json({ error: 'steps array is required.' });

  // Reset run-level flags
  global.shouldStop = false;
  global._debugResolve = null;

  if (debug) {
    global.debugPause = (stepId, error = null) => new Promise((resolve) => {
      global._debugResolve = resolve;
      io.emit('step:paused', { stepId, error });
    });
  } else {
    global.debugPause = null;
  }

  try {
    const results = await executeSteps(steps, { debug, stepDelay });
    const { jsonPath, htmlPath } = saveReport(steps, results);
    global.emitLog(`Report saved → ${jsonPath}`, 'ok');
    global.emitLog(`HTML report → ${htmlPath}`, 'ok');
    res.json({ results, reportPaths: { json: jsonPath, html: htmlPath } });
  } catch (err) {
    global.emitLog(`Fatal: ${err.message}`, 'error');
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// POST /api/record/start — open a browser and stream captured steps via socket
app.post('/api/record/start', async (_req, res) => {
  try {
    await startRecording(
      (step) => io.emit('recorded:step', step),
      ()     => io.emit('recorded:stopped'),
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/record/stop — close the recording browser
app.post('/api/record/stop', async (_req, res) => {
  try {
    await stopRecording();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  socket.on('disconnect', () => console.log(`Client disconnected: ${socket.id}`));

  socket.on('step:continue', () => {
    if (global._debugResolve) {
      global._debugResolve({ action: 'continue' });
      global._debugResolve = null;
    }
  });

  socket.on('step:retry', (updatedStep) => {
    if (global._debugResolve) {
      global._debugResolve({ action: 'retry', updatedStep });
      global._debugResolve = null;
    }
  });

  socket.on('step:stop', () => {
    global.shouldStop = true;
    if (global._debugResolve) {
      global._debugResolve({ action: 'stop' });
      global._debugResolve = null;
    }
  });

  socket.on('step:jump', ({ targetIndex }) => {
    if (global._debugResolve) {
      global._debugResolve({ action: 'jump', targetIndex });
      global._debugResolve = null;
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`[nocode] Server running on http://localhost:${PORT}`));
