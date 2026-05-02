"""
Routes d'authentification — login, logout, vérification, changement de mot de passe.
Utilise des tokens en mémoire (dictionnaire Python) et bcrypt pour les mots de passe.
"""

import os
import secrets
import bcrypt
from functools import wraps
from flask import Blueprint, request, jsonify, g
from db import query

auth_bp = Blueprint("auth", __name__)

# Sessions actives en mémoire + DB pour persistance
active_sessions: dict[str, dict] = {}

def _load_sessions_from_db():
    """Recharge les sessions depuis la DB au démarrage."""
    try:
        rows = query("SELECT token, user_id, username, role, display_name FROM user_sessions WHERE expires_at > NOW()", fetchall=True)
        for r in (rows or []):
            active_sessions[r["token"]] = {"user_id": r["user_id"], "username": r["username"], "role": r["role"], "display_name": r["display_name"]}
    except Exception:
        pass


def _seed_admin():
    """Crée le compte admin par défaut s'il n'existe pas encore en base."""
    existing = query(
        "SELECT id FROM users WHERE username = %s",
        ("admin",), fetchone=True
    )
    if not existing:
        hashed = bcrypt.hashpw(b"netguard123", bcrypt.gensalt()).decode()
        query(
            """INSERT INTO users (username, password_hash, role, display_name, active)
               VALUES (%s, %s, %s, %s, %s)""",
            ("admin", hashed, "admin", "Administrateur", True)
        )
        print("[Auth] Compte admin créé (admin / netguard123)")


_seed_admin()


def require_auth(f):
    """Décorateur — vérifie que l'utilisateur est authentifié."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        session = active_sessions.get(token)
        if not session:
            return jsonify({"error": "Authentification requise."}), 401
        g.session = session
        return f(*args, **kwargs)
    return decorated


def require_admin(f):
    """Décorateur — vérifie que l'utilisateur est administrateur."""
    @wraps(f)
    def decorated(*args, **kwargs):
        # Essai 1 : token Bearer
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        sess = active_sessions.get(token)
        if sess and sess.get("role") == "admin":
            g.session = sess
            return f(*args, **kwargs)
        # Essai 2 : session Flask (cookie)
        from flask import session as flask_session
        if flask_session.get("role") == "admin":
            g.session = {"role": "admin", "username": flask_session.get("username", "")}
            return f(*args, **kwargs)
        return jsonify({"error": "Droits administrateur requis."}), 403
    return decorated


@auth_bp.route("/auth/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({"error": "Identifiants requis."}), 400

    user = query(
        "SELECT * FROM users WHERE username = %s AND active = TRUE",
        (username,), fetchone=True
    )

    if not user:
        return jsonify({"error": "Nom d'utilisateur ou mot de passe incorrect."}), 401

    if not bcrypt.checkpw(password.encode(), user["password_hash"].encode()):
        return jsonify({"error": "Nom d'utilisateur ou mot de passe incorrect."}), 401

    token = secrets.token_urlsafe(32)
    active_sessions[token] = {
        "user_id": user["id"],
        "username": user["username"],
        "role": user["role"],
        "display_name": user["display_name"],
    }

    return jsonify({
        "success": True,
        "token": token,
        "username": user["username"],
        "role": user["role"],
        "displayName": user["display_name"],
    })


@auth_bp.route("/auth/logout", methods=["POST"])
def logout():
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    active_sessions.pop(token, None)
    return jsonify({"success": True})


@auth_bp.route("/auth/verify", methods=["GET"])
def verify():
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    session = active_sessions.get(token)
    if session:
        return jsonify({
            "valid": True,
            "username": session["username"],
            "role": session["role"],
            "displayName": session["display_name"],
        })
    return jsonify({"valid": False}), 401


@auth_bp.route("/auth/change-password", methods=["POST"])
@require_auth
def change_password():
    data = request.get_json() or {}
    current_password = data.get("currentPassword", "")
    new_password = data.get("newPassword", "")

    if not current_password or not new_password or len(new_password) < 6:
        return jsonify({"error": "Mot de passe requis (minimum 6 caractères)."}), 400

    user = query(
        "SELECT * FROM users WHERE id = %s",
        (g.session["user_id"],), fetchone=True
    )

    if not bcrypt.checkpw(current_password.encode(), user["password_hash"].encode()):
        return jsonify({"error": "Mot de passe actuel incorrect."}), 400

    new_hash = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
    query(
        "UPDATE users SET password_hash = %s, updated_at = NOW() WHERE id = %s",
        (new_hash, g.session["user_id"])
    )
    return jsonify({"success": True})
from functools import wraps
from flask import jsonify, session

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        sess = active_sessions.get(token)
        if not sess or sess.get("role") != "admin":
            return jsonify({"error": "Accès refusé. Droits administrateur requis."}), 403
        g.session = sess
        return f(*args, **kwargs)
    return decorated_function
