"""RAG knowledge base: chunking + pgvector similarity retrieval."""
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from genai.core.config import settings
from genai.domain.models import Document, DocumentChunk
from genai.services import embeddings

logger = logging.getLogger(__name__)


def chunk_text(text: str, size: int | None = None, overlap: int | None = None) -> list[str]:
    size = size or settings.RAG_CHUNK_CHARS
    overlap = overlap or settings.RAG_CHUNK_OVERLAP
    text = text.strip()
    if not text:
        return []
    chunks, start, n = [], 0, len(text)
    while start < n:
        end = min(start + size, n)
        if end < n:
            window = text[start:end]
            for sep in ("\n\n", "\n", ". "):
                idx = window.rfind(sep)
                if idx > size // 2:
                    end = start + idx + len(sep)
                    break
        chunks.append(text[start:end].strip())
        if end >= n:
            break
        start = max(end - overlap, start + 1)
    return [c for c in chunks if c]


async def retrieve(db: AsyncSession, user_id: uuid.UUID, query: str,
                   project_id: int | None = None, k: int | None = None) -> list[dict]:
    if not embeddings.available():
        return []
    k = k or settings.RAG_RETRIEVE_K
    qvec = await embeddings.embed(query)
    if not qvec:
        return []
    dist = DocumentChunk.embedding.cosine_distance(qvec).label("dist")
    stmt = (
        select(DocumentChunk.content, Document.filename, dist)
        .join(Document, Document.id == DocumentChunk.document_id)
        .where(Document.user_id == user_id, DocumentChunk.embedding.isnot(None))
        .order_by(dist)
        .limit(k)
    )
    if project_id is not None:
        stmt = stmt.where(Document.project_id == project_id)
    rows = (await db.execute(stmt)).all()
    # cosine distance → similarity; keep reasonably relevant passages
    return [{"content": r.content, "filename": r.filename, "score": 1 - r.dist}
            for r in rows if (1 - r.dist) > 0.2]


async def context_block(db: AsyncSession, user_id: uuid.UUID, query: str,
                        project_id: int | None = None) -> str | None:
    hits = await retrieve(db, user_id, query, project_id)
    if not hits:
        return None
    parts = [f"[{h['filename']}] {h['content']}" for h in hits]
    return ("Relevant excerpts from the user's documents (cite the filename when used):\n\n"
            + "\n\n---\n\n".join(parts))
