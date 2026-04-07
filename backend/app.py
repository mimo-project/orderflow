import os
from flask import Flask, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from models import init_db
from routes.auth import auth_bp
from routes.orders import orders_bp

app = Flask(__name__, static_folder="../frontend", static_url_path="")

# ── Config ────────────────────────────────────────────────────────────
app.config["JWT_SECRET_KEY"] = os.environ.get("JWT_SECRET_KEY", "change-this-in-production")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = False   # tokens don't expire (fine for a project)

# ── Extensions ────────────────────────────────────────────────────────
CORS(app)           # allow requests from the frontend (Netlify URL)
JWTManager(app)

# ── Blueprints ────────────────────────────────────────────────────────
app.register_blueprint(auth_bp)
app.register_blueprint(orders_bp)

# ── Serve frontend static files ───────────────────────────────────────
# When running locally this lets Flask serve the HTML directly.
# On Render + Netlify deployment, Netlify handles the frontend instead.
@app.route("/")
def index():
    return send_from_directory(app.static_folder, "landing.html")

@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(app.static_folder, path)

# ── Health check (used by Render) ─────────────────────────────────────
@app.route("/health")
def health():
    return {"status": "ok"}, 200

# ── Init DB + run ─────────────────────────────────────────────────────
if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
