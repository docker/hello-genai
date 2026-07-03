# Hello-GenAI — Python

A Flask-based chat interface for local LLM backends that expose an OpenAI-compatible API (e.g. Docker Model Runner, Ollama, LM Studio).

---

## Features

- **Streaming chat** via Server-Sent Events with live token rendering
- **Context window management** — conversation history is automatically trimmed to a token budget (`LLM_CONTEXT_MAX_TOKENS`), oldest turns first, so long chats never overflow the model context
- **Persistent sessions** — full chat history stored in SQLite with WAL mode
- **Session management** — pin, rename (double-click), delete, export, and import conversations
- **Session sidebar** — date-grouped headings (Today / Yesterday / Last 7 Days / Older), search, skeleton loaders, per-session model badge, and drag-to-resize
- **Full-text search** — sidebar search matches message content across all conversations (SQLite FTS5, prefix matching) with highlighted snippets
- **Markdown rendering** — syntax-highlighted code blocks with language labels, tables, lists via marked + highlight.js
- **Reasoning model support** — `<think>…</think>` blocks (DeepSeek-R1, Qwen, …) render as collapsible "thought process" sections
- **Model selector** — switch between models at runtime
- **Compare mode** — send each message to two models side by side; only the primary model's response is saved to history
- **Model settings** — per-request temperature slider (0–2) and max-tokens control, validated and clamped server-side
- **System prompt presets** — save, load, and delete named prompt presets, stored in the database (existing localStorage presets are migrated automatically)
- **File attachments** — attach a text/code file and its contents are inserted into your message as a fenced code block
- **Response metrics** — time-to-first-token, tokens/sec, and token counts shown per message (token usage requested via `stream_options.include_usage`)
- **Usage dashboard** — cumulative token stats across all conversations
- **Message actions** — thumbs up/down feedback, copy full response, regenerate, and inline edit
- **Interrupted-response tracking** — responses stopped mid-stream are saved with a `complete=0` flag and shown with a "stopped" badge
- **Conversation import/export** — export as Markdown or re-importable JSON, import from JSON
- **Welcome screen** — centred hero with gradient icon and suggestion chips
- **Dark mode** — persisted in localStorage with smooth CSS transitions
- **Relative timestamps** — "just now", "5m ago", absolute on hover
- **Scroll-to-bottom FAB** — floating button appears when scrolled up in a long conversation
- **Toast notifications** — non-blocking feedback for all UI actions
- **Rate limiting & caching** via Flask-Limiter and Flask-Caching
- **LLM retry logic** — automatic backoff on transient 429/5xx errors
- **Fully offline frontend** — marked, DOMPurify, highlight.js, and Font Awesome are vendored under `static/vendor/`; no CDN needed and the CSP allows no external or inline scripts
- **REST API** with fully interactive Swagger UI at `/api/docs`

---

## Quick Start

### 1. Clone and configure

```bash
cp .env.example .env
# Edit .env — set LLAMA_URL and LLAMA_MODEL at minimum
```

### 2. Run locally

```bash
pip install -r requirements.txt
python app.py
```

