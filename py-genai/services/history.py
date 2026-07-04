import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import UTC, datetime

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
    return datetime.now(UTC).isoformat()


def _add_column(conn, table: str, ddl: str) -> None:
    """Idempotent ADD COLUMN — ignores 'duplicate column' so migrations can
    re-run safely against databases that predate the versioning scheme."""
    try:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {ddl}")
    except sqlite3.OperationalError as e:
        if "duplicate column" not in str(e).lower():
            raise


def _migration_1_base(conn) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id            TEXT PRIMARY KEY,
            title         TEXT NOT NULL DEFAULT 'New Chat',
            system_prompt TEXT,
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
            created_at  TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)")


def _migration_2_session_extras(conn) -> None:
    _add_column(conn, "sessions", "pinned INTEGER NOT NULL DEFAULT 0")
    _add_column(conn, "messages", "feedback TEXT")
    _add_column(conn, "sessions", "model TEXT")


def _migration_3_message_complete(conn) -> None:
    _add_column(conn, "messages", "complete INTEGER NOT NULL DEFAULT 1")


def _migration_4_fts_and_presets(conn) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS presets (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,
            text       TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
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
    conn.execute(
        "INSERT INTO messages_fts(rowid, content) "
        "SELECT id, content FROM messages WHERE id NOT IN (SELECT rowid FROM messages_fts)"
    )


def _migration_5_message_model(conn) -> None:
    # Records which model produced each assistant message (compare mode / model switching)
    _add_column(conn, "messages", "model TEXT")


def _migration_6_memories(conn) -> None:
    # Persistent cross-session memory: durable facts about the user, injected
    # into the system prompt of every conversation.
    conn.execute("""
        CREATE TABLE IF NOT EXISTS memories (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            content           TEXT NOT NULL,
            source_session_id TEXT,
            enabled           INTEGER NOT NULL DEFAULT 1,
            created_at        TEXT NOT NULL,
            updated_at        TEXT NOT NULL
        )
    """)


# Ordered migrations. Each is idempotent; PRAGMA user_version tracks how many
# have been applied so upgrades only run the pending ones.
_MIGRATIONS = [
    _migration_1_base,
    _migration_2_session_extras,
    _migration_3_message_complete,
    _migration_4_fts_and_presets,
    _migration_5_message_model,
    _migration_6_memories,
]

SCHEMA_VERSION = len(_MIGRATIONS)


def init_db() -> None:
    with _db() as conn:
        current = conn.execute("PRAGMA user_version").fetchone()[0]
        for version, migrate in enumerate(_MIGRATIONS, start=1):
            if version > current:
                migrate(conn)
                conn.execute(f"PRAGMA user_version = {version}")


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
    model: str | None = None,
) -> int:
    now = _now()
    with _db() as conn:
        cursor = conn.execute(
            "INSERT INTO messages (session_id, role, content, token_usage, complete, model, created_at) "
            "VALUES (?,?,?,?,?,?,?)",
            (session_id, role, content, json.dumps(token_usage) if token_usage else None,
             1 if complete else 0, model, now),
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
            "SELECT id, session_id, role, content, token_usage, feedback, complete, model, created_at "
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


def import_session(
    title: str,
    messages: list[dict],
    system_prompt: str | None = None,
    model: str | None = None,
) -> str:
    session_id = create_session(title=title, system_prompt=system_prompt, model=model)
    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role in ("user", "assistant") and content:
            add_message(session_id, role, content, model=msg.get("model"))
    return session_id


def export_all() -> dict:
    """Full backup: every session with its messages, plus presets."""
    sessions = list_sessions()
    return {
        "version": SCHEMA_VERSION,
        "exported_at": _now(),
        "sessions": [
            {
                "title": s["title"],
                "system_prompt": s.get("system_prompt"),
                "model": s.get("model"),
                "pinned": s.get("pinned", 0),
                "messages": [
                    {"role": m["role"], "content": m["content"], "model": m.get("model")}
                    for m in get_messages(s["id"])
                ],
            }
            for s in sessions
        ],
        "presets": [{"name": p["name"], "text": p["text"]} for p in list_presets()],
        "memories": [
            {"content": m["content"], "enabled": m["enabled"]} for m in list_memories()
        ],
    }


def import_all(backup: dict) -> int:
    """Restore a full backup produced by export_all(). Returns sessions imported."""
    count = 0
    for s in backup.get("sessions", []):
        if not isinstance(s, dict):
            continue
        sid = import_session(
            title=str(s.get("title", "Imported Chat"))[:Config.MAX_SESSION_TITLE_LEN],
            messages=s.get("messages", []) if isinstance(s.get("messages"), list) else [],
            system_prompt=s.get("system_prompt"),
            model=s.get("model"),
        )
        if s.get("pinned"):
            pin_session(sid, True)
        count += 1
    for p in backup.get("presets", []):
        if isinstance(p, dict) and p.get("name") and p.get("text"):
            create_preset(str(p["name"])[:Config.MAX_PRESET_NAME_LEN],
                          str(p["text"])[:Config.MAX_SYSTEM_PROMPT_LEN])
    for m in backup.get("memories", []):
        if isinstance(m, dict) and m.get("content"):
            mem_id = create_memory(str(m["content"])[:300])
            if not m.get("enabled", 1):
                update_memory(mem_id, enabled=False)
    return count


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


def list_memories(enabled_only: bool = False) -> list[dict]:
    query = "SELECT id, content, source_session_id, enabled, created_at, updated_at FROM memories"
    if enabled_only:
        query += " WHERE enabled=1"
    query += " ORDER BY id"
    with _db() as conn:
        rows = conn.execute(query).fetchall()
    return [dict(r) for r in rows]


def create_memory(content: str, source_session_id: str | None = None) -> int:
    """Store a memory. Duplicate content (case-insensitive) returns the existing id."""
    content = content.strip()
    now = _now()
    with _db() as conn:
        row = conn.execute(
            "SELECT id FROM memories WHERE lower(content)=lower(?)", (content,)
        ).fetchone()
        if row:
            return row["id"]
        cursor = conn.execute(
            "INSERT INTO memories (content, source_session_id, enabled, created_at, updated_at) VALUES (?,?,1,?,?)",
            (content, source_session_id, now, now),
        )
        return cursor.lastrowid


def update_memory(memory_id: int, content: str | None = None, enabled: bool | None = None) -> None:
    updates, params = [], []
    if content is not None:
        updates.append("content=?")
        params.append(content.strip())
    if enabled is not None:
        updates.append("enabled=?")
        params.append(1 if enabled else 0)
    if not updates:
        return
    updates.append("updated_at=?")
    params.extend([_now(), memory_id])
    with _db() as conn:
        conn.execute(f"UPDATE memories SET {', '.join(updates)} WHERE id=?", params)


def delete_memory(memory_id: int) -> None:
    with _db() as conn:
        conn.execute("DELETE FROM memories WHERE id=?", (memory_id,))


def clear_memories() -> int:
    with _db() as conn:
        cursor = conn.execute("DELETE FROM memories")
        return cursor.rowcount


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
