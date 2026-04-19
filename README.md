# cyton-nocode

A CSV-driven browser test runner built with React + Playwright. Import a structured CSV of test steps, execute them directly in a real browser, and review results — no LLM, no code generation.

## Features

- **Import CSV** — upload or manually build a list of test steps with inline editing, reordering, and deletion
- **Execute & Results** — run steps in a real Chromium browser with live log streaming and per-step pass/fail status
- **Debug mode** — pause after every step; edit, retry, jump back to a previous step, or skip forward
- **Step delay** — configurable delay between steps (0–3000 ms)
- **Reports** — JSON + styled HTML report saved to `reports/` after each run
- **Bootstrap datepicker support** — reliable fill for jQuery/Bootstrap datepicker widgets

## CSV Format

| Column | Description |
|--------|-------------|
| `id` | Unique step identifier |
| `action` | One of the supported actions below |
| `target` | CSS selector or URL |
| `value` | Text to type, option label, or milliseconds (for `wait`) |
| `expected` | Expected title substring, text, or URL fragment |
| `description` | Human-readable step label |

### Supported Actions

| Action | Parameters |
|--------|-----------|
| `navigate` | `target` = URL, `expected` = page title substring |
| `click` | `target` = CSS selector |
| `fill` | `target` = CSS selector, `value` = text to type |
| `select` | `target` = CSS selector, `value` = option label |
| `check` | `target` = CSS selector (checkbox) |
| `uncheck` | `target` = CSS selector (checkbox) |
| `assert_visible` | `target` = CSS selector |
| `assert_text` | `target` = CSS selector, `expected` = text substring |
| `assert_url` | `expected` = URL substring |
| `wait` | `value` = milliseconds |
| `press_key` | `value` = key name (`Enter`, `Escape`, `Tab`, `ArrowDown`, `Control+a`, …), `target` = CSS selector to focus first (optional) |

A sample 16-step test for the [CURA demo app](https://katalon-demo-cura.herokuapp.com/) is included at `samples/cura-tests.csv`.

## Getting Started

### Prerequisites

- Node.js 18+
- Playwright Chromium (`npx playwright install chromium`)

### Install & Run

```bash
npm install
npm run dev
```

Opens the UI at `http://localhost:5173`. The backend runs on port `3001`.

## Project Structure

```
├── App.jsx              # Main shell — tab routing, shared state
├── Panel1Import.jsx     # CSV upload + step table with inline editing
├── Panel2Execute.jsx    # Execution panel with debug controls and log stream
├── api.js               # Frontend API calls
├── socket.js            # Socket.io client
├── server.js            # Express + Socket.io backend
├── executor.js          # Playwright step runner
├── csvParser.js         # CSV → steps array
├── reportWriter.js      # JSON + HTML report generator
└── samples/
    └── cura-tests.csv   # Example test suite
```
