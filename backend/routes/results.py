"""
Routes de consultation et gestion des résultats d'audit (anomalies détectées).
"""

import json
from flask import Blueprint, request, jsonify
from db import query
from utils.ssh_push import push_config_to_device


results_bp = Blueprint("results", __name__)


def _to_iso(value):
    if value is None:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _fmt(r):
    if not r:
        return None
    return {
        "id": r["id"],
        "auditId": r["audit_id"],
        "deviceId": r["device_id"],
        "deviceName": r.get("device_name", ""),
        "anomalyType": r["anomaly_type"],
        "severity": r["severity"],
        "description": r["description"],
        "affectedConfig": r["affected_config"],
        "suggestedFix": r["suggested_fix"],
        "status": r["status"],
        "detectedAt": _to_iso(r["detected_at"]),
        "correctedAt": _to_iso(r["corrected_at"]),
    }


@results_bp.route("/results", methods=["GET"])
def get_results():
    device_id = request.args.get("deviceId")
    severity = request.args.get("severity")
    status = request.args.get("status")

    sql = """
        SELECT ar.*, d.name AS device_name
        FROM audit_results ar
        LEFT JOIN devices d ON d.id = ar.device_id
        LEFT JOIN security_policies sp ON UPPER(ar.anomaly_type) = sp.rule_id
        WHERE (sp.is_enabled = TRUE OR sp.rule_id IS NULL)
    """
    params = []

    if device_id and device_id not in ("undefined", "null", ""):
        try:
            params.append(int(device_id))
            sql += " AND ar.device_id = %s"
        except (ValueError, TypeError):
            pass
    if severity:
        sql += " AND ar.severity = %s"
        params.append(severity)
    if status:
        sql += " AND ar.status = %s"
        params.append(status)

    sql += " ORDER BY ar.detected_at DESC"

    rows = query(sql, params, fetchall=True)
    return jsonify([_fmt(r) for r in (rows or [])])


@results_bp.route("/results/<int:result_id>", methods=["GET"])
def get_result(result_id):
    row = query(
        """SELECT ar.*, d.name AS device_name
           FROM audit_results ar
           LEFT JOIN devices d ON d.id = ar.device_id
           LEFT JOIN security_policies sp ON UPPER(ar.anomaly_type) = sp.rule_id
           WHERE ar.id = %s
           AND (sp.is_enabled = TRUE OR sp.rule_id IS NULL)""",
        (result_id,), fetchone=True
    )
    if not row:
        return jsonify({"error": "Résultat introuvable."}), 404
    return jsonify(_fmt(row))


@results_bp.route("/results/<int:result_id>", methods=["PATCH"])
def update_result_status(result_id):
    data = request.get_json() or {}
    new_status = data.get("status")
    if new_status not in ("open", "corrected", "ignored"):
        return jsonify({"error": "Statut invalide."}), 400

    extra_sql = ", corrected_at = NOW()" if new_status == "corrected" else ""
    row = query(
        f"UPDATE audit_results SET status = %s{extra_sql} WHERE id = %s RETURNING *",
        (new_status, result_id), returning=True
    )
    return jsonify(_fmt(row))


@results_bp.route("/results/<int:result_id>", methods=["DELETE"])
def delete_result(result_id):
    query("DELETE FROM corrections WHERE result_id = %s", (result_id,))
    query("DELETE FROM audit_results WHERE id = %s", (result_id,))
    return "", 204


def _parse_correction_script(script: str) -> list:
    s = (script or "").strip()
    if not s:
        return []
    try:
        parsed = json.loads(s)
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, str):
            inner = json.loads(parsed)
            if isinstance(inner, list):
                return inner
    except Exception:
        pass
    if s.startswith("{") and s.endswith("}"):
        inner = s[1:-1]
        parts = [p.strip().strip('"').strip("'") for p in inner.split(",") if p.strip()]
        return parts
    return [l.strip() for l in s.split("\n") if l.strip()]


@results_bp.route("/results/<int:result_id>/remediate", methods=["POST"])
def remediate_result(result_id):
    """
    Remédiation Zero-Touch directe depuis une anomalie.
    Cherche OU génère la correction puis l'applique via SSH.
    """
    print(f"[Remediate] result_id={result_id}")

    correction = query(
        "SELECT * FROM corrections WHERE result_id = %s ORDER BY id DESC LIMIT 1",
        (result_id,), fetchone=True
    )
    print(f"[Remediate] correction trouvée: {dict(correction) if correction else None}")

    if not correction:
        result_row = query("SELECT * FROM audit_results WHERE id = %s", (result_id,), fetchone=True)
        if not result_row:
            print(f"[Remediate] audit_result {result_id} introuvable")
            return jsonify({"error": f"Anomalie {result_id} introuvable en base."}), 404

        from utils.nlp_engine import RULES
        atype = result_row["anomaly_type"]
        device_info = query("SELECT vendor FROM devices WHERE id = %s", (result_row["device_id"],), fetchone=True)
        device_vendor = (device_info["vendor"] or "").lower() if device_info else ""
        matched = next((
            r for r in RULES
            if r.get("anomaly_type") == atype
            and r.get("commands")
            and any(v in device_vendor for v in r.get("vendors", []))
        ), None)
        if not matched:
            return jsonify({"error": f"Aucun script de correction pour '{atype}'."}), 404

        print(f"[Remediate] Auto-génération correction pour {atype}: {matched['commands']}")
        query(
            "INSERT INTO corrections (result_id, device_id, correction_script, status) VALUES (%s, %s, %s, 'pending')",
            (result_id, result_row["device_id"], json.dumps(matched["commands"]))
        )
        correction = query(
            "SELECT * FROM corrections WHERE result_id = %s ORDER BY id DESC LIMIT 1",
            (result_id,), fetchone=True
        )

    query("UPDATE corrections SET status = 'pending' WHERE id = %s", (correction["id"],))

    device = query("SELECT * FROM devices WHERE id = %s", (correction["device_id"],), fetchone=True)
    if not device:
        return jsonify({"error": "Équipement introuvable."}), 404

    if not device["ssh_username"] or not device["ssh_password"]:
        return jsonify({"error": "Identifiants SSH non configurés sur cet équipement."}), 400

    commands = _parse_correction_script(correction["correction_script"])
    print(f"[Remediate] commandes SSH: {commands}")
    print(f"[Remediate] device: {device['ip_address']} user={device['ssh_username']} enable={'(vide)' if not device['enable_password'] else '(set)'}")

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
        print(f"[Remediate] SSH output:\n{output}")
        query("UPDATE corrections SET status = 'applied', applied_at = NOW() WHERE id = %s", (correction["id"],))
        query("UPDATE audit_results SET status = 'corrected', corrected_at = NOW() WHERE id = %s", (result_id,))
        return jsonify({"success": True, "output": output[:2000], "correctionId": correction["id"]})
    except Exception as e:
        query("UPDATE corrections SET status = 'failed' WHERE id = %s", (correction["id"],))
        return jsonify({"success": False, "error": str(e)}), 500


@results_bp.route("/results", methods=["DELETE"])
def delete_results_by_status():
    status = request.args.get("status")
    if status not in ("corrected", "ignored"):
        return jsonify({"error": "Statut invalide pour la suppression groupée."}), 400
    query(
        """DELETE FROM corrections WHERE result_id IN
           (SELECT id FROM audit_results WHERE status = %s)""",
        (status,)
    )
    query(
        "DELETE FROM audit_results WHERE status = %s",
        (status,)
    )
    return jsonify({"success": True})