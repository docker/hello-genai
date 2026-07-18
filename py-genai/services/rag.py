"""RAG knowledge base: chunk documents, embed them, and retrieve relevant
passages to ground the model's answers.

Retrieval degrades gracefully — if embeddings are unavailable, ingestion still
stores the document (chunks without vectors) and retrieval simply returns
nothing, so chat proceeds normally.
"""
import logging

from config import Config
from services import embeddings
from services.history import add_document_chunks, create_document, get_document_chunks

logger = logging.getLogger(__name__)


def chunk_text(text: str, size: int | None = None, overlap: int | None = None) -> list[str]:
    """Split text into overlapping chunks, preferring paragraph boundaries."""
    size = size or Config.RAG_CHUNK_CHARS
    overlap = overlap or Config.RAG_CHUNK_OVERLAP
    text = text.strip()
    if not text:
        return []
    chunks: list[str] = []
    start = 0
    n = len(text)
    while start < n:
        end = min(start + size, n)
        if end < n:
            # Try to break on a paragraph or sentence boundary near the end
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


def ingest_document(filename: str, text: str, project_id: int | None = None) -> dict:
    """Store a document as embedded chunks. Returns a summary."""
    chunks = chunk_text(text)
    doc_id = create_document(filename, chars=len(text), project_id=project_id)

    vectors = embeddings.embed_many(chunks) if chunks else None
    rows: list[tuple[str, str | None]] = []
    for i, chunk in enumerate(chunks):
        vec = vectors[i] if vectors and i < len(vectors) else None
        rows.append((chunk, embeddings.to_json(vec) if vec else None))
    if rows:
        add_document_chunks(doc_id, rows)

    return {
        "document_id": doc_id,
        "filename": filename,
        "chunks": len(chunks),
        "embedded": bool(vectors),
    }


def retrieve(query: str, project_id: int | None = None, k: int | None = None) -> list[dict]:
    """Return the top-k document chunks most relevant to the query."""
    if not embeddings.available():
        return []
    k = k or Config.RAG_RETRIEVE_K
    qvec = embeddings.embed(query)
    if not qvec:
        return []
    candidates = get_document_chunks(project_id=project_id)
    if not candidates:
        return []
    hits = embeddings.top_k(qvec, candidates, k)
    # Ignore weak matches so irrelevant context isn't injected
    return [h for h in hits if h["score"] > 0.2]


def context_block(query: str, project_id: int | None = None, k: int | None = None) -> str | None:
    """Formatted retrieval block for the system prompt, or None if nothing relevant."""
    hits = retrieve(query, project_id=project_id, k=k)
    if not hits:
        return None
    parts = [f"[{h['filename']}] {h['content']}" for h in hits]
    return (
        "Relevant excerpts from the user's documents (cite the filename when you use them):\n\n"
        + "\n\n---\n\n".join(parts)
    )
