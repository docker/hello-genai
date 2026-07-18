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


def _migration_7_projects(conn) -> None:
    # Projects group sessions and scope memory + documents.
    conn.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            name          TEXT NOT NULL,
            system_prompt TEXT,
            created_at    TEXT NOT NULL,
            updated_at    TEXT NOT NULL
        )
    """)
    _add_column(conn, "sessions", "project_id INTEGER")
    _add_column(conn, "memories", "project_id INTEGER")
    _add_column(conn, "memories", "embedding TEXT")


def _migration_8_documents(conn) -> None:
    # RAG knowledge base: documents split into embedded chunks.
    conn.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            filename   TEXT NOT NULL,
            chars      INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS document_chunks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            chunk_index INTEGER NOT NULL,
            content     TEXT NOT NULL,
            embedding   TEXT,
            FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks(document_id)")


def _migration_9_branches_bookmarks(conn) -> None:
    # Conversation branching (sibling assistant messages) + message bookmarks.
    _add_column(conn, "messages", "parent_id INTEGER")
    _add_column(conn, "messages", "active INTEGER NOT NULL DEFAULT 1")
    _add_column(conn, "messages", "bookmarked INTEGER NOT NULL DEFAULT 0")


def _migration_10_templates(conn) -> None:
    # Slash-command prompt templates (e.g. /summarize).
    conn.execute("""
        CREATE TABLE IF NOT EXISTS templates (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            trigger    TEXT NOT NULL,
            title      TEXT NOT NULL,
            content    TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    # Seed a few useful defaults on first creation
    count = conn.execute("SELECT COUNT(*) FROM templates").fetchone()[0]
    if count == 0:
        now = _now()
        for trig, title, content in _DEFAULT_TEMPLATES:
            conn.execute(
                "INSERT INTO templates (trigger, title, content, created_at) VALUES (?,?,?,?)",
                (trig, title, content, now),
            )


_DEFAULT_TEMPLATES = [
    ("summarize", "Summarize", "Summarize the following clearly and concisely:\n\n"),
    ("explain", "Explain simply", "Explain the following in simple terms, as if to a beginner:\n\n"),
    ("improve", "Improve writing", "Improve the writing below for clarity and tone, keeping the meaning:\n\n"),
    ("code-review", "Review code", "Review the following code for bugs, clarity, and best practices:\n\n"),
    ("translate", "Translate", "Translate the following into English (or state the target language):\n\n"),
]


# Ordered migrations. Each is idempotent; PRAGMA user_version tracks how many
# have been applied so upgrades only run the pending ones.
_MIGRATIONS = [
    _migration_1_base,
    _migration_2_session_extras,
    _migration_3_message_complete,
    _migration_4_fts_and_presets,
    _migration_5_message_model,
    _migration_6_memories,
    _migration_7_projects,
    _migration_8_documents,
    _migration_9_branches_bookmarks,
    _migration_10_templates,
]

SCHEMA_VERSION = len(_MIGRATIONS)


def init_db() -> None:
    with _db() as conn:
        current = conn.execute("PRAGMA user_version").fetchone()[0]
        for version, migrate in enumerate(_MIGRATIONS, start=1):
            if version > current:
                migrate(conn)
                conn.execute(f"PRAGMA user_version = {version}")


def create_session(
    title: str = "New Chat",
    system_prompt: str | None = None,
    model: str | None = None,
    project_id: int | None = None,
) -> str:
    session_id = str(uuid.uuid4())
    now = _now()
    with _db() as conn:
        conn.execute(
            "INSERT INTO sessions (id, title, system_prompt, model, project_id, pinned, created_at, updated_at) "
            "VALUES (?,?,?,?,?,0,?,?)",
            (session_id, title, system_prompt, model, project_id, now, now),
        )
    return session_id


def list_sessions(project_id: int | None = None) -> list[dict]:
    query = "SELECT * FROM sessions"
    params: tuple = ()
    if project_id is not None:
        query += " WHERE project_id=?"
        params = (project_id,)
    query += " ORDER BY pinned DESC, updated_at DESC"
    with _db() as conn:
        rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]


