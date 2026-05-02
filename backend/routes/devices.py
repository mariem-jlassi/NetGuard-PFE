"""
Routes CRUD des équipements réseau + test de connexion SSH + import CSV.
"""

import csv
import io
from flask import Blueprint, request, jsonify, Response
from db import query
from utils.ssh_push import test_ssh_connection, fetch_running_config
from routes.auth import require_auth, admin_required

devices_bp = Blueprint("devices", __name__)


def _fmt(d):
    """Formate un enregistrement device pour l'API (camelCase pour le frontend React)."""
    if not d:
        return None
    return {
        "id": d["id"],
        "name": d["name"],
        "type": d["type"],
        "ipAddress": d["ip_address"],
        "vendor": d["vendor"],
        "model": d["model"],
        "osVersion": d["os_version"],
        "status": d["status"],
        "sshUsername": d["ssh_username"],
        "sshPassword": d["ssh_password"],
        "sshPort": d["ssh_port"],
        "enablePassword": d["enable_password"],
        "lastAuditAt": d["last_audit_at"].isoformat() if d["last_audit_at"] else None,
        "createdAt": d["created_at"].isoformat(),
    }


@devices_bp.route("/devices", methods=["GET"])
def get_devices():
    devices = query(
        "SELECT * FROM devices ORDER BY created_at ASC",
        fetchall=True
    )
    return jsonify([_fmt(d) for d in (devices or [])])


@devices_bp.route("/devices/<int:device_id>", methods=["GET"])
def get_device(device_id):
    device = query(
        "SELECT * FROM devices WHERE id = %s",
        (device_id,), fetchone=True
    )
    if not device:
        return jsonify({"error": "Équipement introuvable."}), 404
    return jsonify(_fmt(device))


@devices_bp.route("/devices", methods=["POST"])
@admin_required
def create_device():
    data = request.get_json() or {}
    required = ["name", "type", "ipAddress", "vendor", "model", "osVersion"]
    for field in required:
        if not data.get(field):
            return jsonify({"error": f"Champ requis manquant : {field}"}), 400

    device = query(
        """INSERT INTO devices
           (name, type, ip_address, vendor, model, os_version, status,
            ssh_username, ssh_password, ssh_port, enable_password)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
           RETURNING *""",
        (
            data["name"], data["type"], data["ipAddress"],
            data["vendor"], data["model"], data["osVersion"],
            data.get("status", "unknown"),
            data.get("sshUsername"), data.get("sshPassword"),
            int(data.get("sshPort", 22)), data.get("enablePassword"),
        ),
        returning=True
    )
    return jsonify(_fmt(device)), 201


@devices_bp.route("/devices/<int:device_id>", methods=["PUT"])
@admin_required
def update_device(device_id):
    data = request.get_json() or {}
    existing = query(
        "SELECT id FROM devices WHERE id = %s", (device_id,), fetchone=True
    )
    if not existing:
        return jsonify({"error": "Équipement introuvable."}), 404

    device = query(
        """UPDATE devices SET
           name=%s, type=%s, ip_address=%s, vendor=%s, model=%s,
           os_version=%s, status=%s, ssh_username=%s, ssh_password=%s,
           ssh_port=%s, enable_password=%s
           WHERE id=%s RETURNING *""",
        (
            data.get("name"), data.get("type"), data.get("ipAddress"),
            data.get("vendor"), data.get("model"), data.get("osVersion"),
            data.get("status", "unknown"),
            data.get("sshUsername"), data.get("sshPassword"),
            int(data.get("sshPort", 22)), data.get("enablePassword"),
            device_id,
        ),
        returning=True
    )
    return jsonify(_fmt(device))


@devices_bp.route("/devices/<int:device_id>", methods=["DELETE"])
@admin_required
def delete_device(device_id):
    query("DELETE FROM devices WHERE id = %s", (device_id,))
    return "", 204


@devices_bp.route("/devices/<int:device_id>/test-connection", methods=["POST"])
@require_auth
def test_connection(device_id):
    device = query(
        "SELECT * FROM devices WHERE id = %s", (device_id,), fetchone=True
    )
    if not device:
        return jsonify({"success": False, "error": "Équipement introuvable."}), 404

    body = request.get_json() or {}
    username = body.get("username") or device["ssh_username"]
    password = body.get("password") or device["ssh_password"]
    port = int(body.get("port") or device["ssh_port"] or 22)

    if not username or not password:
        return jsonify({
            "success": False,
            "error": "Identifiants SSH non configurés pour cet équipement."
        }), 400

    result = test_ssh_connection(
        host=device["ip_address"],
        port=port,
        username=username,
        password=password,
    )
    return jsonify(result)


