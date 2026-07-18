"""Projects CRUD."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from genai import repositories as repo
from genai.api.deps import current_user
from genai.core.db import get_db
from genai.domain.models import Document, DocumentChunk, Memory, Message, Project, Session, User
from genai.domain.schemas import ProjectIn, ProjectOut

router = APIRouter(prefix="/api/projects", tags=["Projects"])


@router.get("", response_model=list[ProjectOut])
async def list_projects(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await repo.list_projects(db, user.id)


@router.post("", response_model=ProjectOut, status_code=201)
async def create_project(body: ProjectIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    p = Project(user_id=user.id, name=body.name, system_prompt=body.system_prompt)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return {**{c.name: getattr(p, c.name) for c in Project.__table__.columns}, "session_count": 0}


@router.patch("/{project_id}", response_model=ProjectOut)
async def patch_project(project_id: int, body: dict, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    p = await repo.get_project(db, user.id, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if body.get("name") is not None:
        p.name = body["name"]
    if "system_prompt" in body:
        p.system_prompt = body["system_prompt"]
    await db.commit()
    await db.refresh(p)
    return {**{c.name: getattr(p, c.name) for c in Project.__table__.columns}, "session_count": 0}


@router.delete("/{project_id}")
async def delete_project(project_id: int, delete_chats: bool = True,
                         user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    p = await repo.get_project(db, user.id, project_id)
    if not p:
        raise HTTPException(404, "Project not found")

    if delete_chats:
        sess_ids = select(Session.id).where(Session.project_id == project_id)
        await db.execute(delete(Message).where(Message.session_id.in_(sess_ids)))
        await db.execute(delete(Session).where(Session.project_id == project_id))
    else:
        await db.execute(update(Session).where(Session.project_id == project_id).values(project_id=None))

    await db.execute(delete(Memory).where(Memory.project_id == project_id))
    doc_ids = (await db.execute(select(Document.id).where(Document.project_id == project_id))).scalars().all()
    if doc_ids:
        await db.execute(delete(DocumentChunk).where(DocumentChunk.document_id.in_(doc_ids)))
        await db.execute(delete(Document).where(Document.id.in_(doc_ids)))
    await db.delete(p)
    await db.commit()
    return {"ok": True, "deleted_chats": delete_chats}