def set_session_project(session_id: str, project_id: int | None) -> None:
    with _db() as conn:
        conn.execute("UPDATE sessions SET project_id=?, updated_at=? WHERE id=?", (project_id, _now(), session_id))


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
    parent_id: int | None = None,
) -> int:
    now = _now()
    with _db() as conn:
        # A new assistant response under an existing user turn becomes the active
        # branch; prior siblings are kept but deactivated.
        if role == "assistant" and parent_id is not None:
            conn.execute(
                "UPDATE messages SET active=0 WHERE parent_id=? AND role='assistant'", (parent_id,)
            )
        cursor = conn.execute(
            "INSERT INTO messages (session_id, role, content, token_usage, complete, model, parent_id, active, created_at) "
            "VALUES (?,?,?,?,?,?,?,1,?)",
            (session_id, role, content, json.dumps(token_usage) if token_usage else None,
             1 if complete else 0, model, parent_id, now),
        )
        conn.execute("UPDATE sessions SET updated_at=? WHERE id=?", (now, session_id))
        return cursor.lastrowid


def toggle_bookmark(message_id: int) -> bool:
    with _db() as conn:
        row = conn.execute("SELECT bookmarked FROM messages WHERE id=?", (message_id,)).fetchone()
        if not row:
            return False
        new_val = 0 if row["bookmarked"] else 1
        conn.execute("UPDATE messages SET bookmarked=? WHERE id=?", (new_val, message_id))
        return bool(new_val)


def list_bookmarks() -> list[dict]:
    with _db() as conn:
        rows = conn.execute(
            "SELECT m.id, m.session_id, m.role, m.content, m.created_at, s.title AS session_title "
            "FROM messages m JOIN sessions s ON s.id=m.session_id "
            "WHERE m.bookmarked=1 ORDER BY m.id DESC"
        ).fetchall()
    return [dict(r) for r in rows]


def cycle_branch(active_message_id: int, direction: str) -> bool:
    """Activate the previous/next sibling response for a branched turn."""
    with _db() as conn:
        row = conn.execute(
            "SELECT parent_id FROM messages WHERE id=?", (active_message_id,)
        ).fetchone()
        if not row or row["parent_id"] is None:
            return False
        sibs = [
            r["id"] for r in conn.execute(
                "SELECT id FROM messages WHERE parent_id=? AND role='assistant' ORDER BY id",
                (row["parent_id"],),
            ).fetchall()
        ]
        if active_message_id not in sibs or len(sibs) < 2:
            return False
        idx = (sibs.index(active_message_id) + (1 if direction == "next" else -1)) % len(sibs)
        conn.execute("UPDATE messages SET active=0 WHERE parent_id=? AND role='assistant'", (row["parent_id"],))
        conn.execute("UPDATE messages SET active=1 WHERE id=?", (sibs[idx],))
        return True


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
    """Return the active conversation path (one active response per turn), with
    branch counts so the UI can offer ‹ n/m › navigation."""
    with _db() as conn:
        rows = conn.execute(
            "SELECT id, session_id, role, content, token_usage, feedback, complete, model, "
            "parent_id, bookmarked, created_at "
            "FROM messages WHERE session_id=? AND active=1 ORDER BY id",
            (session_id,),
        ).fetchall()
        sibs = conn.execute(
            "SELECT parent_id, COUNT(*) AS c FROM messages "
            "WHERE session_id=? AND role='assistant' AND parent_id IS NOT NULL GROUP BY parent_id",
            (session_id,),
        ).fetchall()
    sib_count = {r["parent_id"]: r["c"] for r in sibs}
    result = []
    for r in rows:
        d = dict(r)
        if d["token_usage"]:
            d["token_usage"] = json.loads(d["token_usage"])
        if d["role"] == "assistant" and d.get("parent_id") is not None:
            d["branch_count"] = sib_count.get(d["parent_id"], 1)
        result.append(d)
    return result


def get_history_before(session_id: str, message_id: int) -> list[dict]:
    """Active-path messages strictly before the given message id (for regeneration)."""
    return [m for m in get_messages(session_id) if m["id"] < message_id]


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


