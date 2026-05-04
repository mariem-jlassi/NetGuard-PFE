"""
============================================================
 topology.py — Découverte automatique de la topologie réseau

 Protocoles supportés :
   CDP  → Cisco IOS/IOS-XE/NX-OS  → lien BLEU
   LLDP → Juniper / FortiGate      → lien VERT
   ARP  → FortiGate (fallback)     → lien ORANGE
============================================================
"""

import re
import time
import paramiko
from flask import Blueprint, jsonify
from db import query
from concurrent.futures import ThreadPoolExecutor

topology_bp = Blueprint("topology", __name__)


# ════════════════════════════════════════════════════════════
#  SSH : EXÉCUTION D'UNE COMMANDE SUR UN ÉQUIPEMENT
# ════════════════════════════════════════════════════════════

def run_ssh_command(host, port, username, password, command, vendor="cisco"):
    """
    Ouvre une session SSH interactive, envoie une commande
    et retourne la sortie texte brute.
    Supporte Cisco, Fortinet et Juniper.
    """
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    output = ""
    connected = False
    try:
        client.connect(
            hostname=host, port=port,
            username=username, password=password,
            timeout=6, banner_timeout=6, auth_timeout=6,
            look_for_keys=False, allow_agent=False,
            disabled_algorithms={"pubkeys": ["rsa-sha2-256", "rsa-sha2-512"]},
        )
        shell = client.invoke_shell()
        shell.settimeout(6)
        time.sleep(0.6)

        # Vider le buffer de bienvenue
        while shell.recv_ready():
            shell.recv(4096)

        # Désactiver la pagination (Cisco uniquement)
        if "fortinet" not in vendor.lower() and "juniper" not in vendor.lower():
            shell.send("terminal length 0\n")
            time.sleep(0.4)
            while shell.recv_ready():
                shell.recv(4096)

        shell.send(command + "\n")

        # Lire la réponse jusqu'au prompt ou timeout
        deadline  = time.time() + 6
        last_data = time.time()
        while time.time() < deadline:
            if shell.recv_ready():
                chunk      = shell.recv(8192).decode("utf-8", errors="replace")
                output    += chunk
                last_data  = time.time()
                if "--More--" in chunk or "-- More --" in chunk:
                    shell.send(" ")
                stripped = output.rstrip()
                if (stripped.endswith("#") or stripped.endswith(">")) and \
                   (time.time() - last_data) > 0.3:
                    break
            else:
                if time.time() - last_data > 1.2:
                    break
                time.sleep(0.1)

        shell.close()
    except Exception as e:
        if not connected:
            raise
    finally:
        client.close()
    return output


# ════════════════════════════════════════════════════════════
#  COMMANDE À EXÉCUTER SELON LE VENDOR
# ════════════════════════════════════════════════════════════

def get_neighbor_command(vendor):
    v = vendor.lower()
    if "fortinet" in v or "fortigate" in v:
        return "get lldp neighbors"
    if "juniper" in v:
        return "show lldp neighbors detail"
    return "show cdp neighbors detail"


# ════════════════════════════════════════════════════════════
#  PARSEURS DE VOISINS
# ════════════════════════════════════════════════════════════

def parse_cdp_neighbors(output):
    """
    CDP — Cisco IOS / IOS-XE / NX-OS.
    capabilities='CDP' → lien BLEU.
    """
    neighbors = []
    output = re.sub(r"\x1b\[[0-9;]*m", "", output)
    output = output.replace("\r\n", "\n").replace("\r", "\n")

    output_lower = output.lower()
    if any(x in output_lower for x in [
        "cdp is not enabled", "cdp is disabled",
        "not enabled", "% invalid", "no cdp",
    ]):
        return []

    blocks = re.split(r"-{5,}", output)
    for block in blocks:
        device_id_m = re.search(r"Device ID[:\s]+([^\n\r]+)", block, re.IGNORECASE)
        if not device_id_m:
            continue
        ip_m        = re.search(r"IP\s*address:\s*([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})", block, re.IGNORECASE)
        platform_m  = re.search(r"Platform[:\s]+([^\n\r,]+)",      block, re.IGNORECASE)
        local_if_m  = re.search(r"Interface[:\s]+([^,\n\r]+)",     block, re.IGNORECASE)
        remote_if_m = re.search(r"Port\s+ID[^:]*[:\s]+([^\n\r]+)", block, re.IGNORECASE)
        neighbors.append({
            "deviceId":        device_id_m.group(1).strip(),
            "ipAddress":       ip_m.group(1).strip()        if ip_m        else "",
            "platform":        platform_m.group(1).strip()  if platform_m  else "Inconnu",
            "localInterface":  local_if_m.group(1).strip()  if local_if_m  else "",
            "remoteInterface": remote_if_m.group(1).strip() if remote_if_m else "",
            "capabilities":    "CDP",
        })
    return neighbors


