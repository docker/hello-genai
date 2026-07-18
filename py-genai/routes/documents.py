import logging

from flask import Blueprint, jsonify, request

from config import Config
from services import embeddings, rag
from services.history import delete_document, list_documents

logger = logging.getLogger(__name__)
documents_bp = Blueprint("documents", __name__)


@documents_bp.route("/api/documents", methods=["GET"])
def get_documents():
    project_id = request.args.get("project_id", type=int)
    return jsonify({
        "documents": list_documents(project_id),
        "embeddings_available": embeddings.available(),
    })


@documents_bp.route("/api/documents", methods=["POST"])
def upload_document():
    """Ingest a document into the RAG knowledge base.

    Accepts either a multipart PDF/text file upload (`file`) or a JSON body with
    `filename` and `text`. Optional `project_id` scopes it to a project.
    """
    project_id = request.form.get("project_id", type=int) or (request.get_json(silent=True) or {}).get("project_id")
    project_id = int(project_id) if project_id else None

    filename, text = _extract_upload()
    if text is None:
        return jsonify({"error": "Provide a .pdf/.txt file or JSON { filename, text }"}), 400
    if not text.strip():
        return jsonify({"error": "No extractable text found"}), 400

    summary = rag.ingest_document(filename, text[:Config.MAX_UPLOAD_BYTES], project_id=project_id)
    if not summary["embedded"]:
        summary["note"] = "Stored without embeddings — set EMBED_MODEL to enable retrieval."
    return jsonify(summary), 201


def _extract_upload() -> tuple[str, str | None]:
    file = request.files.get("file")
    if file and file.filename:
        name = file.filename
        if name.lower().endswith(".pdf"):
            try:
                from pypdf import PdfReader
            except ImportError:
                return name, None
            try:
                reader = PdfReader(file.stream)
                return name, "\n\n".join((pg.extract_text() or "") for pg in reader.pages)
            except Exception:
                logger.exception("PDF read failed")
                return name, None
        try:
            return name, file.stream.read().decode("utf-8", errors="replace")
        except Exception:
            return name, None
    data = request.get_json(silent=True) or {}
    if data.get("text"):
        return str(data.get("filename", "document.txt")), str(data["text"])
    return "document.txt", None


@documents_bp.route("/api/documents/<int:document_id>", methods=["DELETE"])
def remove_document(document_id: int):
    delete_document(document_id)
    return jsonify({"ok": True})