def list_memories(enabled_only: bool = False, project_id: int | None = None,
                  include_global: bool = True) -> list[dict]:
    query = ("SELECT id, content, source_session_id, enabled, project_id, created_at, updated_at "
             "FROM memories")
    clauses, params = [], []
    if enabled_only:
        clauses.append("enabled=1")
    if project_id is not None:
        # Project-scoped memories plus (optionally) global ones with no project
        clauses.append("(project_id=? OR project_id IS NULL)" if include_global else "project_id=?")
        params.append(project_id)
    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY id"
    with _db() as conn:
        rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]


def list_memories_with_embeddings(enabled_only: bool = True, project_id: int | None = None) -> list[dict]:
    query = "SELECT id, content, embedding, project_id FROM memories WHERE embedding IS NOT NULL"
    params: list = []
    if enabled_only:
        query += " AND enabled=1"
    if project_id is not None:
        query += " AND (project_id=? OR project_id IS NULL)"
        params.append(project_id)
    with _db() as conn:
        rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]


def set_memory_embedding(memory_id: int, embedding: str) -> None:
    with _db() as conn:
        conn.execute("UPDATE memories SET embedding=? WHERE id=?", (embedding, memory_id))


def create_memory(content: str, source_session_id: str | None = None,
                  project_id: int | None = None, embedding: str | None = None) -> int:
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
            "INSERT INTO memories (content, source_session_id, project_id, embedding, enabled, created_at, updated_at) "
            "VALUES (?,?,?,?,1,?,?)",
            (content, source_session_id, project_id, embedding, now, now),
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


# ── Projects ──────────────────────────────────────────────────────────────────

def list_projects() -> list[dict]:
    with _db() as conn:
        rows = conn.execute(
            "SELECT p.*, "
            "(SELECT COUNT(*) FROM sessions s WHERE s.project_id=p.id) AS session_count "
            "FROM projects p ORDER BY name COLLATE NOCASE"
        ).fetchall()
    return [dict(r) for r in rows]


def create_project(name: str, system_prompt: str | None = None) -> int:
    now = _now()
    with _db() as conn:
        cursor = conn.execute(
            "INSERT INTO projects (name, system_prompt, created_at, updated_at) VALUES (?,?,?,?)",
            (name.strip(), system_prompt, now, now),
        )
        return cursor.lastrowid


def get_project(project_id: int) -> dict | None:
    with _db() as conn:
        row = conn.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone()
    return dict(row) if row else None


def update_project(project_id: int, name: str | None = None, system_prompt: str | None = None) -> None:
    updates, params = [], []
    if name is not None:
        updates.append("name=?")
        params.append(name.strip())
    if system_prompt is not None:
        updates.append("system_prompt=?")
        params.append(system_prompt)
    if not updates:
        return
    updates.append("updated_at=?")
    params.extend([_now(), project_id])
    with _db() as conn:
        conn.execute(f"UPDATE projects SET {', '.join(updates)} WHERE id=?", params)


def delete_project(project_id: int) -> None:
    """Delete a project. Its sessions become unfiled (project_id → NULL); its
    documents and scoped memories are removed."""
    with _db() as conn:
        conn.execute("UPDATE sessions SET project_id=NULL WHERE project_id=?", (project_id,))
        conn.execute("DELETE FROM memories WHERE project_id=?", (project_id,))
        doc_ids = [r["id"] for r in conn.execute(
            "SELECT id FROM documents WHERE project_id=?", (project_id,)).fetchall()]
        for did in doc_ids:
            conn.execute("DELETE FROM document_chunks WHERE document_id=?", (did,))
        conn.execute("DELETE FROM documents WHERE project_id=?", (project_id,))
        conn.execute("DELETE FROM projects WHERE id=?", (project_id,))


# ── Documents (RAG knowledge base) ────────────────────────────────────────────

def create_document(filename: str, chars: int, project_id: int | None = None) -> int:
    with _db() as conn:
        cursor = conn.execute(
            "INSERT INTO documents (project_id, filename, chars, created_at) VALUES (?,?,?,?)",
            (project_id, filename, chars, _now()),
        )
        return cursor.lastrowid


