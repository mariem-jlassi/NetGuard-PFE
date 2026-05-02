"""
Routes de gestion des corrections.
Génération automatique et application via SSH.
"""

from flask import Blueprint, request, jsonify
from routes.auth import admin_required
from db import query
from utils.ssh_push import push_config_to_device

corrections_bp = Blueprint("corrections", __name__)


def _fmt(c):
    if not c:
        return None
    return {
        "id": c["id"],
        "resultId": c["result_id"],
        "deviceId": c["device_id"],
        "deviceName": c.get("device_name", ""),
        "anomalyType": c.get("anomaly_type", ""),
        "severity": c.get("severity", ""),
        "correctionScript": c["correction_script"],
        "status": c["status"],
        "appliedAt": c["applied_at"].isoformat() if c["applied_at"] else None,
        "createdAt": c["created_at"].isoformat(),
    }


@corrections_bp.route("/corrections", methods=["GET"])
def get_corrections():
    rows = query(
        """SELECT c.*, d.name AS device_name, ar.anomaly_type, ar.severity
           FROM corrections c
           LEFT JOIN devices d ON d.id = c.device_id
           LEFT JOIN audit_results ar ON ar.id = c.result_id
           WHERE c.status != 'pending'
              OR (c.status = 'pending' AND (ar.status = 'open' OR ar.id IS NULL))
           ORDER BY c.created_at DESC""",
        fetchall=True
    )
    return jsonify([_fmt(r) for r in (rows or [])])


@corrections_bp.route("/corrections", methods=["POST"])
@admin_required
def create_correction():
    data = request.get_json() or {}
    result_id = data.get("resultId")
    device_id = data.get("deviceId")
    script = data.get("correctionScript", "")

    if not result_id or not device_id or not script:
        return jsonify({"error": "resultId, deviceId et correctionScript sont requis."}), 400

    correction = query(
        """INSERT INTO corrections (result_id, device_id, correction_script, status)
           VALUES (%s, %s, %s, 'pending') RETURNING *""",
        (result_id, device_id, script),
        returning=True
    )
    return jsonify(_fmt(correction)), 201


@corrections_bp.route("/corrections/<int:correction_id>/apply", methods=["POST"])
@admin_required
def apply_correction(correction_id):
    """
    Applique la correction via SSH sur l'équipement cible.
    Envoie les commandes du script et marque la correction comme appliquée.
    """
    correction = query(
        "SELECT * FROM corrections WHERE id = %s", (correction_id,), fetchone=True
    )
    if not correction:
        return jsonify({"error": "Correction introuvable."}), 404

    device = query(
        "SELECT * FROM devices WHERE id = %s", (correction["device_id"],), fetchone=True
    )
    if not device:
        return jsonify({"error": "Équipement introuvable."}), 404

    if not device["ssh_username"] or not device["ssh_password"]:
        return jsonify({"error": "Identifiants SSH non configurés."}), 400

    import json
    script = correction["correction_script"] or ""
    try:
        commands = json.loads(script) if script.strip().startswith("[") else [l for l in script.split("\n") if l.strip()]
    except Exception:
        commands = [l for l in script.split("\n") if l.strip()]

    try:
        output = push_config_to_device(
            host=device["ip_address"],
            port=device["ssh_port"] or 22,
            username=device["ssh_username"],
            password=device["ssh_password"],
            vendor=device["vendor"],
            commands=commands,
            enable_password=device["enable_password"],
        )

        query(
            "UPDATE corrections SET status = 'applied', applied_at = NOW() WHERE id = %s",
            (correction_id,)
        )
        query(
            "UPDATE audit_results SET status = 'corrected', corrected_at = NOW() WHERE id = %s",
            (correction["result_id"],)
        )

        return jsonify({"success": True, "output": output[:2000]})

    except Exception as e:
        query(
            "UPDATE corrections SET status = 'failed' WHERE id = %s",
            (correction_id,)
        )
        return jsonify({"success": False, "error": str(e)}), 500


@corrections_bp.route("/corrections/<int:correction_id>/ignore", methods=["POST"])
@admin_required
def ignore_correction(correction_id):
    correction = query("SELECT id FROM corrections WHERE id = %s", (correction_id,), fetchone=True)
    if not correction:
        return jsonify({"error": "Correction introuvable."}), 404
    query("UPDATE corrections SET status = 'ignored', applied_at = NOW() WHERE id = %s", (correction_id,))
    return jsonify({"success": True})


@corrections_bp.route("/corrections/<int:correction_id>", methods=["DELETE"])
@admin_required
def delete_correction(correction_id):
    query("DELETE FROM corrections WHERE id = %s", (correction_id,))
    return "", 204
