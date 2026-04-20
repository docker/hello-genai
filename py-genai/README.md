# py-genai — Python Chat Application

Flask-based chat application that connects to a local LLM via [Docker Model Runner](https://docs.docker.com/ai/model-runner/). Supports streaming, persistent sessions, multi-model switching, and a full-featured chat UI.

---

## Running

### With Docker Compose (recommended)

```bash
# From the repo root
docker compose up
```

Open **<http://localhost:8081>**

| Page | URL |
| ---- | --- |
| Chat | <http://localhost:8081/> |
| Preview | <http://localhost:8081/preview> |
| API Docs | <http://localhost:8081/api/docs> |
| Health | <http://localhost:8081/health> |

### Locally against Docker Model Runner

```bash
pip install -r requirements.txt
python app.py
```

Requires a `.env` file (or shell exports) — see [Configuration](#configuration).

---

## Configuration

All settings are read from environment variables. Copy and edit `.env`:

```env
LLAMA_URL=http://127.0.0.1:12434/engines/llama.cpp/v1
LLAMA_MODEL=docker.io/ai/gemma4:latest
AVAILABLE_MODELS=docker.io/ai/gemma4:latest,docker.io/ai/gemma3n:latest
PORT=8081
LOG_LEVEL=INFO
DEBUG=false
DATABASE_PATH=chat_history.db
```

| Variable | Description |
| -------- | ----------- |
| `LLAMA_URL` | Docker Model Runner API base URL |
| `LLAMA_MODEL` | Default model used when no model is selected |
| `AVAILABLE_MODELS` | Comma-separated model IDs shown in the UI dropdown. If unset, auto-discovered from DMR |
| `PORT` | HTTP listen port |
| `LOG_LEVEL` | Python logging level (`DEBUG`, `INFO`, `WARNING`, `ERROR`) |
| `DEBUG` | Flask debug mode (`true` / `false`) |
| `DATABASE_PATH` | Path to the SQLite database file |

---

## Architecture

```text
app.py               Flask app factory — registers all blueprints
config.py            Single source of truth for env-var config
extensions.py        Shared Flask-Caching and Flask-Limiter instances

services/
  llm.py             call_llm() and stream_llm() — OpenAI-compatible HTTP client
                     Gracefully falls back to plain JSON if DMR doesn't support SSE
  history.py         SQLite helpers — sessions, messages, feedback, stats

routes/
  chat.py            POST /api/chat (blocking) · POST /api/stream (SSE)
                     Emits start / token / done events; returns user + assistant message IDs
  models.py          GET /api/models — respects AVAILABLE_MODELS override
  sessions.py        Full session CRUD, pin/unpin, message truncation,
                     auto-title (background thread), message feedback, Markdown export
  stats.py           GET /api/stats — aggregate token usage from SQLite
  health.py          GET /health — checks DMR reachability

static/js/
  api.js             Typed fetch wrappers for every backend endpoint
  chat.js            All chat UI logic:
                       streaming + typing indicator
                       regenerate last response
                       message editing (with DB truncation)
                       search / filter
                       keyboard shortcuts
                       thumbs up/down feedback
                       context window token estimate
                       usage dashboard
                       auto-title trigger after first exchange
  markdown.js        marked + DOMPurify + highlight.js renderer with copy buttons
  models.js          Model selector dropdown — fetches live list from /api/models
  sessions.js        Session sidebar — list, switch, pin, delete
  export.js          Download current session as Markdown
```

---

## API Endpoints

### Chat

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/stream` | Stream response as SSE. Body: `{ message, session_id?, model?, system_prompt? }` |
| `POST` | `/api/chat` | Non-streaming response. Same body as above |

**SSE event types** from `/api/stream`:

| Event field | Description |
|-------------|-------------|
| `start` | Fired once at the start; includes `user_message_id` |
| `token` | One chunk of the streamed response |
| `done` | Stream complete; includes `usage`, `message_id`, `is_first` |
| `error` | Error message string |

### Models

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/models` | Returns `{ models: [], current: "" }` |

### Sessions

| Method | Path | Description |
|--------|------|-------------|
| `GET`    | `/api/sessions` | List all sessions (pinned first) |
| `POST`   | `/api/sessions` | Create session. Body: `{ title?, system_prompt? }` |
| `PATCH`  | `/api/sessions/:id` | Update `title` or `system_prompt` |
| `DELETE` | `/api/sessions/:id` | Delete session and all its messages |
| `POST`   | `/api/sessions/:id/pin` | Body: `{ pinned: true/false }` |
| `POST`   | `/api/sessions/:id/generate-title` | Async LLM title generation. Body: `{ message }` |
| `GET`    | `/api/sessions/:id/messages` | All messages with feedback and token usage |
| `DELETE` | `/api/sessions/:id/messages/from/:msgId` | Delete this message and all that follow |
| `GET`    | `/api/sessions/:id/export` | Download session as `chat-<id>.md` |

### Feedback & Stats

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/messages/:id/feedback` | Body: `{ feedback: "up" \| "down" \| null }` |
| `GET`  | `/api/stats` | `{ total_sessions, total_messages, prompt_tokens, completion_tokens, total_tokens }` |

### Misc

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/health` | `{ status, llm_api, model, timestamp }` |
| `GET` | `/api/docs` | Swagger UI |
| `GET` | `/preview` | Feature overview page |

---

## Database Schema

SQLite database at `DATABASE_PATH` (default `chat_history.db`):

```sql
sessions (
    id            TEXT PRIMARY KEY,
    title         TEXT,
    system_prompt TEXT,
    pinned        INTEGER DEFAULT 0,   -- 1 = pinned to top of sidebar
    created_at    TEXT,
    updated_at    TEXT
)

messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT,
    role        TEXT,                  -- "user" | "assistant"
    content     TEXT,
    token_usage TEXT,                  -- JSON: { prompt_tokens, completion_tokens, total_tokens }
    feedback    TEXT,                  -- "up" | "down" | NULL
    created_at  TEXT
)
```

Columns added by migration are applied safely at startup — existing databases are upgraded automatically.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Shift+Enter` | New line in input |
| `⌘K` / `Ctrl+K` | New chat |
| `⌘L` / `Ctrl+L` | Clear current messages |
| `⌘/` / `Ctrl+/` | Toggle sidebar |
| `Esc` | Stop generation · close modal · close search |

---

## Rate Limits

- Default: 200 requests/day, 50 requests/hour per IP
- `/api/chat` and `/api/stream`: 10 requests/minute per IP

---

## Dependencies

```text
Flask==2.3.3
requests==2.31.0
python-dotenv==1.0.0
Flask-Caching==2.0.2
Flask-Limiter==3.3.1
flask-swagger-ui==4.11.1
gunicorn==21.2.0
```

Frontend libraries loaded from `cdnjs.cloudflare.com`:
- `marked` 9.1.6 — Markdown parsing
- `DOMPurify` 3.0.6 — HTML sanitisation
- `highlight.js` 11.9.0 — Syntax highlighting
- `Font Awesome` 6.4.0 — Icons
