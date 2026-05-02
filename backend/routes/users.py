"""
Routes de gestion des utilisateurs — réservées aux administrateurs.
"""

import bcrypt
from flask import Blueprint, request, jsonify, g
from db import query
from routes.auth import require_admin

users_bp = Blueprint("users", __name__)


def _fmt(u):
    if not u:
        return None
    return {
        "id": u["id"],
        "username": u["username"],
        "role": u["role"],
        "displayName": u["display_name"],
        "active": u["active"],
        "createdAt": u["created_at"].isoformat(),
    }


@users_bp.route("/users", methods=["GET"])
@require_admin
def get_users():
    users = query(
        "SELECT * FROM users ORDER BY created_at ASC",
        fetchall=True
    )
    return jsonify([_fmt(u) for u in (users or [])])


@users_bp.route("/users", methods=["POST"])
@require_admin
def create_user():
    data = request.get_json() or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")
    role = data.get("role", "operator")
    display_name = data.get("displayName")

    if not username or not password:
        return jsonify({"error": "Nom d'utilisateur et mot de passe requis."}), 400
    if len(password) < 6:
        return jsonify({"error": "Le mot de passe doit contenir au moins 6 caractères."}), 400
    if role not in ("admin", "operator"):
        return jsonify({"error": "Rôle invalide. Choisissez 'admin' ou 'operator'."}), 400

    existing = query(
        "SELECT id FROM users WHERE username = %s", (username,), fetchone=True
    )
    if existing:
        return jsonify({"error": "Ce nom d'utilisateur existe déjà."}), 409

    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    user = query(
        """INSERT INTO users (username, password_hash, role, display_name, active)
           VALUES (%s, %s, %s, %s, TRUE) RETURNING *""",
        (username, password_hash, role, display_name or None),
        returning=True
    )
    return jsonify(_fmt(user)), 201


@users_bp.route("/users/<int:user_id>", methods=["PUT"])
@require_admin
def update_user(user_id):
    data = request.get_json() or {}
    existing = query(
        "SELECT * FROM users WHERE id = %s", (user_id,), fetchone=True
    )
    if not existing:
        return jsonify({"error": "Utilisateur introuvable."}), 404

    display_name = data.get("displayName", existing["display_name"])
    role = data.get("role", existing["role"])
    active = data.get("active", existing["active"])
    password = data.get("password")

    if role not in ("admin", "operator"):
        return jsonify({"error": "Rôle invalide."}), 400

    if password:
        if len(password) < 6:
            return jsonify({"error": "Le mot de passe doit contenir au moins 6 caractères."}), 400
        new_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        user = query(
            """UPDATE users SET display_name=%s, role=%s, active=%s,
               password_hash=%s, updated_at=NOW()
               WHERE id=%s RETURNING *""",
            (display_name, role, active, new_hash, user_id),
            returning=True
        )
    else:
        user = query(
            """UPDATE users SET display_name=%s, role=%s, active=%s, updated_at=NOW()
               WHERE id=%s RETURNING *""",
            (display_name, role, active, user_id),
            returning=True
        )
    return jsonify(_fmt(user))


@users_bp.route("/users/<int:user_id>", methods=["DELETE"])
@require_admin
def delete_user(user_id):
    if g.session.get("user_id") == user_id:
        return jsonify({"error": "Vous ne pouvez pas supprimer votre propre compte."}), 400

    deleted = query(
        "DELETE FROM users WHERE id = %s RETURNING id", (user_id,), returning=True
    )
    if not deleted:
        return jsonify({"error": "Utilisateur introuvable."}), 404
    return jsonify({"success": True})
