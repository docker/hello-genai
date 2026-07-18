from flask import Blueprint, jsonify, request

from config import Config
from services.history import (
    create_project,
    delete_project,
    get_project,
    list_projects,
    set_session_project,
    update_project,
)

projects_bp = Blueprint("projects", __name__)


@projects_bp.route("/api/projects", methods=["GET"])
def get_projects():
    return jsonify(list_projects())


@projects_bp.route("/api/projects", methods=["POST"])
def new_project():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()[:80]
    if not name:
        return jsonify({"error": "name is required"}), 400
    system_prompt = data.get("system_prompt")
    if system_prompt is not None:
        system_prompt = str(system_prompt)[:Config.MAX_SYSTEM_PROMPT_LEN]
    pid = create_project(name, system_prompt)
    return jsonify(get_project(pid)), 201


@projects_bp.route("/api/projects/<int:project_id>", methods=["PATCH"])
def patch_project(project_id: int):
    data = request.get_json(silent=True) or {}
    name = data.get("name")
    system_prompt = data.get("system_prompt")
    if name is not None:
        name = str(name).strip()[:80]
    if system_prompt is not None:
        system_prompt = str(system_prompt)[:Config.MAX_SYSTEM_PROMPT_LEN]
    update_project(project_id, name=name, system_prompt=system_prompt)
    proj = get_project(project_id)
    if not proj:
        return jsonify({"error": "Project not found"}), 404
    return jsonify(proj)


@projects_bp.route("/api/projects/<int:project_id>", methods=["DELETE"])
def remove_project(project_id: int):
    delete_project(project_id)
    return jsonify({"ok": True})


@projects_bp.route("/api/sessions/<session_id>/project", methods=["POST"])
def assign_session_project(session_id: str):
    data = request.get_json(silent=True) or {}
    project_id = data.get("project_id")
    set_session_project(session_id, int(project_id) if project_id else None)
    return jsonify({"ok": True})
