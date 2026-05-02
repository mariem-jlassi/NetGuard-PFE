"""
Client SSH multi-vendeur utilisant Paramiko.
Gère Cisco IOS, FortiGate et Juniper avec leurs syntaxes spécifiques.
Compatible avec les anciens algorithmes SSH des équipements Cisco IOS.
"""

import time
import paramiko

_LEGACY_DISABLED = dict(pubkeys=["rsa-sha2-256", "rsa-sha2-512"])


def _make_client() -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    return client


def push_config_to_device(host: str, port: int, username: str, password: str,
                           vendor: str, commands: list[str],
                           enable_password: str = None) -> str:
    """
    Connecte à l'équipement via SSH et envoie une liste de commandes.
    Retourne la sortie complète de la session SSH.
    """
    client = _make_client()

    try:
        client.connect(
            hostname=host,
            port=port,
            username=username,
            password=password,
            timeout=10,
            banner_timeout=10,
            look_for_keys=False,
            allow_agent=False,
            disabled_algorithms=_LEGACY_DISABLED,
        )

        shell = client.invoke_shell()
        shell.settimeout(15)
        time.sleep(1.2)

        output = ""

        def send(cmd: str, wait: float = 0.5):
            shell.send(cmd + "\n")
            time.sleep(wait)
            while shell.recv_ready():
                chunk = shell.recv(4096).decode("utf-8", errors="replace")
                nonlocal output
                output += chunk

        v = vendor.lower()
        is_fortigate = "fortinet" in v or "fortigate" in v
        is_juniper = "juniper" in v

        if is_fortigate:
            for cmd in commands:
                send(cmd, 0.6)
            time.sleep(0.5)

        elif is_juniper:
            send("configure", 0.6)
            for cmd in commands:
                send(cmd, 0.6)
            send("commit", 1.0)
            send("exit", 0.5)

        else:
            if enable_password:
                send("enable", 0.5)
                import time as _t; _t.sleep(0.8)
                buf = ""
                while shell.recv_ready():
                    buf += shell.recv(4096).decode("utf-8", errors="replace")
                if "Password" in buf or "password" in buf:
                    send(enable_password, 0.8)

            send("terminal length 0", 0.3)

            exec_only = {"show", "ping", "traceroute", "debug", "undebug", "dir", "more", "copy"}
            is_exec_mode = all(
                any(c.strip().lower().startswith(p) for p in exec_only)
                for c in commands if c.strip()
            )

            if is_exec_mode:
                for cmd in commands:
                    send(cmd, 0.8)
            else:
                send("configure terminal", 0.5)
                skip = {"end", "write memory", "wr mem"}
                for cmd in commands:
                    if cmd.strip().lower() not in skip:
                        send(cmd, 0.6)
                send("end", 0.8)
                send("write memory", 5.0)
                time.sleep(3.0)

        shell.close()
        return output

    finally:
        client.close()


def fetch_running_config(host: str, port: int, username: str, password: str,
                          vendor: str, enable_password: str = None) -> str:
    """
    Récupère la configuration courante de l'équipement via SSH.
    """
    client = _make_client()

    try:
        client.connect(
            hostname=host,
            port=port,
            username=username,
            password=password,
            timeout=15,
            banner_timeout=15,
            look_for_keys=False,
            allow_agent=False,
            disabled_algorithms=_LEGACY_DISABLED,
        )

        shell = client.invoke_shell()
        shell.settimeout(20)
        time.sleep(1.5)

        output = ""

        def send(cmd: str, wait: float = 0.6):
            shell.send(cmd + "\n")
            time.sleep(wait)
            while shell.recv_ready():
                chunk = shell.recv(8192).decode("utf-8", errors="replace")
                nonlocal output
                output += chunk

        v = vendor.lower()
        is_fortigate = "fortinet" in v or "fortigate" in v

        if is_fortigate:
            send("config system console", 0.5)
            send("set output standard", 0.4)
            send("end", 0.4)
            output = ""
            send("show full-configuration", 1.0)
        else:
            if enable_password:
                send("enable", 0.5)
                import time as _t; _t.sleep(0.8)
                buf = ""
                while shell.recv_ready():
                    buf += shell.recv(4096).decode("utf-8", errors="replace")
                if "Password" in buf or "password" in buf:
                    send(enable_password, 0.8)
            send("terminal length 0", 0.4)
            output = ""
            send("show running-config", 1.0)

        deadline = time.time() + 25
        idle = 0
        while time.time() < deadline:
            if shell.recv_ready():
                chunk = shell.recv(8192).decode("utf-8", errors="replace")
                output += chunk
                idle = 0
            else:
                time.sleep(0.5)
                idle += 0.5
                if idle >= 3 and ("# end" in output[-200:] or output.rstrip().endswith("#")):
                    break

        shell.close()
        return output

    finally:
        client.close()


def test_ssh_connection(host: str, port: int, username: str, password: str) -> dict:
    """
    Teste la connectivité SSH à un équipement.
    Retourne {'success': bool, 'message': str, 'latency_ms': int}.
    """
    client = _make_client()
    start = time.time()
    try:
        client.connect(
            hostname=host,
            port=port,
            username=username,
            password=password,
            timeout=8,
            banner_timeout=8,
            look_for_keys=False,
            allow_agent=False,
            disabled_algorithms=_LEGACY_DISABLED,
        )
        latency = int((time.time() - start) * 1000)
        client.close()
        return {
            "success": True,
            "message": f"Connexion SSH établie en {latency}ms",
            "latency_ms": latency,
        }
    except paramiko.AuthenticationException:
        return {"success": False, "error": "Identifiants SSH incorrects"}
    except paramiko.SSHException as e:
        return {"success": False, "error": f"Erreur SSH : {str(e)}"}
    except Exception as e:
        return {"success": False, "error": f"Impossible de joindre l'équipement : {str(e)}"}
    finally:
        client.close()
