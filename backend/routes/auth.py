from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token
from werkzeug.security import generate_password_hash, check_password_hash
from models import get_db

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json()
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO users (username, password) VALUES (?, ?)",
            (username, generate_password_hash(password))
        )
        conn.commit()
    except Exception:
        conn.close()
        return jsonify({"error": "Username already taken"}), 409
    conn.close()

    token = create_access_token(identity=username)
    return jsonify({"token": token, "username": username}), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400

    conn = get_db()
    row = conn.execute(
        "SELECT * FROM users WHERE username = ?", (username,)
    ).fetchone()
    conn.close()

    if not row or not check_password_hash(row["password"], password):
        return jsonify({"error": "Invalid username or password"}), 401

    token = create_access_token(identity=username)
    return jsonify({"token": token, "username": username}), 200
