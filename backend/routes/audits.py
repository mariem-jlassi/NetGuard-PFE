"""
Routes de gestion des audits.
Création, lancement (Zero-Touch SSH + analyse NLP), historique.
"""

import json
import logging
from flask import Blueprint, request, jsonify
from db import query
from utils.ssh_push import fetch_running_config
from utils.nlp_engine import analyze_config
from routes.policies import get_enabled_rule_ids
from routes.auth import require_admin

logger = logging.getLogger(__name__)
audits_bp = Blueprint("audits", __name__)

# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

_AUDIT_SELECT = """
    SELECT a.id, a.device_id, a.config_text, a.status,
           a.anomalies_found, a.started_at, a.completed_at, a.created_at,
           d.name AS device_name,
           (SELECT COUNT(*) FROM audit_results ar
            LEFT JOIN security_policies sp ON UPPER(ar.anomaly_type) = sp.rule_id
            WHERE ar.audit_id = a.id AND ar.status = 'open'
            AND (sp.is_enabled = TRUE OR sp.rule_id IS NULL)) AS open_count
    FROM audits a
    LEFT JOIN devices d ON d.id = a.device_id
"""


def _to_iso(value):
    """Retourne une chaîne ISO-8601 que `value` soit un datetime ou déjà une str."""
    if value is None:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _fmt_audit(a):
    if not a:
        return None
    return {
        "id":            a["id"],
        "deviceId":      a["device_id"],
        "deviceName":    a.get("device_name", ""),
        "configText":    a["config_text"],
        "status":        a["status"],
        "anomaliesFound": a["anomalies_found"],
        "openCount":     a.get("open_count", 0),
        "startedAt":     _to_iso(a["started_at"]),
        "completedAt":   _to_iso(a["completed_at"]),
        "createdAt":     _to_iso(a["created_at"]),
    }


def _fetch_audit(audit_id):
    """Recharge un audit complet (avec open_count) depuis la base."""
    return query(
        _AUDIT_SELECT + "WHERE a.id = %s",
        (audit_id,), fetchone=True
    )


def _process_anomalies(audit_id, device, anomalies):
    """
    Insère / met à jour les audit_results et corrections pour une liste d'anomalies.
    Retourne le nombre de nouveaux résultats créés.
    """
    corrected_types = set()
    new_count = 0

    for anomaly in anomalies:
        atype    = anomaly["anomaly_type"]
        commands = anomaly.get("commands")

        # ── Cas 1 : anomalie déjà ouverte ──────────────────────────────
        already_open = query(
            """SELECT id FROM audit_results
               WHERE device_id = %s AND anomaly_type = %s AND status = 'open'
               LIMIT 1""",
            (device["id"], atype), fetchone=True
        )
        if already_open:
            query(
                "UPDATE audit_results SET audit_id = %s, detected_at = NOW() WHERE id = %s",
                (audit_id, already_open["id"])
            )
            if commands and atype not in corrected_types:
                existing_corr = query(
                    """SELECT id FROM corrections
                       WHERE result_id = %s AND status = 'pending'
                       LIMIT 1""",
                    (already_open["id"],), fetchone=True
                )
                if not existing_corr:
                    query(
                        """INSERT INTO corrections (result_id, device_id, correction_script, status)
                           VALUES (%s, %s, %s, 'pending')""",
                        (already_open["id"], device["id"], json.dumps(commands))
                    )
                corrected_types.add(atype)
            continue

        # ── Cas 2 : anomalie précédemment corrigée, elle réapparaît ────
        already_corrected = query(
            """SELECT id FROM audit_results
               WHERE device_id = %s AND anomaly_type = %s AND status = 'corrected'
               LIMIT 1""",
            (device["id"], atype), fetchone=True
        )
        if already_corrected:
            query(
                """UPDATE audit_results
                   SET audit_id = %s, status = 'open',
                       detected_at = NOW(), corrected_at = NULL
                   WHERE id = %s""",
                (audit_id, already_corrected["id"])
            )
            if commands and atype not in corrected_types:
                query(
                    """INSERT INTO corrections (result_id, device_id, correction_script, status)
                       VALUES (%s, %s, %s, 'pending')""",
                    (already_corrected["id"], device["id"], json.dumps(commands))
                )
                corrected_types.add(atype)
            new_count += 1
            continue

        # ── Cas 3 : nouvelle anomalie ───────────────────────────────────
        result = query(
            """INSERT INTO audit_results
               (audit_id, device_id, anomaly_type, severity, description,
                affected_config, suggested_fix, status)
               VALUES (%s, %s, %s, %s, %s, %s, %s, 'open') RETURNING id""",
            (
                audit_id, device["id"], atype,
                anomaly["severity"], anomaly["description"],
                anomaly["affected_config"], anomaly["suggested_fix"],
            ),
            returning=True
        )
        new_count += 1

        if result and commands and atype not in corrected_types:
            existing_corr = query(
                """SELECT c.id FROM corrections c
                   JOIN audit_results ar ON ar.id = c.result_id
                   WHERE c.device_id = %s AND ar.anomaly_type = %s
                   AND c.status IN ('pending', 'failed')
                   LIMIT 1""",
                (device["id"], atype), fetchone=True
            )
            if not existing_corr:
                query(
                    """INSERT INTO corrections (result_id, device_id, correction_script, status)
                       VALUES (%s, %s, %s, 'pending')""",
                    (result["id"], device["id"], json.dumps(commands))
                )
            corrected_types.add(atype)

    return new_count