def parse_lldp_neighbors(output):
    """
    LLDP — Juniper.
    capabilities='LLDP' → lien VERT.
    """
    neighbors = []
    output = re.sub(r"\x1b\[[0-9;]*m", "", output)

    output_lower = output.lower()
    if any(x in output_lower for x in [
        "lldp is not enabled", "lldp disabled",
        "not enabled", "% invalid", "no lldp neighbors",
    ]):
        return []

    blocks = re.split(r"\n(?=\S)", output)
    for block in blocks:
        sys_m  = re.search(r"system.?name[:\s]+([^\n\r]+)",             block, re.IGNORECASE)
        port_m = re.search(r"(?:local.?port|interface)[:\s]+([^\n\r]+)", block, re.IGNORECASE)
        ip_m   = re.search(r"management.?address[:\s]+([0-9.]+)",        block, re.IGNORECASE)
        rem_m  = re.search(r"port.?id[:\s]+([^\n\r]+)",                  block, re.IGNORECASE)
        if sys_m:
            neighbors.append({
                "deviceId":        sys_m.group(1).strip(),
                "ipAddress":       ip_m.group(1).strip()   if ip_m   else "",
                "platform":        "Juniper",
                "localInterface":  port_m.group(1).strip() if port_m else "",
                "remoteInterface": rem_m.group(1).strip()  if rem_m  else "",
                "capabilities":    "LLDP",
            })
        elif port_m:
            parts = block.strip().split()
            if len(parts) >= 4:
                neighbors.append({
                    "deviceId":        parts[4] if len(parts) > 4 else parts[3],
                    "ipAddress":       "",
                    "platform":        "Juniper",
                    "localInterface":  parts[0],
                    "remoteInterface": parts[3],
                    "capabilities":    "LLDP",
                })
    return neighbors


def parse_fortigate_lldp(output):
    """
    LLDP FortiGate — 'get lldp neighbors'.
    capabilities='LLDP' → lien VERT.

    GARDES :
      1. Message d'erreur explicite → retourne []
      2. Aucune IP dans la sortie   → retourne []
      Dans les deux cas le fallback ARP est déclenché.
    """
    neighbors = []
    output = re.sub(r"\x1b\[[0-9;]*m", "", output)
    output = output.replace("\r\n", "\n").replace("\r", "\n")

    # Garde 1 : erreur explicite
    output_lower = output.lower()
    if any(x in output_lower for x in [
        "lldp is not enabled", "lldp disabled", "no lldp neighbor",
        "0 neighbor", "command fail", "% invalid", "unknown action",
    ]):
        return []

    # Garde 2 : pas d'IP valide → sortie texte d'erreur, pas des voisins
    has_ip = any(
        re.search(r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}', line)
        for line in output.splitlines()
        if line.strip() and not line.startswith("-")
    )
    if not has_ip:
        return []

    for line in output.splitlines():
        line = line.strip()
        if not line or line.lower().startswith("interface") or line.startswith("-"):
            continue
        parts = line.split()
        if len(parts) < 3:
            continue
        local_if    = parts[0]
        ip_m        = re.search(r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})', line)
        sys_m       = re.search(r'(?:system.?name|chassis.?id)[:\s]+([^\s,]+)', line, re.IGNORECASE)
        remote_if_m = re.search(r'(?:port.?id)[:\s]+([^\s,]+)', line, re.IGNORECASE)
        device_id   = sys_m.group(1) if sys_m else (parts[3] if len(parts) > 3 else "")
        if not device_id:
            continue
        neighbors.append({
            "deviceId":        device_id,
            "ipAddress":       ip_m.group(1) if ip_m else "",
            "platform":        "FortiGate-LLDP",
            "localInterface":  local_if,
            "remoteInterface": remote_if_m.group(1) if remote_if_m else (parts[4] if len(parts) > 4 else ""),
            "capabilities":    "LLDP",
        })
    return neighbors


