"""
Planification automatique des audits réseau.
Utilise APScheduler pour lancer des audits périodiques Zero-Touch.
"""

from flask import Blueprint, request, jsonify
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from db import query
import json
from utils.ssh_push import fetch_running_config, push_config_to_device
from utils.nlp_engine import analyze_config, RULES
from utils.nlp_engine import analyze_config
from routes.policies import get_enabled_rule_ids
from routes.audits import _process_anomalies, _auto_resolve
import datetime

scheduler_bp = Blueprint("scheduler", __name__)
scheduler = BackgroundScheduler(timezone="Africa/Algiers", daemon=True)


def _run_scheduled_audit(device_id: int, schedule_id: int):
    """Fonction exécutée par APScheduler — lance un audit automatique."""
    try:
        device = query("SELECT * FROM devices WHERE id = %s", (device_id,), fetchone=True)
        if not device:
            return

        # Mise à jour de la date du dernier audit planifié
        query(
            "UPDATE audit_schedules SET last_run = NOW() WHERE id = %s",
            (schedule_id,)
        )

        # Créer l'audit
        audit = query(
            """INSERT INTO audits (device_id, config_text, status, anomalies_found)
               VALUES (%s, %s, 'running', 0) RETURNING *""",
            (device_id, ""),
            returning=True
        )
        if not audit:
            return

        audit_id = audit["id"]

        # Récupération SSH si disponible
        config_text = ""
        if device["ssh_username"] and device["ssh_password"]:
            try:
                config_text = fetch_running_config(
                    host=device["ip_address"],
                    port=device["ssh_port"] or 22,
                    username=device["ssh_username"],
                    password=device["ssh_password"],
                    vendor=device["vendor"],
                    enable_password=device["enable_password"],
                )
            except Exception:
                config_text = ""

        if not config_text.strip():
            query("UPDATE audits SET status = 'failed', completed_at = NOW() WHERE id = %s", (audit_id,))
            return

        # Analyse NLP
        enabled_rules = get_enabled_rule_ids()
        anomalies = analyze_config(config_text, vendor=device.get("vendor", ""), enabled_rules=enabled_rules)

        import json as _json
        for a in anomalies:
            if "commands" not in a:
                a["commands"] = _json.dumps([])
        _process_anomalies(audit_id, device, anomalies)
        _auto_resolve(audit_id, device_id)

        query(
            """UPDATE audits SET config_text=%s, status='completed',
               anomalies_found=%s, completed_at=NOW() WHERE id=%s""",
            (config_text, len(anomalies), audit_id)
        )
        query("UPDATE devices SET last_audit_at=NOW() WHERE id=%s", (device_id,))

    except Exception as e:
        print(f"[Scheduler] Erreur audit planifié device_id={device_id}: {e}")


