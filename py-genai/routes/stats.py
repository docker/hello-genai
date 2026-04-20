from flask import Blueprint, jsonify

from services.history import get_stats

stats_bp = Blueprint("stats", __name__)


@stats_bp.route("/api/stats")
def stats():
    return jsonify(get_stats())
