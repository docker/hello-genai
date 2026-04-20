import logging

from flask import Flask, render_template
from flask_swagger_ui import get_swaggerui_blueprint

from config import Config
from extensions import cache, limiter
from routes.chat import chat_bp
from routes.health import health_bp
from routes.models import models_bp
from routes.sessions import sessions_bp
from routes.stats import stats_bp
from services.history import init_db


def create_app() -> Flask:
    app = Flask(__name__, static_url_path="/static", static_folder="static")
    app.config["CACHE_TYPE"] = "SimpleCache"
    app.config["CACHE_DEFAULT_TIMEOUT"] = Config.CACHE_TIMEOUT

    cache.init_app(app)
    limiter.init_app(app)

    swaggerui = get_swaggerui_blueprint(
        "/api/docs", "/static/swagger.json", config={"app_name": "Hello-GenAI API"}
    )
    app.register_blueprint(swaggerui, url_prefix="/api/docs")
    app.register_blueprint(chat_bp)
    app.register_blueprint(models_bp)
    app.register_blueprint(sessions_bp)
    app.register_blueprint(health_bp)
    app.register_blueprint(stats_bp)

    @app.route("/")
    def index():
        return render_template("index.html")

    @app.route("/preview")
    def preview():
        return render_template("preview.html")

    @app.after_request
    def security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; "
            "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; "
            "font-src 'self' https://cdnjs.cloudflare.com"
        )
        return response

    return app


if __name__ == "__main__":
    logging.basicConfig(
        level=getattr(logging, Config.LOG_LEVEL, logging.INFO),
        format="[%(asctime)s] %(levelname)s %(name)s: %(message)s",
    )
    init_db()
    app = create_app()
    app.run(host="0.0.0.0", port=Config.PORT, debug=Config.DEBUG)
