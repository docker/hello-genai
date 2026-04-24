# Hello-GenAI — Python

A Flask-based chat interface for local LLM backends that expose an OpenAI-compatible API (e.g. Docker Model Runner, Ollama, LM Studio).

---

## Features

- **Streaming chat** via Server-Sent Events with live token rendering
- **Persistent sessions** — full chat history stored in SQLite with WAL mode
- **Session management** — pin, rename, delete, and export conversations as Markdown
- **Markdown rendering** — syntax-highlighted code blocks, tables, lists via marked + highlight.js
- **Model selector** — switch between models at runtime
- **Usage dashboard** — token stats across all conversations
- **Message feedback** — thumbs up/down on assistant responses
- **Regenerate & edit** — re-send or edit any previous message
- **System prompt** — per-session custom instructions
- **Dark mode** — persisted in localStorage
- **Toast notifications** — non-blocking feedback for UI actions
- **Rate limiting & caching** via Flask-Limiter and Flask-Caching
- **LLM retry logic** — automatic backoff on transient 429/5xx errors
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
| `DEBUG` | No | `false` | Flask debug mode — **never `true` in production** |

The app exits immediately at startup if `LLAMA_URL` or `LLAMA_MODEL` are missing.

---

## Project Structure

```text
py-genai/
├── app.py               # Application factory
├── config.py            # Centralised configuration + startup validation
├── extensions.py        # Flask-Caching and Flask-Limiter singletons
├── routes/
│   ├── chat.py          # POST /api/chat, POST /api/stream
│   ├── sessions.py      # CRUD /api/sessions, export, feedback
│   ├── models.py        # GET /api/models
│   ├── health.py        # GET /health
│   └── stats.py         # GET /api/stats
├── services/
│   ├── history.py       # SQLite session & message persistence
│   └── llm.py           # LLM HTTP client with retry and streaming
├── static/
│   ├── css/style.css
│   └── js/
│       ├── api.js        # Fetch wrapper + stream parser
│       ├── chat.js       # Send, stream, render, edit, regenerate
│       ├── sessions.js   # Session list, switch, pin, delete
│       ├── models.js     # Model selector
│       ├── markdown.js   # marked + DOMPurify + highlight.js
│       ├── export.js     # Export conversation as Markdown
│       └── toast.js      # Toast notification system
├── templates/
│   ├── index.html        # Main chat UI
│   └── preview.html      # Markdown preview page
├── tests/
│   ├── test_history.py         # Unit tests for history service
│   └── test_chat_validate.py   # Unit tests for chat input validation
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

---

## API Reference

Full interactive docs at `/api/docs` (Swagger UI). Every endpoint has pre-filled example inputs — click any operation and hit **Execute** straight away.

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/chat` | Single-turn chat (non-streaming) |
| `POST` | `/api/stream` | Streaming chat via SSE |
| `GET` | `/api/sessions` | List all sessions |
| `POST` | `/api/sessions` | Create a session |
| `PATCH` | `/api/sessions/<id>` | Update title or system prompt |
| `DELETE` | `/api/sessions/<id>` | Delete a session |
| `POST` | `/api/sessions/<id>/pin` | Pin or unpin a session |
| `GET` | `/api/sessions/<id>/messages` | Get messages for a session |
| `DELETE` | `/api/sessions/<id>/messages/from/<msg_id>` | Truncate messages from a point |
| `GET` | `/api/sessions/<id>/export` | Export session as Markdown file |
| `POST` | `/api/sessions/<id>/generate-title` | Auto-generate session title |
| `POST` | `/api/messages/<id>/feedback` | Set thumbs up/down on a message |
| `GET` | `/api/models` | List available models |
| `GET` | `/api/stats` | Token and session usage stats |
| `GET` | `/health` | Health check |

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

**Diagnose** — check which models are actually available:

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

- The app sets `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, and a `Content-Security-Policy` header on every response.
- Internal LLM errors are logged server-side and never exposed to API clients — clients receive a generic error message.
- Session titles and system prompts are capped at 80 and 2000 characters respectively to prevent unbounded database growth.
- `.env` and `*.db` files are excluded from version control via `.gitignore`. Never commit secrets.
