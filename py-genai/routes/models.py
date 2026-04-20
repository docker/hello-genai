import os

import requests
from flask import Blueprint, jsonify

from config import Config

models_bp = Blueprint("models", __name__)


@models_bp.route("/api/models")
def list_models():
    # AVAILABLE_MODELS env var takes precedence over DMR auto-discovery
    pinned = os.getenv("AVAILABLE_MODELS", "").strip()
    if pinned:
        model_ids = [m.strip() for m in pinned.split(",") if m.strip()]
        return jsonify({"models": model_ids, "current": Config.MODEL_NAME})

    try:
        resp = requests.get(f"{Config.MODEL_URL}/models", timeout=5)
        resp.raise_for_status()
        model_ids = [m["id"] for m in resp.json().get("data", [])]
    except Exception:
        model_ids = [Config.MODEL_NAME] if Config.MODEL_NAME else []
    return jsonify({"models": model_ids, "current": Config.MODEL_NAME})
