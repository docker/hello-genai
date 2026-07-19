# Hello-GenAI — Next (FastAPI · Postgres · Redis · Celery)

A modern, async, realtime rebuild of the Hello-GenAI local-LLM chat app — multi-user,
durable, and horizontally decomposed into API, workers, CLI, and a React SPA.

## Architecture

| Layer | Tech |
| --- | --- |
| API | **FastAPI** (async, Pydantic v2, auto OpenAPI at `/docs`) + an **OpenAI-compatible** `/v1` surface |
| Database | **PostgreSQL** + **pgvector** via SQLAlchemy 2.0 async (asyncpg) |
| Migrations | **Alembic** (async env, pgvector-aware) — applied on API startup |
| Cache / broker / pub-sub | **Redis** |
| Background jobs | **Celery** on two isolated queues — `default` (titles, doc ingestion, **scheduled prompts**, token cleanup, **daily-stats rollup**) and `memory` (extraction, embedding, "remember this", backfill) — plus **beat** |
| Task monitoring | **Flower** (`:5555`) |
| Realtime | **WebSockets** (`/ws/chat`) with Redis pub/sub fan-out; SSE fallback (`/api/chat/stream`) |
| CLI | **Typer** (`genai …`) |
| Frontend | **React + Vite + TypeScript**, **Tailwind CSS + shadcn/ui** (Radix primitives, lucide-react icons, class-based light/dark) |
| Auth | JWT (register/login), bcrypt, per-user data isolation, personal access tokens |

```text
src/genai/
├── core/          config · db (+pgvector) · redis · security · logging
├── domain/        SQLAlchemy models + Pydantic schemas
├── repositories.py  async data access
├── services/      llm · embeddings · rag · memory · tools · chat orchestration
├── api/routers/   auth · sessions · projects · documents · memories · library · models · misc · chat · data
├── ws/            websocket chat + pub/sub
├── tasks/         celery app (queue routing) + jobs
├── cli/           typer commands
└── main.py        FastAPI app factory
alembic/           versioned schema (initial migration + async env)
frontend/          React SPA (components, components/ui shadcn primitives, lib, markdown, Tailwind)
```

## Run it

```bash
cp .env.example .env          # set SECRET_KEY, LLAMA_URL/MODEL, EMBED_MODEL
docker compose up --build
```

Services: `postgres · redis · api · worker · memory-worker · beat · flower · frontend`.

- App: <http://localhost:8080>  ·  Preview/landing: <http://localhost:8080/preview>  ·  API docs: <http://localhost:8080/docs>  ·  Flower: <http://localhost:5555>

### Using it from another device (phone, tablet, second laptop)

Everything is served **same-origin on port 8080** — nginx reverse-proxies `/api`,
`/v1`, `/ws` and `/docs` to the API container. So just open
`http://<your-machine-LAN-IP>:8080` on any device on the same network and log in
normally; there is no hostname compiled into the frontend and no CORS to configure.

> `VITE_API_URL` in `.env` must stay **empty** for this. Setting it bakes an absolute
> host into the JS bundle at build time — if that host is `localhost`, a phone will
> resolve it to *itself* and every login/register will fail. Only set it to target a
> backend on a genuinely different origin, and then add that origin to `CORS_ORIGINS`.

Mobile-specific handling, all of it deliberate:

- **The product tour opens in the same tab on phones.** iOS Safari ships with *Block Pop-ups* enabled and can silently swallow a `target="_blank"` navigation, so small/touch screens navigate in-place (desktop keeps the new tab, and ⌘/Ctrl-click still works).
- **`index.html` and `/preview` are served `no-cache`.** They name the hashed asset bundles, so a stale copy would otherwise pin a device to an old — or deleted — build. `/assets/*` stays `immutable`.
- **Touch targets are ≥44px** (the iOS HIG / WCAG minimum), and the mobile drawer is sized with `100dvh` rather than `inset-y-0`: a full-height fixed panel measures the *layout* viewport, which includes the strip behind the collapsing URL bar, and that pushed the drawer footer off-screen.

The LLM backend is your existing Docker Model Runner on the host (`host.docker.internal:12434`).
Pull an embedding model (`docker model pull ai/mxbai-embed-large`) to enable RAG + semantic memory (pgvector).