def parse_fortigate_arp(output, known_devices):
    """
    ARP FortiGate — 'get system arp'.
    Fallback si LLDP inactif ou retourne une erreur.
    capabilities='ARP' → lien ORANGE.
    Seules les IPs présentes en base créent un lien.
    """
    neighbors = []
    seen_ips  = set()
    output    = re.sub(r"\x1b\[[0-9;]*m", "", output)

    for line in output.splitlines():
        parts = line.strip().split()
        if len(parts) < 4:
            continue
        ip        = parts[0]
        interface = parts[3] if len(parts) > 3 else parts[-1]
        if not re.match(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$', ip):
            continue
        if ip in seen_ips:
            continue
        seen_ips.add(ip)
        match = next((d for d in known_devices if d["ipAddress"] == ip), None)
        if match:
            neighbors.append({
                "deviceId":        match["name"],
                "ipAddress":       ip,
                "platform":        match.get("vendor", "Cisco"),
                "localInterface":  interface,
                "remoteInterface": "",
                "capabilities":    "ARP",
            })
    return neighbors


# ════════════════════════════════════════════════════════════
#  ROUTE PRINCIPALE : GET /api/topology
# ════════════════════════════════════════════════════════════

@topology_bp.route("/topology", methods=["GET"])
def get_topology():
    # Réinitialiser les liens en base avant chaque découverte
    query("DELETE FROM topology_links")

    devices   = query("SELECT * FROM devices ORDER BY created_at ASC", fetchall=True) or []
    reachable = [d for d in devices if d["ssh_username"] and d["ssh_password"]]

    topo_nodes    = []
    ssh_results   = []
    all_neighbors = {}

    # ── Construction des nœuds depuis la base ───────────────
    for device in devices:
        topo_nodes.append({
            "id":             str(device["id"]),
            "name":           device["name"],
            "type":           device["type"],
            "vendor":         device["vendor"],
            "ipAddress":      device["ip_address"],
            "status":         device["status"],
            "hasCredentials": bool(device["ssh_username"] and device["ssh_password"]),
            "neighbors":      [],
            "isExternal":     False,
        })

    # ── Découverte SSH en parallèle ──────────────────────────
    def _discover_one(device):
        cmd = get_neighbor_command(device["vendor"])
        v   = device["vendor"].lower()
        try:
            raw_output = run_ssh_command(
                host=device["ip_address"],
                port=device["ssh_port"] or 22,
                username=device["ssh_username"],
                password=device["ssh_password"],
                command=cmd,
                vendor=device["vendor"],
            )
            if "juniper" in v:
                neighbors = parse_lldp_neighbors(raw_output)
            elif "fortinet" in v or "fortigate" in v:
                # LLDP uniquement — pas de fallback ARP (evite les faux liens)
                neighbors = parse_fortigate_lldp(raw_output)
            else:
                neighbors = parse_cdp_neighbors(raw_output)

            return (device, neighbors, raw_output, None)
        except Exception as e:
            clean = re.sub(r"\[Errno\s*\w*\]\s*", "", str(e)).strip()
            return (device, [], "", clean)

    if reachable:
        with ThreadPoolExecutor(max_workers=min(8, len(reachable))) as ex:
            results = list(ex.map(_discover_one, reachable))

        for device, neighbors, raw_output, error in results:
            if error is None:
                all_neighbors[str(device["id"])] = neighbors
                ssh_results.append({
                    "deviceId":       device["id"],
                    "deviceName":     device["name"],
                    "ipAddress":      device["ip_address"],
                    "success":        True,
                    "neighbors":      neighbors,
                    "neighborsFound": len(neighbors),
                    "rawOutput":      raw_output[:3000] if raw_output else "",
                })
            else:
                ssh_results.append({
                    "deviceId":       device["id"],
                    "deviceName":     device["name"],
                    "ipAddress":      device["ip_address"],
                    "success":        False,
                    "error":          error,
                    "neighbors":      [],
                    "neighborsFound": 0,
                })

    # Mettre à jour hasCredentials selon le succès SSH réel
    ssh_success_map = {str(r["deviceId"]): r["success"] for r in ssh_results}
    for node in topo_nodes:
        if node["hasCredentials"] and not ssh_success_map.get(node["id"], False):
            node["hasCredentials"] = False

    # Injecter les voisins dans les nœuds
    for node in topo_nodes:
        node["neighbors"] = all_neighbors.get(node["id"], [])

    # ── Construction des arêtes (sans doublons) ──────────────
    edges      = []
    seen_links = set()

    for node in topo_nodes:
        for nb in node["neighbors"]:
            nb_short    = nb["deviceId"].split(".")[0].lower()
            target_node = next(
                (n for n in topo_nodes if
                 n["name"].lower() == nb["deviceId"].lower() or
                 n["name"].lower() == nb_short or
                 (nb["ipAddress"] and n["ipAddress"] == nb["ipAddress"])),
                None,
            )
            if not target_node:
                continue
            link_key = tuple(sorted([node["id"], target_node["id"]]))
            if link_key in seen_links:
                continue
            seen_links.add(link_key)
            edges.append({
                "source":   node["id"],
                "target":   target_node["id"],
                "protocol": nb.get("capabilities") or "CDP",
            })

    return jsonify({
        "nodes":          topo_nodes,
        "edges":          edges,
        "sshResults":     ssh_results,
        "totalDevices":   len(devices),
        "reachableCount": len(reachable),
    })