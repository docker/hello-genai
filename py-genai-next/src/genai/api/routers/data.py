"""Export, import, full backup/restore, and clear-all for a user's data."""
import datetime
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from genai import repositories as repo
from genai.api.deps import current_user
from genai.core.db import get_db
from genai.domain.models import Memory, Message, Preset, Session, Template, User

router = APIRouter(prefix="/api", tags=["Data"])

BACKUP_VERSION = 1


def _now() -> str:
    return datetime.datetime.now(datetime.UTC).isoformat()


async def _owned(db, user, session_id):
    s = await repo.get_session(db, user.id, session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    return s


async def _session_payload(db, s: Session) -> dict:
    msgs = await repo.active_messages(db, s.id)
    return {
        "title": s.title,
        "system_prompt": s.system_prompt,
        "model": s.model,
        "pinned": s.pinned,
        "messages": [{"role": m["role"], "content": m["content"], "model": m.get("model")} for m in msgs],
    }


# ── Export a single conversation (json round-trips through import) ─────────────
@router.get("/sessions/{session_id}/export")
async def export_session(session_id: uuid.UUID, format: str = "json",
                         user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    s = await _owned(db, user, session_id)
    short = str(session_id)[:8]

    if format == "md":
        lines = [f"# {s.title}\n\n", f"*Exported: {_now()}*\n\n---\n\n"]
        for m in await repo.active_messages(db, s.id):
            label = "**You**" if m["role"] == "user" else "**Assistant**"
            lines.append(f"{label}\n\n{m['content']}\n\n---\n\n")
        return Response("".join(lines), media_type="text/markdown",
                        headers={"Content-Disposition": f'attachment; filename="chat-{short}.md"'})

    payload = {"version": BACKUP_VERSION, "exported_at": _now(), **await _session_payload(db, s)}
    return Response(json.dumps(payload, indent=2, ensure_ascii=False), media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="chat-{short}.json"'})


# ── Import a single conversation ──────────────────────────────────────────────
@router.post("/sessions/import", status_code=201)
async def import_session(body: dict, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    msgs = body.get("messages")
    if not isinstance(msgs, list):
        raise HTTPException(400, "Invalid chat: 'messages' array required")
    s = await repo.create_session(db, user.id, title=str(body.get("title") or "Imported Chat")[:200],
                                  system_prompt=body.get("system_prompt"), model=body.get("model"))
    await _restore_messages(db, s.id, msgs)
    return {"session_id": str(s.id)}


async def _restore_messages(db, session_id, msgs: list) -> None:
    for m in msgs:
        if isinstance(m, dict) and m.get("role") in ("user", "assistant") and m.get("content"):
            await repo.add_message(db, session_id, m["role"], str(m["content"]), model=m.get("model"))


# ── Full backup / restore ─────────────────────────────────────────────────────
@router.get("/backup")
async def export_backup(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    sessions = await repo.list_sessions(db, user.id)
    backup = {
        "version": BACKUP_VERSION,
        "exported_at": _now(),
        "sessions": [await _session_payload(db, s) for s in sessions],
        "presets": [{"name": p.name, "text": p.text} for p in await repo.list_presets(db, user.id)],
        "memories": [{"content": m.content, "enabled": m.enabled} for m in await repo.list_memories(db, user.id)],
        "templates": [{"trigger": t.trigger, "title": t.title, "content": t.content}
                      for t in await repo.list_templates(db, user.id)],
    }
    return Response(json.dumps(backup, indent=2, ensure_ascii=False), media_type="application/json",
                    headers={"Content-Disposition": 'attachment; filename="hello-genai-backup.json"'})


@router.post("/backup", status_code=201)
async def import_backup(body: dict, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if not isinstance(body.get("sessions"), list):
        raise HTTPException(400, "Invalid backup: 'sessions' array required")

    imported = 0
    for s in body["sessions"]:
        if not isinstance(s, dict):
            continue
        sess = await repo.create_session(db, user.id, title=str(s.get("title") or "Imported Chat")[:200],
                                         system_prompt=s.get("system_prompt"), model=s.get("model"),
                                         pinned=bool(s.get("pinned")))
        await _restore_messages(db, sess.id, s.get("messages") or [])
        imported += 1

    for p in body.get("presets") or []:
        if isinstance(p, dict) and p.get("name") and p.get("text"):
            db.add(Preset(user_id=user.id, name=str(p["name"])[:80], text=str(p["text"])[:2000]))
    for m in body.get("memories") or []:
        if isinstance(m, dict) and m.get("content"):
            db.add(Memory(user_id=user.id, content=str(m["content"])[:300], enabled=bool(m.get("enabled", True))))
    for t in body.get("templates") or []:
        if isinstance(t, dict) and t.get("trigger") and t.get("content"):
            db.add(Template(user_id=user.id, trigger=str(t["trigger"])[:40], title=str(t.get("title") or t["trigger"])[:80],
                            content=str(t["content"])[:2000]))
    await db.commit()
    return {"imported_sessions": imported}


# ── Clear all conversations ───────────────────────────────────────────────────
@router.delete("/sessions")
async def clear_all_sessions(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    sess_ids = select(Session.id).where(Session.user_id == user.id)
    await db.execute(delete(Message).where(Message.session_id.in_(sess_ids)))
    await db.execute(delete(Session).where(Session.user_id == user.id))
    await db.commit()
    return {"cleared": True}