def add_document_chunks(document_id: int, chunks: list[tuple[str, str | None]]) -> None:
    """chunks: list of (content, embedding_json)."""
    with _db() as conn:
        conn.executemany(
            "INSERT INTO document_chunks (document_id, chunk_index, content, embedding) VALUES (?,?,?,?)",
            [(document_id, i, content, emb) for i, (content, emb) in enumerate(chunks)],
        )


def list_documents(project_id: int | None = None) -> list[dict]:
    query = ("SELECT d.id, d.project_id, d.filename, d.chars, d.created_at, "
             "(SELECT COUNT(*) FROM document_chunks c WHERE c.document_id=d.id) AS chunk_count "
             "FROM documents d")
    params: tuple = ()
    if project_id is not None:
        query += " WHERE d.project_id=?"
        params = (project_id,)
    query += " ORDER BY d.id DESC"
    with _db() as conn:
        rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]


def delete_document(document_id: int) -> None:
    with _db() as conn:
        conn.execute("DELETE FROM document_chunks WHERE document_id=?", (document_id,))
        conn.execute("DELETE FROM documents WHERE id=?", (document_id,))


def get_document_chunks(project_id: int | None = None) -> list[dict]:
    """All embedded chunks (optionally within a project) for similarity search."""
    query = ("SELECT c.id, c.content, c.embedding, d.filename "
             "FROM document_chunks c JOIN documents d ON d.id=c.document_id "
             "WHERE c.embedding IS NOT NULL")
    params: tuple = ()
    if project_id is not None:
        query += " AND d.project_id=?"
        params = (project_id,)
    with _db() as conn:
        rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]


# ── Prompt templates (slash commands) ─────────────────────────────────────────

def list_templates() -> list[dict]:
    with _db() as conn:
        rows = conn.execute(
            "SELECT id, trigger, title, content, created_at FROM templates ORDER BY trigger"
        ).fetchall()
    return [dict(r) for r in rows]


def create_template(trigger: str, title: str, content: str) -> int:
    trigger = trigger.strip().lstrip("/").replace(" ", "-").lower()
    with _db() as conn:
        cursor = conn.execute(
            "INSERT INTO templates (trigger, title, content, created_at) VALUES (?,?,?,?)",
            (trigger, title.strip(), content, _now()),
        )
        return cursor.lastrowid


def delete_template(template_id: int) -> None:
    with _db() as conn:
        conn.execute("DELETE FROM templates WHERE id=?", (template_id,))


# ── Stats & analytics ─────────────────────────────────────────────────────────

def get_stats() -> dict:
    with _db() as conn:
        total_sessions = conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
        total_messages = conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
        rows = conn.execute(
            "SELECT token_usage, model, feedback, complete FROM messages WHERE role='assistant'"
        ).fetchall()

    prompt_tokens = completion_tokens = total_tokens = 0
    by_model: dict[str, dict] = {}
    for r in rows:
        model = r["model"] or "unknown"
        m = by_model.setdefault(model, {
            "model": model, "messages": 0, "prompt_tokens": 0,
            "completion_tokens": 0, "total_tokens": 0, "up": 0, "down": 0,
        })
        m["messages"] += 1
        if r["feedback"] == "up":
            m["up"] += 1
        elif r["feedback"] == "down":
            m["down"] += 1
        if r["token_usage"]:
            u = json.loads(r["token_usage"])
            pt, ct, tt = u.get("prompt_tokens", 0), u.get("completion_tokens", 0), u.get("total_tokens", 0)
            prompt_tokens += pt
            completion_tokens += ct
            total_tokens += tt
            m["prompt_tokens"] += pt
            m["completion_tokens"] += ct
            m["total_tokens"] += tt

    return {
        "total_sessions":     total_sessions,
        "total_messages":     total_messages,
        "prompt_tokens":      prompt_tokens,
        "completion_tokens":  completion_tokens,
        "total_tokens":       total_tokens,
        "by_model":           sorted(by_model.values(), key=lambda x: -x["total_tokens"]),
    }