def _auto_resolve(audit_id, device_id):
    """
    Marque 'corrected' toute anomalie ouverte sur cet équipement
    qui n'a PAS été détectée dans l'audit courant.
    """
    rows = query(
        "SELECT DISTINCT anomaly_type FROM audit_results WHERE audit_id = %s",
        (audit_id,), fetchall=True
    ) or []
    detected = [r["anomaly_type"] for r in rows]

    if detected:
        placeholders = ",".join(["%s"] * len(detected))
        query(
            f"UPDATE audit_results "
            f"SET status = 'corrected', corrected_at = NOW() "
            f"WHERE device_id = %s AND status = 'open' "
            f"  AND audit_id != %s "
            f"  AND anomaly_type NOT IN ({placeholders})",
            tuple([device_id, audit_id] + detected)
        )
    else:
        query(
            "UPDATE audit_results "
            "SET status = 'corrected', corrected_at = NOW() "
            "WHERE device_id = %s AND status = 'open' AND audit_id != %s",
            (device_id, audit_id)
        )


def _run_analysis(audit_id, device, config_text):
    """
    Orchestre : récupération SSH si nécessaire → analyse NLP → persistance.
    Retourne la liste des anomalies détectées.
    Lève une exception en cas d'échec (l'appelant doit marquer l'audit 'failed').
    """
    if device["ssh_username"] and device["ssh_password"] and len(config_text.strip()) < 50:
        config_text = fetch_running_config(
            host=device["ip_address"],
            port=device["ssh_port"] or 22,
            username=device["ssh_username"],
            password=device["ssh_password"],
            vendor=device["vendor"],
            enable_password=device["enable_password"],
        )
        query("UPDATE audits SET config_text = %s WHERE id = %s", (config_text, audit_id))

    enabled_rules = get_enabled_rule_ids()
    anomalies = analyze_config(
        config_text,
        vendor=device.get("vendor", ""),
        enabled_rules=enabled_rules
    )
    _process_anomalies(audit_id, device, anomalies)

    query(
        "UPDATE audits SET status = 'completed', anomalies_found = %s, completed_at = NOW() WHERE id = %s",
        (len(anomalies), audit_id)
    )
    _auto_resolve(audit_id, device["id"])
    query("UPDATE devices SET last_audit_at = NOW() WHERE id = %s", (device["id"],))

    return anomalies


# ──────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────

@audits_bp.route("/audits", methods=["GET"])
def get_audits():
    rows = query(
        _AUDIT_SELECT + "ORDER BY a.created_at DESC",
        fetchall=True
    )
    return jsonify([_fmt_audit(r) for r in (rows or [])])


@audits_bp.route("/audits/<int:audit_id>", methods=["GET"])
def get_audit(audit_id):
    row = _fetch_audit(audit_id)
    if not row:
        return jsonify({"error": "Audit introuvable."}), 404
    return jsonify(_fmt_audit(row))


@audits_bp.route("/audits", methods=["POST"])
def create_audit():
    data      = request.get_json() or {}
    inner     = data.get("data", {})
    device_id = (
        data.get("deviceId") or data.get("device_id") or
        inner.get("deviceId") or inner.get("device_id")
    )
    config_text = (
        data.get("configText") or data.get("config_text") or
        inner.get("configText") or inner.get("config_text") or ""
    )

    if not device_id:
        return jsonify({"error": "deviceId requis.", "recu": list(data.keys())}), 400

    device = query("SELECT * FROM devices WHERE id = %s", (device_id,), fetchone=True)
    if not device:
        return jsonify({"error": "Équipement introuvable."}), 404

    audit = query(
        "INSERT INTO audits (device_id, config_text, status, anomalies_found) "
        "VALUES (%s, %s, 'pending', 0) RETURNING *",
        (device_id, config_text), returning=True
    )
    audit_id = audit["id"]

    query("UPDATE audits SET status = 'running', started_at = NOW() WHERE id = %s", (audit_id,))

    try:
        _run_analysis(audit_id, device, config_text)
    except Exception as exc:
        logger.exception("Audit %s échoué : %s", audit_id, exc)
        query("UPDATE audits SET status = 'failed' WHERE id = %s", (audit_id,))

    return jsonify(_fmt_audit(_fetch_audit(audit_id))), 201


@audits_bp.route("/audits/<int:audit_id>/run", methods=["POST"])
def run_audit(audit_id):
    audit = query(
        "SELECT a.*, d.name AS device_name "
        "FROM audits a LEFT JOIN devices d ON d.id = a.device_id WHERE a.id = %s",
        (audit_id,), fetchone=True
    )
    if not audit:
        return jsonify({"error": "Audit introuvable."}), 404

    device = query("SELECT * FROM devices WHERE id = %s", (audit["device_id"],), fetchone=True)
    if not device:
        return jsonify({"error": "Équipement introuvable."}), 404

    query("UPDATE audits SET status = 'running', started_at = NOW() WHERE id = %s", (audit_id,))

    try:
        _run_analysis(audit_id, device, audit["config_text"] or "")
    except Exception as exc:
        logger.exception("Audit %s échoué : %s", audit_id, exc)
        query("UPDATE audits SET status = 'failed', completed_at = NOW() WHERE id = %s", (audit_id,))
        return jsonify({"error": str(exc)}), 500

    return jsonify(_fmt_audit(_fetch_audit(audit_id)))


@audits_bp.route("/audits/<int:audit_id>", methods=["DELETE"])
@require_admin
def delete_audit(audit_id):
    query(
        "DELETE FROM corrections WHERE result_id IN "
        "(SELECT id FROM audit_results WHERE audit_id = %s)",
        (audit_id,)
    )
    query("DELETE FROM audit_results WHERE audit_id = %s", (audit_id,))
    query("DELETE FROM audits WHERE id = %s", (audit_id,))
    return "", 204