@devices_bp.route("/devices/export-csv", methods=["GET"])
def export_devices_csv():
    """Exporte l'inventaire complet en format CSV."""
    devices = query("SELECT * FROM devices ORDER BY created_at ASC", fetchall=True)

    output = io.StringIO()
    writer = csv.writer(output, delimiter=";")
    writer.writerow(["nom", "type", "ip", "fabricant", "modele", "os", "statut",
                     "ssh_user", "ssh_port"])
    for d in (devices or []):
        writer.writerow([
            d["name"], d["type"], d["ip_address"], d["vendor"],
            d["model"], d["os_version"], d["status"],
            d["ssh_username"] or "", d["ssh_port"] or 22,
        ])

    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=netguard_equipements.csv"}
    )


@devices_bp.route("/devices/import-csv", methods=["POST"])
@require_auth
def import_devices_csv():
    """
    Importe des équipements depuis un fichier CSV.
    Format attendu : nom;type;ip;fabricant;modele;os;statut;ssh_user;ssh_password;ssh_port
    La première ligne (en-tête) est ignorée.
    """
    if "file" not in request.files:
        return jsonify({"error": "Aucun fichier fourni."}), 400

    file = request.files["file"]
    if not file.filename.endswith(".csv"):
        return jsonify({"error": "Seuls les fichiers CSV (.csv) sont acceptés."}), 400

    content = file.read().decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(content), delimiter=";")

    created = []
    errors = []

    # Mapping permissif des noms de colonnes
    FIELD_MAP = {
        "nom": "name", "name": "name",
        "type": "type",
        "ip": "ipAddress", "ip_address": "ipAddress", "adresse ip": "ipAddress",
        "fabricant": "vendor", "vendor": "vendor",
        "modele": "model", "modèle": "model", "model": "model",
        "os": "osVersion", "os_version": "osVersion", "version os": "osVersion",
        "statut": "status", "status": "status",
        "ssh_user": "sshUsername", "ssh_username": "sshUsername",
        "ssh_password": "sshPassword", "ssh_pass": "sshPassword",
        "ssh_port": "sshPort",
        "enable_password": "enablePassword",
    }

    for i, row in enumerate(reader, start=2):
        mapped = {}
        for col, val in row.items():
            key = FIELD_MAP.get((col or "").strip().lower())
            if key:
                mapped[key] = (val or "").strip()

        name = mapped.get("name", "")
        ip = mapped.get("ipAddress", "")
        if not name or not ip:
            errors.append(f"Ligne {i}: nom ou IP manquant — ignorée.")
            continue

        try:
            device = query(
                """INSERT INTO devices
                   (name, type, ip_address, vendor, model, os_version, status,
                    ssh_username, ssh_password, ssh_port, enable_password)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   RETURNING *""",
                (
                    name,
                    mapped.get("type", "switch"),
                    ip,
                    mapped.get("vendor", "Cisco"),
                    mapped.get("model", "N/A"),
                    mapped.get("osVersion", "N/A"),
                    mapped.get("status", "unknown"),
                    mapped.get("sshUsername") or None,
                    mapped.get("sshPassword") or None,
                    int(mapped.get("sshPort") or 22),
                    mapped.get("enablePassword") or None,
                ),
                returning=True
            )
            created.append(_fmt(device))
        except Exception as e:
            errors.append(f"Ligne {i}: {str(e)}")

    return jsonify({
        "created": len(created),
        "errors": errors,
        "devices": created,
    }), 201


@devices_bp.route("/devices/<int:device_id>/fetch-config", methods=["POST"])
@require_auth
def fetch_device_config(device_id):
    """Récupère la configuration courante d'un équipement via SSH."""
    device = query("SELECT * FROM devices WHERE id = %s", (device_id,), fetchone=True)
    if not device:
        return jsonify({"error": "Équipement introuvable."}), 404

    data = request.get_json(silent=True) or {}
    username = data.get("username") or device["ssh_username"]
    password = data.get("password") or device["ssh_password"]
    port = data.get("port") or device["ssh_port"] or 22

    if not username or not password:
        return jsonify({"error": "Identifiants SSH manquants. Configurez-les dans l'équipement."}), 400

    try:
        config = fetch_running_config(
            host=device["ip_address"],
            port=int(port),
            username=username,
            password=password,
            vendor=device.get("vendor", "cisco"),
            enable_password=device.get("enable_password"),
        )
        if not config or len(config.strip()) < 10:
            return jsonify({"error": "Configuration vide reçue. Vérifiez les droits SSH."}), 502
        return jsonify({"config": config, "device": device["name"]}), 200
    except Exception as e:
        return jsonify({"error": f"Connexion SSH échouée : {str(e)}"}), 502
