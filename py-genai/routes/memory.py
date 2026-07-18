from flask import Blueprint, jsonify, request

from config import Config
from services.history import (
    clear_memories,
    create_memory,
    delete_memory,
    list_memories,
    update_memory,
)

memory_bp = Blueprint("memory", __name__)

MAX_MEMORY_LEN = 300


@memory_bp.route("/api/memories", methods=["GET"])
def get_memories():
    return jsonify(list_memories())


@memory_bp.route("/api/memories", methods=["POST"])
def add_memory():
    data = request.get_json(silent=True) or {}
    content = str(data.get("content", "")).strip()[:MAX_MEMORY_LEN]
    if not content:
        return jsonify({"error": "content is required"}), 400
    if len(list_memories()) >= Config.MEMORY_MAX_ITEMS:
        return jsonify({"error": f"Memory is full (max {Config.MEMORY_MAX_ITEMS} items)"}), 409
    project_id = data.get("project_id")
    memory_id = create_memory(content, project_id=int(project_id) if project_id else None)
    # Embed in the background so semantic recall works for manual additions too
    from services.memory import _executor, embed_memory
    _executor.submit(lambda: embed_memory(memory_id, content))
    return jsonify({"id": memory_id, "content": content}), 201


@memory_bp.route("/api/memories/<int:memory_id>", methods=["PATCH"])
def patch_memory(memory_id: int):
    data = request.get_json(silent=True) or {}
    content = data.get("content")
    enabled = data.get("enabled")
    if content is not None:
        content = str(content).strip()[:MAX_MEMORY_LEN]
        if not content:
            return jsonify({"error": "content cannot be empty"}), 400
    if enabled is not None:
        enabled = bool(enabled)
    update_memory(memory_id, content=content, enabled=enabled)
    return jsonify({"ok": True})


@memory_bp.route("/api/memories/<int:memory_id>", methods=["DELETE"])
def remove_memory(memory_id: int):
    delete_memory(memory_id)
    return jsonify({"ok": True})


@memory_bp.route("/api/memories", methods=["DELETE"])
def remove_all_memories():
    return jsonify({"ok": True, "deleted": clear_memories()})
