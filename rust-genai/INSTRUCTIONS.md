# Instructions: Running the Rust GenAI App

## Prerequisites
- Rust and Cargo installed (https://rustup.rs)
- (Recommended) Docker, if you want to run in a container

## 1. Running Locally (Development)

```bash
cd rust-genai
cp .env.example .env  # Edit .env as needed
cargo build --release
cargo run
```

- The server will start on the port specified in `.env` (default: 8083)
- Open http://localhost:8083 in your browser

## 2. Running with Docker

```bash
docker build -t rust-genai .
docker run -p 8083:8083 \
  -e LLM_BASE_URL=http://your-llm-api \
  -e LLM_MODEL_NAME=your-model \
  rust-genai
```

- The app will be available at http://localhost:8083

## 3. Endpoints
- `GET /` — Main chat interface
- `POST /api/chat` — Chat API endpoint
- `GET /health` — Health check
- `GET /example` — Example markdown
- `GET /api/docs` — Swagger UI

## 4. Configuration
- Edit `.env` or set environment variables:
  - `PORT` (default: 8083)
  - `LLM_BASE_URL` (required)
  - `LLM_MODEL_NAME` (required)
  - `LOG_LEVEL` (default: info)

## 5. Notes
- Static files are in `static/`, templates in `templates/`.
- Rate limiting and caching are in-memory (per process).
- For production, use behind a reverse proxy and persistent LLM API.
