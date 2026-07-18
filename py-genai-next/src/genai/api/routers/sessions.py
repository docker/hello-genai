"""Sessions, messages, search, bookmarks, branching."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from genai import repositories as repo
from genai.api.deps import current_user
from genai.core.db import get_db
from genai.domain.models import User
from genai.domain.schemas import MessageOut, SessionIn, SessionOut

router = APIRouter(prefix="/api", tags=["Sessions"])


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(project_id: int | None = None, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await repo.list_sessions(db, user.id, project_id)


@router.post("/sessions", response_model=SessionOut, status_code=201)
async def create_session(body: SessionIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await repo.create_session(db, user.id, title=body.title, system_prompt=body.system_prompt,
                                     project_id=body.project_id)


async def _owned(db, user, session_id):
    s = await repo.get_session(db, user.id, session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    return s


@router.patch("/sessions/{session_id}", response_model=SessionOut)
async def patch_session(session_id: uuid.UUID, body: dict, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    s = await _owned(db, user, session_id)
    for k in ("title", "system_prompt", "model", "pinned", "project_id"):
        if k in body and body[k] is not None:
            setattr(s, k, body[k])
    for k in ("temperature", "max_tokens", "response_format"):  # explicit null clears these
        if k in body:
            setattr(s, k, body[k])
    await db.commit()
    await db.refresh(s)
    return s


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await repo.delete_session(db, await _owned(db, user, session_id))
    return {"ok": True}


@router.post("/sessions/{session_id}/pin")
async def pin_session(session_id: uuid.UUID, body: dict, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    s = await _owned(db, user, session_id)
    await repo.update_session(db, s, pinned=bool(body.get("pinned", True)))
    return {"ok": True}


@router.post("/sessions/{session_id}/project")
async def assign_project(session_id: uuid.UUID, body: dict, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    s = await _owned(db, user, session_id)
    s.project_id = body.get("project_id")
    await db.commit()
    return {"ok": True}


@router.get("/sessions/{session_id}/messages", response_model=list[MessageOut])
async def get_messages(session_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await _owned(db, user, session_id)
    return await repo.active_messages(db, session_id)


@router.delete("/sessions/{session_id}/messages/from/{message_id}")
async def truncate(session_id: uuid.UUID, message_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await _owned(db, user, session_id)
    await repo.delete_messages_from(db, session_id, message_id)
    return {"ok": True}


@router.delete("/sessions/{session_id}/messages/{message_id}", summary="Delete one turn (user message + its reply)")
async def delete_turn(session_id: uuid.UUID, message_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Delete a single user message together with the assistant reply it produced (from the database)."""
    await _owned(db, user, session_id)
    await repo.delete_turn(db, session_id, message_id)
    return {"ok": True}


@router.patch("/messages/{message_id}", summary="Edit a message's content (for edit & regenerate)")
async def edit_message(message_id: int, body: dict, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    content = str(body.get("content", "")).strip()
    if not content:
        raise HTTPException(400, "content required")
    if not await repo.edit_message(db, user.id, message_id, content):
        raise HTTPException(404, "Message not found")
    return {"ok": True}


@router.post("/sessions/{session_id}/suggestions", summary="Generate 3 suggested follow-up questions")
async def suggestions(session_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    from genai.services.llm import call_llm, strip_think
    await _owned(db, user, session_id)
    msgs = await repo.active_messages(db, session_id)
    if not msgs:
        return {"suggestions": []}
    tail = "\n".join(f"{m['role']}: {m['content'][:500]}" for m in msgs[-4:])
    prompt = ("Based on this conversation, suggest 3 short, natural follow-up questions the user might ask next. "
              "Reply with ONLY the 3 questions, one per line, no numbering.\n\n" + tail)
    try:
        text, _ = await call_llm([{"role": "user", "content": prompt}], max_tokens=120)
        lines = [x.strip(" -•\t").strip() for x in strip_think(text).splitlines() if x.strip()]
        return {"suggestions": [x for x in lines if len(x) > 4][:3]}
    except Exception:
        return {"suggestions": []}


@router.post("/messages/{message_id}/feedback")
async def feedback(message_id: int, body: dict, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await repo.set_feedback(db, message_id, body.get("feedback"))
    return {"ok": True}


@router.post("/messages/{message_id}/bookmark")
async def bookmark(message_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return {"bookmarked": await repo.toggle_bookmark(db, message_id)}


@router.post("/messages/{message_id}/branch")
async def branch(message_id: int, body: dict, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    direction = "prev" if body.get("direction") == "prev" else "next"
    return {"ok": await repo.cycle_branch(db, message_id, direction)}


@router.get("/bookmarks")
async def bookmarks(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await repo.list_bookmarks(db, user.id)


@router.get("/search")
async def search(q: str = "", user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return {"results": await repo.search_messages(db, user.id, q)}
