from flask import Blueprint, jsonify, request

from config import Config
from services.history import create_template, delete_template, list_templates

templates_bp = Blueprint("templates", __name__)


@templates_bp.route("/api/templates", methods=["GET"])
def get_templates():
    return jsonify(list_templates())


@templates_bp.route("/api/templates", methods=["POST"])
def new_template():
    data = request.get_json(silent=True) or {}
    trigger = str(data.get("trigger", "")).strip()
    title = str(data.get("title", "")).strip()[:60]
    content = str(data.get("content", ""))[:Config.MAX_SYSTEM_PROMPT_LEN]
    if not trigger or not content:
        return jsonify({"error": "trigger and content are required"}), 400
    tid = create_template(trigger, title or trigger, content)
    return jsonify({"id": tid, "trigger": trigger, "title": title or trigger, "content": content}), 201


@templates_bp.route("/api/templates/<int:template_id>", methods=["DELETE"])
def remove_template(template_id: int):
    delete_template(template_id)
    return jsonify({"ok": True})
