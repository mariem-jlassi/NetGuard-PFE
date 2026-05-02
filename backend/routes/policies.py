"""
Routes de gestion des politiques de sécurité.
Permet d'activer ou désactiver chaque règle NLP avant un audit.
"""

from flask import Blueprint, jsonify, request
from db import query
from routes.auth import require_auth, admin_required
from utils.nlp_engine import RULES

policies_bp = Blueprint("policies", __name__)


def _ensure_policies_seeded():
    """Initialise la table security_policies si vide."""
    query("""
        CREATE TABLE IF NOT EXISTS security_policies (
            rule_id     VARCHAR(100) PRIMARY KEY,
            rule_name   VARCHAR(255) NOT NULL,
            vendor      VARCHAR(50)  NOT NULL,
            severity    VARCHAR(20)  NOT NULL,
            category    VARCHAR(100) NOT NULL,
            is_enabled  BOOLEAN      NOT NULL DEFAULT TRUE,
            updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
        )
    """)
    count = query("SELECT COUNT(*) AS n FROM security_policies", fetchone=True)
    if count and count["n"] == 0:
        for rule in RULES:
            vendors = rule.get("vendors", ["all"])
            vendor_str = vendors[0] if vendors else "all"
            query(
                """INSERT INTO security_policies
                   (rule_id, rule_name, vendor, severity, category, is_enabled)
                   VALUES (%s, %s, %s, %s, %s, TRUE)
                   ON CONFLICT (rule_id) DO NOTHING""",
                (
                    rule["id"],
                    rule["description"][:120],
                    vendor_str,
                    rule["severity"],
                    rule["anomaly_type"],
                )
            )


@policies_bp.route("/policies", methods=["GET"])
@require_auth
def get_policies():
    _ensure_policies_seeded()
    rows = query(
        "SELECT * FROM security_policies ORDER BY vendor, severity, rule_id",
        fetchall=True
    )
    return jsonify([
        {
            "ruleId":    r["rule_id"],
            "ruleName":  r["rule_name"],
            "vendor":    r["vendor"],
            "severity":  r["severity"],
            "category":  r["category"],
            "isEnabled": r["is_enabled"],
            "updatedAt": r["updated_at"].isoformat() if r["updated_at"] else None,
        }
        for r in (rows or [])
    ])


@policies_bp.route("/policies/<rule_id>", methods=["PATCH"])
@require_auth
@admin_required
def toggle_policy(rule_id):
    _ensure_policies_seeded()
    data = request.get_json() or {}
    is_enabled = data.get("isEnabled")
    if is_enabled is None:
        return jsonify({"error": "isEnabled requis."}), 400

    updated = query(
        """UPDATE security_policies
           SET is_enabled = %s, updated_at = NOW()
           WHERE rule_id = %s RETURNING *""",
        (bool(is_enabled), rule_id),
        returning=True
    )
    if not updated:
        return jsonify({"error": "Règle introuvable."}), 404

    return jsonify({
        "ruleId":    updated["rule_id"],
        "isEnabled": updated["is_enabled"],
    })


@policies_bp.route("/policies/reset", methods=["POST"])
@require_auth
@admin_required
def reset_policies():
    """Réactive toutes les règles."""
    _ensure_policies_seeded()
    query("UPDATE security_policies SET is_enabled = TRUE, updated_at = NOW()")
    return jsonify({"message": "Toutes les règles réactivées."})


def get_enabled_rule_ids() -> set:
    """Retourne les IDs des règles actuellement actives (utilisé par audits.py)."""
    try:
        _ensure_policies_seeded()
        rows = query(
            "SELECT rule_id FROM security_policies WHERE is_enabled = TRUE",
            fetchall=True
        )
        return {r["rule_id"] for r in (rows or [])}
    except Exception:
        return {r["id"] for r in RULES}
