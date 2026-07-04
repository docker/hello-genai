import logging
import os

import requests
from flask import Blueprint, jsonify

from config import Config
from extensions import cache

logger = logging.getLogger(__name__)
models_bp = Blueprint("models", __name__)


def _discover_live_models() -> list[str]:
    """Query the LLM backend for the models it currently exposes."""
    resp = requests.get(f"{Config.MODEL_URL}/models", timeout=5)
    resp.raise_for_status()
    return [m["id"] for m in resp.json().get("data", []) if m.get("id")]


def _fallback_models() -> list[str]:
    """Static list used only when live discovery is unavailable."""
    pinned = os.getenv("AVAILABLE_MODELS", "").strip()
    if pinned:
        return [m.strip() for m in pinned.split(",") if m.strip()]
    return [Config.MODEL_NAME] if Config.MODEL_NAME else []


@models_bp.route("/api/models")
@cache.cached(timeout=30, query_string=True)
def list_models():
    """Return the models the backend currently exposes.

    Live discovery from the LLM backend is the source of truth, so the dropdown
    always reflects what is actually available at request time. AVAILABLE_MODELS
    / LLAMA_MODEL are used only as a fallback when the backend is unreachable.
    Any query string (e.g. ?refresh=<ts>) bypasses the 30s response cache.
    """
    source = "live"
    try:
        model_ids = _discover_live_models()
        if not model_ids:
            raise ValueError("backend returned an empty model list")
    except Exception as e:
        logger.info("Live model discovery failed (%s); using fallback list", e)
        model_ids = _fallback_models()
        source = "fallback"

    current = Config.MODEL_NAME if Config.MODEL_NAME in model_ids else (model_ids[0] if model_ids else "")
    return jsonify({"models": model_ids, "current": current, "source": source})
