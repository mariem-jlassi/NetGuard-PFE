"""
Route SSH Push — envoi de commandes vers un équipement réseau depuis le terminal intégré.
"""

from flask import Blueprint, request, jsonify
from db import query
from utils.ssh_push import push_config_to_device, fetch_running_config
from routes.auth import require_auth, admin_required

ssh_bp = Blueprint("ssh", __name__)


@ssh_bp.route("/ssh-exec", methods=["POST"])
@require_auth
@admin_required
def ssh_exec():
    """
    Terminal multi-équipements : exécute des commandes SSH sur plusieurs appareils.
    Corps attendu : { deviceIds: int[], commands: string[], username?, password?, enablePassword? }
    Retourne : { results: [{ deviceName, ipAddress, output, success, error? }] }
    """
    data = request.get_json() or {}
    device_ids = data.get("deviceIds", [])
    commands = data.get("commands", [])

    if not device_ids or not commands:
        return jsonify({"error": "deviceIds et commands sont requis."}), 400

    results = []
    for dev_id in device_ids:
        device = query("SELECT * FROM devices WHERE id = %s", (dev_id,), fetchone=True)
        if not device:
            results.append({
                "deviceName": f"Device #{dev_id}",
                "ipAddress": "",
                "output": "",
                "success": False,
                "error": "Équipement introuvable.",
                "errorType": "UNKNOWN",
            })
            continue

        username = data.get("username") or device["ssh_username"]
        password = data.get("password") or device["ssh_password"]
        enable_password = data.get("enablePassword") or device.get("enable_password")
        port = int(device["ssh_port"] or 22)

        if not username or not password:
            results.append({
                "deviceName": device["name"],
                "ipAddress": device["ip_address"],
                "output": "",
                "success": False,
                "error": "Identifiants SSH manquants.",
                "errorType": "AUTH_FAILED",
            })
            continue

        try:
            output = push_config_to_device(
                host=device["ip_address"],
                port=port,
                username=username,
                password=password,
                vendor=device["vendor"],
                commands=commands,
                enable_password=enable_password,
            )
            results.append({
                "deviceName": device["name"],
                "ipAddress": device["ip_address"],
                "output": output,
                "success": True,
            })
        except Exception as e:
            err = str(e)
            error_type = "UNKNOWN"
            if "authentication" in err.lower() or "auth" in err.lower():
                error_type = "AUTH_FAILED"
            elif "timed out" in err.lower() or "timeout" in err.lower():
                error_type = "TIMEOUT"
            elif "refused" in err.lower() or "unreachable" in err.lower() or "connect" in err.lower():
                error_type = "NETWORK_UNREACHABLE"
            results.append({
                "deviceName": device["name"],
                "ipAddress": device["ip_address"],
                "output": "",
                "success": False,
                "error": err,
                "errorType": error_type,
            })

    return jsonify({"results": results})


@ssh_bp.route("/ssh/push", methods=["POST"])
@require_auth
@admin_required
def ssh_push():
    """
    Envoie une liste de commandes à un équipement réseau via SSH.
    Corps attendu : { deviceId, commands: string[], username?, password?, port? }
    """
    data = request.get_json() or {}
    device_id = data.get("deviceId")
    commands = data.get("commands", [])

    if not device_id or not commands:
        return jsonify({"error": "deviceId et commands sont requis."}), 400

    device = query(
        "SELECT * FROM devices WHERE id = %s", (device_id,), fetchone=True
    )
    if not device:
        return jsonify({"error": "Équipement introuvable."}), 404

    username = data.get("username") or device["ssh_username"]
    password = data.get("password") or device["ssh_password"]
    port = int(data.get("port") or device["ssh_port"] or 22)

    if not username or not password:
        return jsonify({"error": "Identifiants SSH manquants."}), 400

    try:
        output = push_config_to_device(
            host=device["ip_address"],
            port=port,
            username=username,
            password=password,
            vendor=device["vendor"],
            commands=commands,
            enable_password=device.get("enable_password"),
        )
        return jsonify({"success": True, "output": output})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@ssh_bp.route("/ssh/fetch-config", methods=["POST"])
@require_auth
@admin_required
def ssh_fetch_config():
    """
    Récupère la configuration courante d'un équipement via SSH (show running-config).
    """
    data = request.get_json() or {}
    device_id = data.get("deviceId")

    if not device_id:
        return jsonify({"error": "deviceId requis."}), 400

    device = query(
        "SELECT * FROM devices WHERE id = %s", (device_id,), fetchone=True
    )
    if not device:
        return jsonify({"error": "Équipement introuvable."}), 404

    username = data.get("username") or device["ssh_username"]
    password = data.get("password") or device["ssh_password"]
    port = int(data.get("port") or device["ssh_port"] or 22)

    if not username or not password:
        return jsonify({"error": "Identifiants SSH manquants."}), 400

    try:
        config = fetch_running_config(
            host=device["ip_address"],
            port=port,
            username=username,
            password=password,
            vendor=device["vendor"],
            enable_password=device.get("enable_password"),
        )
        return jsonify({"success": True, "config": config})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