Open [http://localhost:8081](http://localhost:8081).

### 3. Run with Docker

```bash
docker compose up --build
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the required values.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `LLAMA_URL` | **Yes** | — | Base URL of your LLM backend (e.g. `http://127.0.0.1:12434/engines/llama.cpp/v1`) |
| `LLAMA_MODEL` | **Yes** | — | Model name passed to the `/chat/completions` endpoint |
| `AVAILABLE_MODELS` | No | — | Comma-separated list of models shown in the UI dropdown |
| `PORT` | No | `8081` | Port the app listens on |
| `LOG_LEVEL` | No | `INFO` | `DEBUG` \| `INFO` \| `WARNING` \| `ERROR` |
| `DATABASE_PATH` | No | `chat_history.db` | Path to the SQLite database file |
| `LLM_TIMEOUT` | No | `60` | LLM request timeout in seconds |
| `LLM_MAX_RETRIES` | No | `2` | Retries on transient LLM errors (429, 5xx) |
| `LLM_CONTEXT_MAX_TOKENS` | No | `3000` | Approx. token budget for context sent to the model; oldest turns are trimmed first. Set below your model's `context_size`, leaving headroom for the response |
| `MAX_MESSAGE_LEN` | No | `32000` | Maximum user message length in characters |
| `RATE_LIMIT_STORAGE_URI` | No | `memory://` | Flask-Limiter storage backend. Use a shared store (e.g. `redis://…`) when running multiple workers |
| `DEBUG` | No | `false` | Flask debug mode — **never `true` in production** |

The app exits immediately at startup if `LLAMA_URL` or `LLAMA_MODEL` are missing.

---

## Project Structure

```text
py-genai/
├── app.py               # Application factory + CSP headers
├── config.py            # Centralised configuration + startup validation
├── extensions.py        # Flask-Caching and Flask-Limiter singletons
├── routes/
│   ├── chat.py          # POST /api/chat, POST /api/stream (param clamping, save flag)
│   ├── sessions.py      # CRUD /api/sessions, export (md/json), import, feedback, search, presets
│   ├── models.py        # GET /api/models
│   ├── health.py        # GET /health (+ ?deep=1 model check)
│   └── stats.py         # GET /api/stats
├── services/
│   ├── history.py       # SQLite persistence, FTS5 search index, presets
│   └── llm.py           # LLM HTTP client with retry, streaming, context trimming
├── static/
│   ├── css/style.css
│   ├── vendor/           # Vendored marked, DOMPurify, highlight.js, Font Awesome
│   └── js/
│       ├── main.js       # App bootstrap (module entrypoint)
│       ├── api.js        # Fetch wrapper + stream parser + search/presets
│       ├── chat.js       # Send, stream, compare mode, attachments, settings, presets
│       ├── sessions.js   # Session list, groups, rename, full-text search, model badge
│       ├── models.js     # Model selector
│       ├── markdown.js   # marked + DOMPurify + highlight.js + <think> blocks
│       ├── export.js     # Export (Markdown/JSON) and import (JSON)
│       └── toast.js      # Toast notification system
├── templates/
│   ├── index.html        # Main chat UI
│   └── preview.html      # Feature/marketing preview page
├── tests/
│   ├── test_history.py         # Unit tests for history service
│   ├── test_chat_validate.py   # Unit tests for chat input validation
│   └── test_routes.py          # Route-level tests with a mocked LLM
├── .env.example          # Environment variable reference
├── Dockerfile
└── docker-compose.yml
```

---

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Enter` | Send message |
| `Shift + Enter` | New line in input |
| `Esc` | Stop generation / close modal / close search |
| `⌘ / Ctrl + K` | New chat |
| `⌘ / Ctrl + L` | Clear current chat |
| `⌘ / Ctrl + /` | Toggle sidebar |
| `⌘ / Ctrl + F` | Toggle message search |

---

## API Reference

Full interactive docs at `/api/docs` (Swagger UI). Every endpoint has pre-filled example inputs — click any operation and hit **Execute** straight away.

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/chat` | Single-turn chat (non-streaming) |
| `POST` | `/api/stream` | Streaming chat via SSE |
| `GET` | `/api/search?q=` | Full-text search across all conversations |
| `GET` | `/api/sessions` | List all sessions |
| `POST` | `/api/sessions` | Create a session |
| `POST` | `/api/sessions/import` | Import a conversation from JSON |
| `PATCH` | `/api/sessions/<id>` | Update title, system prompt, or model |
| `DELETE` | `/api/sessions/<id>` | Delete a session |
| `POST` | `/api/sessions/<id>/pin` | Pin or unpin a session |
| `GET` | `/api/sessions/<id>/messages` | Get messages for a session |
| `DELETE` | `/api/sessions/<id>/messages/from/<msg_id>` | Truncate messages from a point |
| `GET` | `/api/sessions/<id>/export` | Export as Markdown, or re-importable JSON with `?format=json` |
| `POST` | `/api/sessions/<id>/generate-title` | Auto-generate session title |
| `POST` | `/api/messages/<id>/feedback` | Set thumbs up/down on a message |
| `GET` | `/api/presets` | List system prompt presets |
| `POST` | `/api/presets` | Create a system prompt preset |
| `DELETE` | `/api/presets/<id>` | Delete a preset |
| `GET` | `/api/models` | List available models |
| `GET` | `/api/stats` | Token and session usage stats |
| `GET` | `/health` | Health check; `?deep=1` also verifies the configured model is loaded |

### Chat / Stream request body

Both `/api/chat` and `/api/stream` accept optional inference parameters:

```json
{
  "message":       "Hello!",
  "session_id":    "...",
  "model":         "docker.io/ai/gemma3n:latest",
  "system_prompt": "You are a concise assistant.",
  "temperature":   0.7,
  "max_tokens":    512,
  "save":          true
}
```

`temperature` is clamped server-side to `0–2` and `max_tokens` to `1–32768`. `save: false` runs the request with session context but persists nothing — used by the UI's compare mode for the secondary model.

### Import format

`POST /api/sessions/import` accepts:

```json
{
  "title":         "My Chat",
  "system_prompt": null,
  "messages": [
    { "role": "user",      "content": "Hello" },
    { "role": "assistant", "content": "Hi there!" }
  ]
}
```

---

## Running Tests

```bash
pip install pytest
python -m pytest tests/ -v
```

---

## Rate Limits

- Default: 200 requests/day, 50 requests/hour per IP
- Chat endpoints (`/api/chat`, `/api/stream`): 10 requests/minute per IP

### Running with multiple workers

Rate limiting and the response cache are **in-memory and per-process** by default. If you run gunicorn with more than one worker, each worker keeps its own counters, so effective limits are multiplied by the worker count. Either:

- run a single worker with threads: `gunicorn -w 1 --threads 8 "app:create_app()"`, or
- point the limiter at a shared store: `RATE_LIMIT_STORAGE_URI=redis://localhost:6379`

SQLite in WAL mode handles concurrent workers fine for this workload.

---

## Docker Details

The image runs as a non-root user (`nomadicmehul`). The healthcheck polls `/health` every 30 seconds. `curl` is installed in the runtime image to support the healthcheck.

Port mapping: host `8081` → container `8081` (configured via `PORT` env var).

To use [Docker Model Runner](https://docs.docker.com/ai/model-runner/) models, set `LLAMA_URL` to the Docker Model Runner endpoint and list models in `AVAILABLE_MODELS`. The `models:` block in `docker-compose.yml` pre-pulls models via Docker Desktop's AI integration.

Before starting the app, verify which models DMR actually has loaded:

```bash
curl http://127.0.0.1:12434/v1/models
```

The `id` values in the response are the exact strings to use for `LLAMA_MODEL` and `AVAILABLE_MODELS`. A model that appears in `docker-compose.yml` but is not yet pulled will not appear in this list and will cause a 404 at inference time.

---

## Troubleshooting

### `404 Not Found` — wrong engine path in `LLAMA_URL`

**Symptom:**

```text
HTTPError: 404 Client Error: Not Found for url:
http://127.0.0.1:12434/engines/v1/chat/completions
```

**Cause:** `LLAMA_URL` is missing the `llama.cpp` engine segment. Docker Model Runner routes requests through a named engine sub-path; `/engines/v1` does not exist.

**Fix:**

```env
# Wrong
LLAMA_URL=http://127.0.0.1:12434/engines/v1

# Correct
LLAMA_URL=http://127.0.0.1:12434/engines/llama.cpp/v1
```

---

### `404 Not Found` — model not loaded in DMR

**Symptom:**

```text
HTTPError: 404 Client Error: Not Found for url:
http://127.0.0.1:12434/engines/llama.cpp/v1/chat/completions
```

**Cause:** The URL path is correct but the model named in `LLAMA_MODEL` is not currently loaded in Docker Model Runner. DMR returns 404 for any model that has not been pulled.

**Diagnose** — the app can check this for you:

```bash
curl "http://localhost:8081/health?deep=1"
# → { "status": "degraded", "model_loaded": false, ... } if the model isn't pulled
```

Or check which models are actually available directly:

```bash
curl http://127.0.0.1:12434/v1/models
```

The `id` field in each entry is the exact string DMR accepts. Set `LLAMA_MODEL` (and `AVAILABLE_MODELS`) to one of those values.

**Fix:**

```env
# Only use a model that appears in the curl output above
LLAMA_MODEL=docker.io/ai/gemma3n:latest
```

Always use the full registry path (`docker.io/ai/<name>:<tag>`), not the short form (`ai/<name>:latest`).

To pull an additional model, add it to the `models:` block in `docker-compose.yml` and run `docker compose up`.

---

## Security Notes

- The app sets `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, and a strict `Content-Security-Policy` on every response. All frontend assets are served from `self` — no CDN origins, and no inline scripts (Swagger UI at `/api/docs` is the one scoped exception).
- Internal LLM errors are logged server-side and never exposed to API clients — clients receive a generic error message.
- Session titles and system prompts are capped at 80 and 2000 characters respectively; user messages at `MAX_MESSAGE_LEN` (default 32000) to prevent unbounded database growth.
- Temperature and max_tokens values from requests are validated, typed, and clamped server-side (`0–2` and `1–32768`).
- `.env` and `*.db` files are excluded from version control via `.gitignore`. Never commit secrets.