Postgres and Redis are published to the host for external tools (psql/DBeaver, VS Code Redis).
Override the host ports if they collide with a local install:

```bash
POSTGRES_HOST_PORT=15432   # default 5432 → postgresql://genai:genai@localhost:5432/genai
REDIS_HOST_PORT=16379      # default 6379 → redis://localhost:6379 (no auth)
```

## Frontend

A clean, modern SPA built with **Tailwind CSS** and **shadcn/ui**, using the **"Vega"** design system:

| Token | Value |
| --- | --- |
| Style | **Vega** |
| Base color | **Slate** (cool professional grays) |
| Theme | **Blue** (`--brand` / `--ring` / focus = `221 83% 53%` light · `217 91% 60%` dark) |
| Chart color | **Neutral** |
| Heading / Font | **Inter** (variable, self-hosted via `@fontsource-variable/inter`) |
| Icons | **Lucide** (`lucide-react`) |
| Radius | **Small** (`--radius: 0.3rem`; the `rounded-*` scale derives a subtle sm→3xl hierarchy from it) |
| Menus | **Solid**, with **bold** accent on the active item |

All shell surfaces (navbar, sidebar/drawer, scrims, modal overlays) are **fully opaque** — no translucency or backdrop-blur — so nothing bleeds through, on mobile or desktop.

Built on Radix primitives (Dialog, Popover, Dropdown, Tooltip, Switch, Slider, Tabs, Avatar…) with a `cn()` (clsx + tailwind-merge) utility, a split-screen login, a caret-anchored notification center, and a command surface responsive down to mobile.

The values above are the **defaults** — most are user-customizable (see below).

### Avatars — DiceBear, rendered locally