def _init_db():
    """Crée la table audit_schedules si elle n'existe pas."""
    query("""
        CREATE TABLE IF NOT EXISTS audit_schedules (
            id SERIAL PRIMARY KEY,
            device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
            label TEXT NOT NULL DEFAULT '',
            frequency TEXT NOT NULL DEFAULT 'daily',
            hour INTEGER NOT NULL DEFAULT 2,
            minute INTEGER NOT NULL DEFAULT 0,
            day_of_week TEXT DEFAULT '*',
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            last_run TIMESTAMP,
            next_run TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)


def _reload_jobs():
    """Charge (ou recharge) tous les plannings actifs depuis la base."""
    scheduler.remove_all_jobs()
    rows = query("SELECT * FROM audit_schedules WHERE enabled = TRUE", fetchall=True)
    for row in (rows or []):
        _add_job(row)


def _add_job(row):
    freq = row["frequency"]
    if freq == "hourly":
        trigger = IntervalTrigger(hours=1, start_date=datetime.datetime.now())
    elif freq == "daily":
        trigger = CronTrigger(hour=row["hour"], minute=row["minute"])
    elif freq == "weekly":
        trigger = CronTrigger(day_of_week=row["day_of_week"] or "0",
                              hour=row["hour"], minute=row["minute"])
    else:
        trigger = CronTrigger(hour=row["hour"], minute=row["minute"])

    scheduler.add_job(
        _run_scheduled_audit,
        trigger=trigger,
        args=[row["device_id"], row["id"]],
        id=f"audit_schedule_{row['id']}",
        replace_existing=True,
    )


def start_scheduler():
    """Démarre APScheduler au lancement de Flask."""
    try:
        _init_db()
    except Exception as e:
        print(f"[Scheduler] Table audit_schedules déjà existante ou droits insuffisants: {e}")
    try:
        _reload_jobs()
    except Exception:
        pass
    if not scheduler.running:
        scheduler.start()


def _fmt(s):
    if not s:
        return None
    return {
        "id": s["id"],
        "deviceId": s["device_id"],
        "deviceName": s.get("device_name", ""),
        "label": s["label"],
        "frequency": s["frequency"],
        "hour": s["hour"],
        "minute": s["minute"],
        "dayOfWeek": s.get("day_of_week", "*"),
        "enabled": s["enabled"],
        "lastRun": s["last_run"].isoformat() if s["last_run"] else None,
        "createdAt": s["created_at"].isoformat() if s["created_at"] else None,
    }


@scheduler_bp.route("/scheduler", methods=["GET"])
def get_schedules():
    rows = query(
        """SELECT s.*, d.name AS device_name
           FROM audit_schedules s
           LEFT JOIN devices d ON d.id = s.device_id
           ORDER BY s.created_at DESC""",
        fetchall=True
    )
    return jsonify([_fmt(r) for r in (rows or [])])


@scheduler_bp.route("/scheduler", methods=["POST"])
def create_schedule():
    data = request.get_json() or {}
    device_id = data.get("deviceId")
    frequency = data.get("frequency", "daily")
    hour = int(data.get("hour", 2))
    minute = int(data.get("minute", 0))
    day_of_week = data.get("dayOfWeek", "*")
    label = data.get("label", "")

    if not device_id:
        return jsonify({"error": "deviceId requis."}), 400
    if frequency not in ("hourly", "daily", "weekly"):
        return jsonify({"error": "frequency doit être hourly, daily ou weekly."}), 400

    device = query("SELECT id FROM devices WHERE id = %s", (device_id,), fetchone=True)
    if not device:
        return jsonify({"error": "Équipement introuvable."}), 404

    row = query(
        """INSERT INTO audit_schedules
           (device_id, label, frequency, hour, minute, day_of_week, enabled)
           VALUES (%s, %s, %s, %s, %s, %s, TRUE) RETURNING *""",
        (device_id, label, frequency, hour, minute, day_of_week),
        returning=True
    )

    try:
        _reload_jobs()
    except Exception:
        pass
    return jsonify(_fmt(row)), 201


@scheduler_bp.route("/scheduler/<int:schedule_id>", methods=["PUT"])
def update_schedule(schedule_id):
    data = request.get_json() or {}
    existing = query("SELECT * FROM audit_schedules WHERE id = %s", (schedule_id,), fetchone=True)
    if not existing:
        return jsonify({"error": "Planning introuvable."}), 404

    enabled = data.get("enabled", existing["enabled"])
    frequency = data.get("frequency", existing["frequency"])
    hour = int(data.get("hour", existing["hour"]))
    minute = int(data.get("minute", existing["minute"]))
    label = data.get("label", existing["label"])
    day_of_week = data.get("dayOfWeek", existing["day_of_week"])

    row = query(
        """UPDATE audit_schedules
           SET enabled=%s, frequency=%s, hour=%s, minute=%s,
               label=%s, day_of_week=%s
           WHERE id=%s RETURNING *""",
        (enabled, frequency, hour, minute, label, day_of_week, schedule_id),
        returning=True
    )

    _reload_jobs()
    return jsonify(_fmt(row))


@scheduler_bp.route("/scheduler/<int:schedule_id>", methods=["DELETE"])
def delete_schedule(schedule_id):
    query("DELETE FROM audit_schedules WHERE id = %s", (schedule_id,))
    _reload_jobs()
    return "", 204


@scheduler_bp.route("/scheduler/<int:schedule_id>/run-now", methods=["POST"])
def run_now(schedule_id):
    """Lance immédiatement un audit planifié sans attendre l'heure prévue."""
    row = query("SELECT * FROM audit_schedules WHERE id = %s", (schedule_id,), fetchone=True)
    if not row:
        return jsonify({"error": "Planning introuvable."}), 404
    try:
        _run_scheduled_audit(row["device_id"], schedule_id)
        return jsonify({"success": True, "message": "Audit lancé manuellement."})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@scheduler_bp.route("/scheduler/<int:schedule_id>/correct-last", methods=["POST"])
def correct_last(schedule_id):
    """Corrige toutes les anomalies ouvertes du dernier audit de ce planning."""
    row = query("SELECT * FROM audit_schedules WHERE id = %s", (schedule_id,), fetchone=True)
    if not row:
        return jsonify({"error": "Planning introuvable."}), 404

    device = query("SELECT * FROM devices WHERE id = %s", (row["device_id"],), fetchone=True)
    if not device:
        return jsonify({"error": "Équipement introuvable."}), 404

    if not device["ssh_username"] or not device["ssh_password"]:
        return jsonify({"error": "Identifiants SSH non configurés."}), 400

    last_audit = query(
        "SELECT id FROM audits WHERE device_id = %s AND status = 'completed' ORDER BY completed_at DESC LIMIT 1",
        (row["device_id"],), fetchone=True
    )
    if not last_audit:
        return jsonify({"error": "Aucun audit complété trouvé pour cet équipement."}), 404

    open_results = query(
        "SELECT * FROM audit_results WHERE audit_id = %s AND status = 'open'",
        (last_audit["id"],), fetchall=True
    ) or []

    if not open_results:
        return jsonify({"success": True, "message": "Aucune anomalie ouverte à corriger.", "corrected": 0})

    corrected = 0
    errors = []

    for result in open_results:
        result_id = result["id"]
        atype = result["anomaly_type"]

        correction = query(
            "SELECT * FROM corrections WHERE result_id = %s ORDER BY id DESC LIMIT 1",
            (result_id,), fetchone=True
        )

        if not correction:
            device_vendor = (device["vendor"] or "").lower()
            matched = next((
                r for r in RULES
                if r.get("anomaly_type") == atype
                and r.get("commands")
                and any(v in device_vendor for v in r.get("vendors", []))
            ), None)
            if not matched:
                errors.append(f"Pas de script pour '{atype}'")
                continue
            query(
                "INSERT INTO corrections (result_id, device_id, correction_script, status) VALUES (%s, %s, %s, 'pending')",
                (result_id, device["id"], json.dumps(matched["commands"]))
            )
            correction = query(
                "SELECT * FROM corrections WHERE result_id = %s ORDER BY id DESC LIMIT 1",
                (result_id,), fetchone=True
            )

        try:
            script = correction["correction_script"]
            commands = json.loads(script) if isinstance(script, str) else script
            if not isinstance(commands, list):
                commands = [commands]
            push_config_to_device(
                host=device["ip_address"],
                port=device["ssh_port"] or 22,
                username=device["ssh_username"],
                password=device["ssh_password"],
                vendor=device["vendor"],
                commands=commands,
                enable_password=device["enable_password"],
            )
            query("UPDATE corrections SET status = 'applied', applied_at = NOW() WHERE id = %s", (correction["id"],))
            query("UPDATE audit_results SET status = 'corrected', corrected_at = NOW() WHERE id = %s", (result_id,))
            corrected += 1
        except Exception as e:
            query("UPDATE corrections SET status = 'failed' WHERE id = %s", (correction["id"],))
            errors.append(f"{atype}: {str(e)}")

    return jsonify({
        "success": True,
        "corrected": corrected,
        "total": len(open_results),
        "errors": errors,
    })
