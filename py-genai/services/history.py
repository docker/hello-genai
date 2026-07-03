import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone

from config import Config


@contextmanager
def _db():
    conn = sqlite3.connect(Config.DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_db() -> None:
    with _db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id            TEXT PRIMARY KEY,
                title         TEXT NOT NULL DEFAULT 'New Chat',
                system_prompt TEXT,
                pinned        INTEGER NOT NULL DEFAULT 0,
                created_at    TEXT NOT NULL,
                updated_at    TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id  TEXT NOT NULL,
                role        TEXT NOT NULL,
                content     TEXT NOT NULL,
                token_usage TEXT,
                feedback    TEXT,
                created_at  TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS presets (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT NOT NULL,
                text       TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        # Safe column migrations for databases created before these columns existed
        for stmt in [
            "ALTER TABLE sessions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE messages ADD COLUMN feedback TEXT",
            "ALTER TABLE sessions ADD COLUMN model TEXT",
            "ALTER TABLE messages ADD COLUMN complete INTEGER NOT NULL DEFAULT 1",
        ]:
            try:
                conn.execute(stmt)
            except sqlite3.OperationalError as e:
                if "duplicate column" not in str(e).lower():
                    raise
        # Full-text search index over message content, kept in sync via triggers
        conn.execute("CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(content)")
        conn.execute("""
            CREATE TRIGGER IF NOT EXISTS messages_fts_ai AFTER INSERT ON messages BEGIN
                INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
            END
        """)
        conn.execute("""
            CREATE TRIGGER IF NOT EXISTS messages_fts_ad AFTER DELETE ON messages BEGIN
                DELETE FROM messages_fts WHERE rowid = old.id;
            END
        """)
        conn.execute("""
            CREATE TRIGGER IF NOT EXISTS messages_fts_au AFTER UPDATE OF content ON messages BEGIN
                UPDATE messages_fts SET content = new.content WHERE rowid = old.id;
            END
        """)
        # Backfill the index for databases created before FTS existed
        conn.execute(
            "INSERT INTO messages_fts(rowid, content) "
            "SELECT id, content FROM messages WHERE id NOT IN (SELECT rowid FROM messages_fts)"
        )


def create_session(title: str = "New Chat", system_prompt: str | None = None, model: str | None = None) -> str:
    session_id = str(uuid.uuid4())
    now = _now()
    with _db() as conn:
        conn.execute(
            "INSERT INTO sessions (id, title, system_prompt, model, pinned, created_at, updated_at) VALUES (?,?,?,?,0,?,?)",
            (session_id, title, system_prompt, model, now, now),
        )
    return session_id


def list_sessions() -> list[dict]:
    with _db() as conn:
        rows = conn.execute(
            "SELECT * FROM sessions ORDER BY pinned DESC, updated_at DESC"
        ).fetchall()
    return [dict(r) for r in rows]


def get_session(session_id: str) -> dict | None:
    with _db() as conn:
        row = conn.execute("SELECT * FROM sessions WHERE id=?", (session_id,)).fetchone()
    return dict(row) if row else None


def update_session(
    session_id: str,
    title: str | None = None,
    system_prompt: str | None = None,
    model: str | None = None,
) -> None:
    updates, params = [], []
    if title is not None:
        updates.append("title=?")
        params.append(title)
    if system_prompt is not None:
        updates.append("system_prompt=?")
        params.append(system_prompt)
    if model is not None:
        updates.append("model=?")
        params.append(model)
    if not updates:
        return
    updates.append("updated_at=?")
    params.extend([_now(), session_id])
    with _db() as conn:
        conn.execute(f"UPDATE sessions SET {', '.join(updates)} WHERE id=?", params)


def pin_session(session_id: str, pinned: bool) -> None:
    with _db() as conn:
        conn.execute("UPDATE sessions SET pinned=? WHERE id=?", (1 if pinned else 0, session_id))


def delete_session(session_id: str) -> None:
    with _db() as conn:
        # Delete messages explicitly (rather than relying on FK cascade) so the
        # FTS delete triggers always fire.
        conn.execute("DELETE FROM messages WHERE session_id=?", (session_id,))
        conn.execute("DELETE FROM sessions WHERE id=?", (session_id,))


def add_message(
    session_id: str,
    role: str,
    content: str,
    token_usage: dict | None = None,
    complete: bool = True,
) -> int:
    now = _now()
    with _db() as conn:
        cursor = conn.execute(
            "INSERT INTO messages (session_id, role, content, token_usage, complete, created_at) VALUES (?,?,?,?,?,?)",
            (session_id, role, content, json.dumps(token_usage) if token_usage else None, 1 if complete else 0, now),
        )
        conn.execute("UPDATE sessions SET updated_at=? WHERE id=?", (now, session_id))
        return cursor.lastrowid


def set_message_feedback(message_id: int, feedback: str | None) -> None:
    with _db() as conn:
        conn.execute("UPDATE messages SET feedback=? WHERE id=?", (feedback, message_id))


def delete_messages_from(session_id: str, message_id: int) -> None:
    with _db() as conn:
        conn.execute(
            "DELETE FROM messages WHERE session_id=? AND id>=?",
            (session_id, message_id),
        )
        conn.execute("UPDATE sessions SET updated_at=? WHERE id=?", (_now(), session_id))


def get_messages(session_id: str) -> list[dict]:
    with _db() as conn:
        rows = conn.execute(
            "SELECT id, session_id, role, content, token_usage, feedback, complete, created_at "
            "FROM messages WHERE session_id=? ORDER BY id",
            (session_id,),
        ).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        if d["token_usage"]:
            d["token_usage"] = json.loads(d["token_usage"])
        result.append(d)
    return result


def import_session(title: str, messages: list[dict], system_prompt: str | None = None) -> str:
    session_id = create_session(title=title, system_prompt=system_prompt)
    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role in ("user", "assistant") and content:
            add_message(session_id, role, content)
    return session_id


def search_messages(query: str, limit: int = 30) -> list[dict]:
    """Full-text search across all sessions. Terms are quoted for FTS5 and
    matched as prefixes; returns newest-ranked matches with a highlighted snippet."""
    terms = [t.replace('"', '""') for t in query.split() if t]
    if not terms:
        return []
    match_expr = " ".join(f'"{t}"*' for t in terms)
    with _db() as conn:
        try:
            rows = conn.execute(
                """
                SELECT m.id AS message_id, m.session_id, m.role, s.title,
                       snippet(messages_fts, 0, '[MARK]', '[/MARK]', ' … ', 12) AS snippet
                FROM messages_fts
                JOIN messages m ON m.id = messages_fts.rowid
                JOIN sessions s ON s.id = m.session_id
                WHERE messages_fts MATCH ?
                ORDER BY rank
                LIMIT ?
                """,
                (match_expr, limit),
            ).fetchall()
        except sqlite3.OperationalError:
            return []
    return [dict(r) for r in rows]


def list_presets() -> list[dict]:
    with _db() as conn:
        rows = conn.execute(
            "SELECT id, name, text, created_at FROM presets ORDER BY name COLLATE NOCASE"
        ).fetchall()
    return [dict(r) for r in rows]


def create_preset(name: str, text: str) -> int:
    with _db() as conn:
        cursor = conn.execute(
            "INSERT INTO presets (name, text, created_at) VALUES (?,?,?)",
            (name, text, _now()),
        )
        return cursor.lastrowid


def delete_preset(preset_id: int) -> None:
    with _db() as conn:
        conn.execute("DELETE FROM presets WHERE id=?", (preset_id,))


def get_stats() -> dict:
    with _db() as conn:
        total_sessions = conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
        total_messages = conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
        rows = conn.execute(
            "SELECT token_usage FROM messages WHERE token_usage IS NOT NULL"
        ).fetchall()
    prompt_tokens = completion_tokens = total_tokens = 0
    for r in rows:
        u = json.loads(r[0])
        prompt_tokens     += u.get("prompt_tokens", 0)
        completion_tokens += u.get("completion_tokens", 0)
        total_tokens      += u.get("total_tokens", 0)
    return {
        "total_sessions":     total_sessions,
        "total_messages":     total_messages,
        "prompt_tokens":      prompt_tokens,
        "completion_tokens":  completion_tokens,
        "total_tokens":       total_tokens,
    }