**Profile → Profile.** Avatars are [DiceBear](https://www.dicebear.com) SVGs generated **offline** by the backend with the official `dicebear-core` + `dicebear-styles` packages — no calls to `api.dicebear.com`, so it works fully air-gapped. (The older `dicebear` PyPI package is only an HTTP wrapper and was deliberately *not* used.)

- **29 styles** in three groups — *Abstract* (Glyphs, Identicon, Shapes, Shape Grid, Rings, Stripes, Triangles, Glass), *Characters* (Thumbs, Adventurer, Avataaars, Bottts, Lorelei, Pixel Art, Open Peeps, Notionists, …) and *Initials*.
- **Any seed** — pick one of 30 variants, type your own word, or hit **Surprise me** for a random style + seed + background.
- **Full customisation**, matching the DiceBear schema exactly: background colour, `borderRadius` (0–50, 50 = circle), `scale` (0.5–2×), `rotate` (0–360°) and `flip` (`none | horizontal | vertical | both`).
- Served from `GET /api/avatars/{style}/{seed}.svg?…` — deterministic, so responses are `immutable` cached forever and memoised in-process. Public by design (an `<img>` can't send a bearer token), which is safe because output is a pure function of a public `(style, seed)` pair — seeds are opaque indices, **never** your email. Style names are allow-listed and seeds regex-validated.
- Legacy `builtin:<n>` emoji avatars are **migrated on read** to a DiceBear seed, so existing users never lose their picture.

**Uploaded photos get a real editor** — drag to reposition, scroll/slider to zoom (1–4×), rotate (±180° or 90° steps), and flip, inside a circular frame. Preview and export share one `draw()` routine, so what you see is exactly what is saved (a 256×256 JPEG data URL).

### Appearance — customizable, per user

**Profile → Appearance.** Every control applies **live** and is saved to the **account** (`users.ui_prefs`, JSONB), so your look follows you to any device — not just the browser you set it in.

| Preference | Options |
| --- | --- |
| Theme | Light · Dark · **System** (tracks the OS live) |
| Accent | **13 colours** — Blue · Violet · Emerald · Amber · Rose · Cyan · Graphite · Indigo · Teal · Orange · Pink · Slate · Crimson |
| Gradient | **None** + Sunset · Ocean · Forest · Grape · Ember · Steel (duotone wash over accent-filled surfaces) |
| Typeface | **8 faces** — Inter · Plus Jakarta Sans · Source Serif 4 · JetBrains Mono · Manrope · Outfit · Figtree · Lora |
| Corners | Sharp · Small · Medium · Round |
| Density | Compact · Comfortable · Spacious |
| Chat width | Narrow · Medium · Wide · Full |
| Reduce motion | On / off |

Per-conversation controls live in the model popover: **temperature**, **max tokens**
(0 = let the model decide) and **JSON mode** (`response_format`), each persisted on
the session. Saved **presets/personas** get a deterministic DiceBear face derived
from their name, so switching persona is visual.

How it works:

- **Tokens, not components.** A preference only re-points CSS custom properties via `data-*` attributes on `<html>` (`data-accent`, `data-gradient`, `data-font`, `data-radius`, `data-density`, `data-chat-width`, `data-motion`). Every surface reads those tokens, so one attribute repaints the whole app — no component knows a theme exists.
- **Server is the source of truth**, `localStorage` is a cache: the inline script in `index.html` applies the cached prefs **before first paint** (no flash), then `/api/auth/me` hydrates the account's copy on login and it wins.
- **Validated, closed set.** `UiPrefs` is a Pydantic model with `Literal` values and `extra="forbid"` — unknown keys or bogus values are rejected with `422` rather than persisted, so stored JSON always renders. The client re-normalizes defensively too.
- **Accessible by construction.** Every accent's foreground was WCAG-checked against its surface in *both* modes; all pass **AA (≥4.5:1)** — which is why light Amber/Orange use ink text and the dark accents do too. A candidate Lime accent was **dropped** because light Lime only reached 4.38:1.
- **Gradients are additive, not a replacement.** A gradient paints `background-image` over brand-filled surfaces while the flat `--brand` stays as the fallback and continues to drive borders, text, focus rings and the login mesh.
- Writes are **debounced** (400 ms), so dragging through options doesn't spam the API.

### Chat

- **Windowed history** — long threads render the most recent 80 messages with a *Show earlier messages* control, and every message carries `content-visibility: auto` so off-screen turns skip layout and paint. (Chosen over windowed virtualization: message heights vary wildly and the view is pinned to the bottom mid-stream, which makes true virtualization fragile here.)
- **Frame-batched streaming** — tokens accumulate and repaint at most once per animation frame instead of once per token.
- **Edit & resend** — ✎ on your own message: edit the text, and the thread truncates there and re-asks (`PATCH /api/messages/{id}`).
- **Voice** — dictate into the composer and 🔊 read replies aloud (Web Speech API). Dictation needs a secure context, so the mic button only appears on `localhost`/HTTPS (see backlog **B15**).
- **Tokens/sec HUD** — live generation speed next to the running token count in Analytics.
- **Fast streaming render** — markdown is parsed once per settled change and throttled (~12/s) while a reply streams, instead of re-parsing the whole answer on every token; `Message` is memoised behind stable handler identities so a streaming reply no longer re-renders every message in the thread.
- Live **WebSocket streaming** with reasoning `<think>` blocks, inline **tool-call** chips, per-model badges, and **per-message token usage**.
- **Rich markdown + math** for both your messages and replies: GitHub-flavored markdown, **syntax-highlighted code** (highlight.js) with a language label and **copy button**, tables, lists, links, and **LaTeX math** via KaTeX (`$\rightarrow$`, inline `$…$`, display `$$…$$`, `\(…\)`, `\[…\]`).
- Modern chat bubbles (iMessage-style tails) with your **profile avatar** on your messages, **per-message actions** on hover — Copy, **Add to memory** (saves your text selection or the whole message), and 👍/👎 **feedback**.
- **Stop / abandon** an in-flight response, and **delete a turn** — removing your message *and its reply* from the database.
- **Branching** navigation (`‹ n versions ›`) across alternate assistant replies.
- **Inline compare** — pick a second model in the composer and each reply streams **side by side** (primary saved, secondary ephemeral) with a two-sided word **Diff** toggle.

### Attachments & vision

Attach images to a message for multimodal models — **click the paperclip, paste from
the clipboard, or drag-and-drop** onto the composer (up to 4). Each image is
**downscaled to ≤1024px and re-encoded as JPEG in the browser** before it is sent,
because a raw phone photo is multi-MB and the data URL is inlined into the request.
Thumbnails appear above the input with per-image remove, and on your message bubble
after sending. The backend already spoke OpenAI's `image_url` content-part format
(`ChatIn.images`); tools are automatically disabled for image turns.

Attachments are **persisted** (`messages.images`, JSONB) so they reload with the
conversation.

### Composer (rich input)

- Markdown **formatting toolbar** — bold, italic, inline code, code block, link, list, quote.
- **Keyboard shortcuts** — ⌘/Ctrl **B / I / E / K**; Enter to send, Shift+Enter for newline.
- **Slash commands** — type `/` for an autocomplete of **18 built-in commands** (`/summarize`, `/tldr`, `/eli5`, `/review`, `/fix`, `/refactor`, `/tests`, `/document`, `/translate`, `/brainstorm`, `/pros-cons`, …) plus any you save in the Library; your custom ones override built-ins by trigger.
- **Preset picker** — apply a saved system prompt (persona) to steer replies.
- **Compare picker** — turn on inline side-by-side comparison against another model.
- **Live markdown preview** toggle.

### Workspace

- **Command palette** (⌘K) — run any action and full-text-search conversations.
- **Projects** — create/select/delete; new chats scope to the active project.
- **Model details** — ℹ️ panel for the **currently selected** model: architecture, parameters, quantization, size on disk, context window, and per-model settings, pulled live from the model runner.
- **Compare models** — a modal to run one prompt (in the **same rich composer** used in chat) across several models with a merged diff (separate from inline compare).
- **Blind arena** — flip **Blind mode** in Compare and the model names are replaced by *Model A* / *Model B* until you vote, so you judge the answer rather than the label. Vote a winner or a tie, names reveal, and the result is recorded (`POST /api/arena/vote`). A **leaderboard** in Usage & Analytics ranks models by win rate — **ties count as half a win**, and equal win rates are broken by match count so a 1–0 model never outranks a 20–5 one. Votes store winner/loser rather than a score, so the ranking can be recomputed with any rating scheme later.
- **Library** — manage **presets** (reusable system prompts) and **slash templates**.
- **Knowledge base** — upload txt/md/pdf; chunked + embedded on the worker for RAG (per-project scoping).
- **Analytics** — a live-refreshing dashboard built to a **dataviz method**: a total-tokens **hero figure**, KPI stat tiles, an interactive **tokens-over-time area chart** (crosshair + tooltip, 7/30/90-day range), and **ranked per-model bars** (single neutral hue, tip labels, hover) with a **Chart/Table** toggle. Neutral chart palette, theme-token colors validated ≥3:1 in both light & dark; status (👍/👎) always paired with an icon.
- **Live Activity** — auto-refreshes every 2.5 s with a ticking "updated Ns ago" readout so you can see it's live: **memory creation** (total/embedded, last hour, last 24h, most-recent snippets) and **live model performance** (messages, tokens, avg tokens/reply, replies/hour).
- **Profile** — a spacious **two-pane settings** modal (section rail + content pane): **Profile** (display name, photo editor, DiceBear avatar studio), **Appearance** (theme, 13 accents, 6 gradients, 8 typefaces, corners, density, chat width, reduce motion — saved per user), **Personalization** (custom instructions), **Memory settings**, **Security** (`POST /api/auth/change-password`, interactive login only), and **API tokens**.
- **Memory** — view/add/delete durable facts recalled across conversations via pgvector.
- **Data menu** — export a chat (**JSON / Markdown / HTML**), download a **full backup**, **import** a chat or backup, **clear all** conversations. All actions also live in ⌘K.
- **Starred messages** — bookmark any message (☆ in the hover actions) and browse them all in one place from the navbar or ⌘K. Backed by `POST /api/messages/{id}/bookmark` + `GET /api/bookmarks`; starring is optimistic and reverts if the server rejects it.
- **Resizable sidebar** (drag handle, persisted), **modern dialogs** (no browser `prompt`/`confirm`), light/dark, and a **mobile drawer** navbar.

### Agentic tools & internet

The assistant can call built-in tools mid-reply when it needs them: a safe **calculator**, **current date/time**, **search past conversations**, **retrieve uploaded documents** (RAG), and — when `WEB_SEARCH_ENABLED` is on — **`web_search`** (DuckDuckGo, no API key) and **`fetch_url`** to read a page. This gives the model **live internet access** only when the question calls for it.

## Semantic search & related conversations

Messages carry their own embedding (`messages.embedding`, `vector`), so the app can
search by **meaning** as well as by keyword.

- **Search** — `GET /api/search?q=…&semantic=true`, surfaced as a **"Meaning"** toggle
  in the ⌘K palette. Keyword stays the default because it wins for exact strings,
  identifiers and error messages; semantic finds the conversation you can *describe*
  but can't quote. Results show a match percentage. Falls back to keyword when
  embeddings are disabled, so the endpoint always returns something useful.
- **Related conversations** — `GET /api/sessions/{id}/related` ranks other chats by
  embedding **centroid** (the average of a conversation's message vectors), shown as
  a "Related" strip in the sidebar. Hidden entirely when there is nothing close, so
  it never renders an empty stub.
- **Embedding happens on the beat-scheduled backfill**, not on the request path, so
  chat latency is untouched and history fills in gradually. The index is a
  **partial HNSW** (`WHERE embedding IS NOT NULL`), which stays small while most
  historical rows are still un-embedded.

> **Thresholds are measured, not guessed.** Against `mxbai-embed-large`, genuine
> topical matches score ~0.60–0.69 while a nonsense query still reaches ~0.36–0.46
> against unrelated rows — so the search floor is **0.55**, sitting in that gap. An
> initial guess of 0.35 returned junk for "zebra quantum ballet".

## Memory (auto + manual, on a dedicated worker)

Auto-extraction **de-duplicates semantically**, not just by exact string: the
extractor rewording a fact it already stored ("The user lives in Berlin" vs "Lives
in Berlin") would otherwise accumulate near-duplicates that crowd out the recall
budget. New facts are compared against stored vectors — and against others in the
same batch — and skipped above a **0.82** cosine similarity. Measured, again:
rephrasings land at ~0.83–0.89 and unrelated facts at ~0.39–0.62; an initial guess
of 0.94 would have meant the check never fired. Manually added memories are never
de-duplicated — an explicit add is always honoured. Degrades to exact-match when
embeddings are off.

- **Auto-generation**: after each message a Celery task extracts durable facts about the user.
- **Add from chat**: the per-message *Add to memory* action queues the selected snippet.
- **Recall**: relevant memories are injected into the prompt via pgvector semantic search.
- **Per-user settings** (Profile → Memory, persisted on the user row): toggle auto-remember, tune **max stored** (total cap), **recalled per reply** (top-K injected), and **saved per message** (auto-extraction cap), plus a **customizable extraction prompt** — pick a preset (Balanced / Remember more / Only essentials / Work & projects) or write your own; blank falls back to the built-in default. Enforced in the memory service per user.
- **Live & notified**: the Memory panel auto-refreshes (polling + post-reply + on-add) with a "Live" badge, and new memories the worker creates surface as **dismissible toasts** and land in a **notification center** (bell in the navbar) — a shadcn popover panel with per-item dismiss and "Clear all". Toasts render in a dedicated root-level host (above modals) and auto-dismiss after a few seconds.
- **Isolation**: all memory work (extract, embed, remember, nightly backfill) runs on the **`memory` queue**, served by a dedicated **`memory-worker`** — the `default` worker handles auto-titles and document ingestion. `POST /api/memories/remember` enqueues (202) so it never blocks the request.

## Personal access tokens (PAT)

Long-lived Bearer tokens for API/automation, separate from the short-lived login JWT.

- **Opaque + hashed at rest** — a token looks like `genai_pat_<43 chars>`; only its peppered **SHA-256** is stored, and the plaintext is shown **once** at creation.
- **Limits** — max **3 active** per user (enforced under an advisory lock, no race), default **90-day** expiry, **365-day** cap; all configurable via `PAT_*` settings.
- **Use it** — `Authorization: Bearer genai_pat_…` authenticates every route a login JWT does. Managing tokens and editing your profile require an interactive login, so a leaked PAT can't entrench itself.
- **Full CRUD** — **rename** (`PATCH`), **revoke** (soft, keeps the row for audit — `POST /{id}/revoke`), and **delete** (hard, removes the row from storage — `DELETE /{id}`). Expiry is enforced at request time; a daily Celery beat task purges expired/revoked rows past the 30-day retention window.
- **Surfaces** — the **Access tokens** panel in your profile (create → copy-once, inline rename, list with status/last-used, revoke, delete), the `genai token create/list/revoke` CLI, and the Swagger **Authorize** button.

```text
POST   /api/user/tokens        # create (login only) → returns plaintext once
GET    /api/user/tokens        # list (no secrets)
DELETE /api/user/tokens/{id}   # revoke   ·   DELETE /api/user/tokens  # revoke all
```

Set `PAT_PEPPER` to a long random value, separate from `SECRET_KEY`.

## Developer API (OpenAI-compatible)

Point any OpenAI SDK or tool at this server and authenticate with a personal access
token (or a login JWT):

| Endpoint | Notes |
| --- | --- |
| `POST /v1/chat/completions` | Streaming and non-streaming |
| `GET /v1/models` | Lists what the runner has loaded |
| `GET /v1/models/{model}` | Single model. Uses a `:path` parameter because model ids contain slashes (`ai/gemma3`) |
| `POST /v1/embeddings` | Same embedding backend that powers RAG and semantic memory |

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8080/v1", api_key="genai_pat_…")

client.chat.completions.create(model="…", messages=[{"role": "user", "content": "hi"}])
client.embeddings.create(model="…", input=["alpha", "beta"])   # -> 1024-dim vectors
client.models.retrieve("ai/gemma3")
```

`/v1/embeddings` accepts a string or an array of strings (max 256 per request) and
returns objects in request order. It returns **503** when `EMBED_MODEL` is unset,
rather than pretending to work — the same graceful-degradation rule the rest of the
embedding features follow. Token usage is reported as an explicit approximation,
since the runner does not return exact counts for embeddings.

## Personalization & chat controls

- **Custom instructions** — a global persona + "about me" (profile) injected into every conversation.
- **Per-conversation settings** — a **temperature** slider in the header (Precise ↔ Creative) plus model and max-tokens, saved per chat (`PATCH /api/sessions/{id}`) and restored when you reopen it.
- **Structured output** — set `response_format: "json"` per chat/request to force valid JSON.
- **Suggested follow-ups** — three tappable next-question chips after each reply.
- **Edit & regenerate** — edit a message (`PATCH /api/messages/{id}`) and re-run a branch.
- **Image input** — multimodal messages via `images` (data URLs) for vision-capable models.
- **Share** — public read-only links: `POST /api/sessions/{id}/share` → `GET /api/shared/{token}` (no auth), viewable at `#/shared/<token>`.

## Automation, admin & analytics

- **Scheduled prompts** — recurring prompts run by **Celery beat**; each run lands in a new conversation. Full CRUD at `/api/schedules` — a modern manager modal to add, **rename, reschedule, edit the prompt**, enable/pause, **run now**, and delete.
- **Preview page** — a standalone, self-contained landing page at **`/preview`** (nginx-served) styled to match the app's **Vega / Slate / Blue / small-radius** look (light & dark): hero, feature grid, a **"closer look"** with workspace/compare/analytics mockups, and a live OpenAI-API sample. Linked from the **login page** ("Take a tour →") and the **app sidebar** ("Preview"); all links open in a new tab and the API-docs links resolve to the backend host.
- **Admin panel** — `is_admin` (auto-promoted via `ADMIN_EMAILS`), admin-gated `/api/admin/*`: global overview + user management (grant admin, activate/deactivate).
- **Cost & latency** — per-message latency captured; token cost from `COST_PER_MTOK_*`; both surfaced per-model in analytics.
- **Time-series** — per-user daily usage rolled up hourly into `daily_stats`; `GET /api/stats/timeseries` powers a 30-day sparkline.

## Data: export / import / backup / clear

`GET /api/sessions/{id}/export?format=html` renders a **self-contained transcript** —
no external CSS, fonts or scripts, so it opens identically on any machine, offline,
and **prints straight to PDF** (`@media print` rules included, dark-mode aware).
Message content is HTML-escaped, so a transcript can never inject markup into the
exported document.

Per-user, multi-tenant endpoints (also surfaced in the UI data menu and ⌘K):

| Endpoint | Purpose |
| --- | --- |
| `GET /api/sessions/{id}/export?format=json\|md` | Download one chat (JSON round-trips through import) |
| `POST /api/sessions/import` | Import a single chat |
| `GET /api/backup` | Full backup — sessions+messages, presets, memories, templates |
| `POST /api/backup` | Restore a full backup |
| `DELETE /api/sessions` | Clear all conversations (keeps presets/templates/memory) |

## Feature parity with the Flask app

Streaming chat, reasoning `<think>` blocks, inline **tool calling**, **RAG** (pgvector), **persistent memory**,
**projects** (scoped), conversation **branching**, **bookmarks**, **presets** + **slash commands**, live **model
discovery**, per-model **analytics**, full-text **search**, model **compare + diff**, export/import/backup/clear, deep
**health**. New here: multi-user auth, durable Postgres, isolated background workers, **live web search**, a **model
details** panel, realtime multi-device sync, an **OpenAI-compatible API**, **personal access tokens**, **custom
instructions**, **per-conversation settings** + **structured output**, **suggested follow-ups**, **edit & regenerate**,
**image input**, **public share links**, **scheduled prompts**, an **admin panel**, **cost/latency + time-series
analytics**, and a management CLI.

## Database migrations (Alembic)

The schema is versioned with Alembic; the `api` service runs `alembic upgrade head` on startup.

```bash
docker compose exec api alembic upgrade head                        # apply migrations
docker compose exec api alembic revision --autogenerate -m "add x"  # after editing models
docker compose exec api alembic check                               # fail on model/migration drift
docker compose exec api alembic downgrade -1                        # roll back one step
```

`alembic/env.py` is async-aware (asyncpg), creates the `vector` extension, and renders pgvector `Vector` columns.
An existing DB created via `genai db-init` can be adopted with `alembic stamp head`.

## CI

`.github/workflows/py-genai-next-ci.yml` runs on changes under `py-genai-next/`: ruff + unit tests, an Alembic job
(upgrade → `alembic check` drift guard → downgrade) against a real pgvector Postgres, a frontend typecheck + build,
and API/frontend Docker image builds.

## CLI

```bash
genai db-init                              # create pgvector + tables
genai user create you@example.com secret   # + seeds slash templates
genai ingest paper.pdf --email you@example.com
genai chat "hello" --email you@example.com
genai models
```

## Tests

```bash
pip install -e ".[dev]"
pytest                # infra-free unit tests
```

## Persistence

State lives in two **named, persistent** Docker volumes that survive `docker compose down` and rebuilds:

| Volume | Mount | Holds |
| --- | --- | --- |
| `py-genai-next-postgres-data` | `postgres:/var/lib/postgresql/data` | all app data (users, chats, memory, tokens, …) |
| `py-genai-next-redis-data` | `redis:/data` | Redis AOF (`--appendonly yes`) — cache, Celery broker/results |

Only `docker compose down -v` (or `docker volume rm`) deletes them. Back up Postgres with
`docker exec py-genai-next-postgres-1 pg_dump -U genai genai > backup.sql`.

## Security & image hygiene

Images are scanned with **Docker Scout**; base images and dependencies are kept current:

- **Base images**: backend on **`python:3.12-alpine`** (musl, perl-free — carries none of the unfixable Debian perl advisories; `apk upgrade` applied), frontend on **`node:22-alpine`** (LTS) → **`nginx:alpine`** (`apk upgrade` applied). Build with `docker compose build --pull` to refresh them.
- **Patched dependencies** (resolved CVEs): replaced **`python-jose` → `PyJWT 2.13.0`** (removes CVE-2024-33663 critical *and* drops the `ecdsa`/`rsa`/`cryptography` chain incl. the unfixable `ecdsa` Minerva high); `fastapi 0.115.6 → 0.139.0` pulling `starlette 0.41 → 1.3.1` (3× SSRF/DoS highs); `python-multipart 0.0.20 → 0.0.32` (path-traversal + DoS highs); plus `uvicorn` and `pydantic` bumps.
- **Result**: the backend image scans **0 Critical / 0 High** (only lower-severity Medium/Low advisories remain, none with a high-impact fix outstanding). Frontend has no fixable critical/high.
- Re-scan any time: `docker scout cves py-genai-next-backend:latest`.

### Install it as an app (PWA)

The app ships a web manifest, maskable icons and an offline-shell service worker,
so it can be installed via **Add to Home Screen** and run fullscreen with no URL bar
(which also sidesteps the mobile `dvh` viewport quirk entirely).

The worker is deliberately conservative: `/api`, `/ws` and `/v1` are **never** cached,
navigations are **network-first** so a fresh deploy always wins while online and only
fall back to the cached shell when offline, and `/assets/*` is cache-first because it
is content-addressed. `sw.js` and the manifest are themselves served `no-cache`, so a
device can never be pinned to an old worker.

> **Service workers require a secure context.** Over `http://<LAN-IP>` the browser does
> not expose `navigator.serviceWorker` at all, so offline support is inactive there —
> it works on `localhost` today and everywhere once TLS lands (**B15**). iOS can still
> add the app to the home screen from the manifest + `apple-touch-icon`.

## Backlog (not yet implemented)

Pick an item by its number to implement it in a later session. Numbers are stable —
implemented items move to the feature docs above and are struck through here.

**Done:** ~~B1~~ windowed/skip-paint threads · ~~B2~~ rAF-batched streaming ·
~~B4~~ JSON mode · ~~B5~~ edit & resend · ~~B6~~ per-session max tokens ·
~~B9~~ persisted attachments · ~~B11~~ voice in/out · ~~B12~~ persona faces ·
~~B13~~ tokens/sec HUD · ~~B14~~ usage streaks · ~~B7~~ starred messages · ~~B8~~ PWA.

**Blocked, not skipped:** *B19 (`/v1/audio/transcriptions`)* — the model runner
returns 404 for that path and serves no speech model, so the route would always
fail; it needs Whisper first. *B20 (KV/prompt-cache reuse)* — cache reuse lives in
the inference server, not this codebase.

**B3 — Model warm-up.** Ping the model runner on app load / session open so the
first reply of a session doesn't pay cold-start latency.

### B15 — HTTPS / TLS termination

Everything currently runs over **plain HTTP**. That is fine on `localhost`, but has a
real consequence when you open the app from another device on the LAN:
**`navigator.clipboard` is a secure-context API**, so on `http://<LAN-IP>:8080` the four
copy actions (copy code block, copy message, copy API token, copy share link) silently
do nothing — they are guarded with `navigator.clipboard?.`, so they fail without an error.
Serving over HTTPS fixes all four.

The application code is already HTTPS-ready — no app changes required:

- the WebSocket picks its scheme from the page (`location.protocol === "https:" ? "wss" : "ws"`);
- everything is same-origin behind nginx, so there is no mixed-content or CORS work.

Remaining work is nginx + compose only: add a `listen 443 ssl` server block, mount a
certificate, redirect `80 → 443`, and publish `8443:443`. The open decision is **how the
certificate is trusted on a phone**:

| Approach | Trusted on phone | Trade-off |
| --- | --- | --- |
| Self-signed | ⚠️ warning to click through | Fastest; secure-context APIs work once bypassed, but iOS nags |
| **mkcert local CA** | ✅ after a one-time profile install | Best LAN-only option; install the CA once on the device |
| **Tailscale** (`tailscale cert`) | ✅ real cert, no install | Also reachable off the local network; adds a dependency |
| Public domain + Caddy/Let's Encrypt | ✅ | Needs a real domain + DNS; overkill for a LAN app |

Note the LLM connection to `host.docker.internal:12434` stays plain HTTP inside Docker —
it never leaves the host.

## Notes

- API/worker/memory-worker/beat/flower share one image (`py-genai-next-backend`) so a single build updates all.
- Redis has no auth and both DB ports bind to `0.0.0.0` for local dev — lock these down before any shared deployment.
