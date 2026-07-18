"""Knowledge base documents (RAG). Ingestion is offloaded to Celery."""
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from genai import repositories as repo
from genai.api.deps import current_user
from genai.core.config import settings
from genai.core.db import get_db
from genai.domain.models import Document, DocumentChunk, User
from genai.domain.schemas import DocumentOut
from genai.services import embeddings

router = APIRouter(prefix="/api/documents", tags=["Documents"])


@router.get("")
async def list_documents(project_id: int | None = None, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return {"documents": await repo.list_documents(db, user.id, project_id),
            "embeddings_available": embeddings.available()}


def _extract(file: UploadFile) -> str:
    raw = file.file.read()
    if file.filename.lower().endswith(".pdf"):
        from pypdf import PdfReader
        reader = PdfReader(file.file if not raw else __import__("io").BytesIO(raw))
        return "\n\n".join((pg.extract_text() or "") for pg in reader.pages)
    return raw.decode("utf-8", errors="replace")


@router.post("", response_model=DocumentOut, status_code=201)
async def upload(file: UploadFile = File(...), project_id: int | None = Form(None),
                 user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    try:
        text = _extract(file)
    except Exception as e:
        raise HTTPException(400, "Could not read that file") from e
    text = text[:settings.MAX_MESSAGE_LEN * 4]
    if not text.strip():
        raise HTTPException(400, "No extractable text found")

    doc = Document(user_id=user.id, project_id=project_id, filename=file.filename,
                   chars=len(text), status="pending")
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    # Offload chunking + embedding to a Celery worker (falls back to inline)
    try:
        from genai.tasks import ingest_document_task
        ingest_document_task.delay(doc.id, text)
    except Exception:
        from genai.tasks import ingest_document_inline
        await ingest_document_inline(db, doc.id, text)

    return {**{c.name: getattr(doc, c.name) for c in Document.__table__.columns}, "chunk_count": 0}


@router.delete("/{document_id}")
async def delete_document(document_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    doc = (await db.execute(select(Document).where(Document.id == document_id, Document.user_id == user.id))).scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Document not found")
    await db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document_id))
    await db.delete(doc)
    await db.commit()
    return {"ok": True}
