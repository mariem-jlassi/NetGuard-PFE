"""
Moteur NLP de détection d'anomalies réseau.
Analyse la configuration brute d'un équipement (Cisco IOS ou FortiGate)
et retourne la liste des anomalies détectées selon des règles expertes.
Chaque règle peut cibler un vendeur spécifique via le champ 'vendors'.
"""

import re


RULES = [

    # ──────────────────────────────────────────────────────────────
    # CISCO IOS
    # ──────────────────────────────────────────────────────────────
    {
        "id": "TELNET_ENABLED",
        "vendors": ["cisco"],
        "anomaly_type": "insecure_protocol",
        "severity": "critical",
        "description": "Telnet activé sur les lignes VTY. Les données transitent en clair.",
        "suggestion": "Désactiver Telnet : 'transport input ssh' sur toutes les lignes VTY.",
        "commands": ["line vty 0 4", "transport input ssh", "line vty 5 15", "transport input ssh"],
        "pattern": re.compile(r"transport\s+input\s+.*telnet", re.IGNORECASE),
        "negative": False,
    },
    {
        "id": "WEAK_ENABLE_PASSWORD",
        "vendors": ["cisco"],
        "anomaly_type": "weak_authentication",
        "severity": "critical",
        "description": "Utilisation de 'enable password' en clair au lieu de 'enable secret' (MD5).",
        "suggestion": "Remplacer par : 'enable secret <mot_de_passe>'",
        "commands": ["enable secret NetGuard@2024", "no enable password"],
        "pattern": re.compile(r"^enable\s+password\s+", re.IGNORECASE | re.MULTILINE),
        "negative": False,
    },
    {
        "id": "SNMP_DEFAULT_COMMUNITY_CISCO",
        "vendors": ["cisco"],
        "anomaly_type": "default_credentials",
        "severity": "high",
        "description": "Communauté SNMP par défaut ('public' ou 'private') détectée.",
        "suggestion": "Changer la communauté SNMP et migrer vers SNMPv3.",
        "commands": ["no snmp-server community public", "no snmp-server community private", "snmp-server community NetGuard2024 RO"],
        "pattern": re.compile(r"snmp-server\s+community\s+(public|private)\b", re.IGNORECASE),
        "negative": False,
    },
    {
        "id": "HTTP_SERVER_ENABLED",
        "vendors": ["cisco"],
        "anomaly_type": "insecure_service",
        "severity": "high",
        "description": "Serveur HTTP non sécurisé activé sur l'équipement Cisco.",
        "suggestion": "Désactiver HTTP : 'no ip http server'. Utiliser HTTPS uniquement.",
        "commands": ["no ip http server"],
        "pattern": re.compile(r"^ip\s+http\s+server\b", re.IGNORECASE | re.MULTILINE),
        "negative": False,
    },
    {
        "id": "NO_SSH_VERSION2",
        "vendors": ["cisco"],
        "anomaly_type": "insecure_protocol",
        "severity": "high",
        "description": "SSH version 2 non configuré. SSHv1 est vulnérable.",
        "suggestion": "Activer SSH version 2 : 'ip ssh version 2'",
        "commands": ["ip ssh version 2"],
        "pattern": re.compile(r"ip\s+ssh\s+version\s+2", re.IGNORECASE),
        "negative": True,
    },
    {
        "id": "NO_LOGGING_CISCO",
        "vendors": ["cisco"],
        "anomaly_type": "missing_logging",
        "severity": "medium",
        "description": "Aucune configuration de journalisation (logging) détectée.",
        "suggestion": "Activer le logging : 'logging on' et 'logging buffered 16384'",
        "commands": ["logging on", "logging buffered 16384", "logging console informational"],
        "pattern": re.compile(r"^logging\s+(on|buffered|console|host)", re.IGNORECASE | re.MULTILINE),
        "negative": True,
    },
    {
        "id": "PERMISSIVE_ACL",
        "vendors": ["cisco"],
        "anomaly_type": "permissive_acl",
        "severity": "high",
        "description": "Règle ACL permissive : autorisation de tout le trafic sans restriction.",
        "suggestion": "Restreindre les ACL. Supprimer les règles 'permit any any'.",
        "commands": ["ip access-list extended NETGUARD_ACL", "permit ip 192.168.0.0 0.0.255.255 any", "deny ip any any log"],
        "pattern": re.compile(r"permit\s+any\s+any", re.IGNORECASE),
        "negative": False,
    },
    {
        "id": "PASSWORD_PLAINTEXT",
        "vendors": ["cisco"],
        "anomaly_type": "weak_authentication",
        "severity": "critical",
        "description": "Mot de passe en clair détecté dans la configuration.",
        "suggestion": "Activer le chiffrement global : 'service password-encryption'",
        "commands": ["service password-encryption"],
        "pattern": re.compile(r"^\s+password\s+(?!7\s|0\s)\S+", re.IGNORECASE | re.MULTILINE),
        "negative": False,
    },
    {
        "id": "NO_BANNER",
        "vendors": ["cisco"],
        "anomaly_type": "missing_banner",
        "severity": "low",
        "description": "Aucun message d'avertissement (banner) configuré.",
        "suggestion": "Ajouter un banner : 'banner motd # ACCES AUTORISE UNIQUEMENT #'",
        "commands": ["banner motd # ACCES AUTORISE UNIQUEMENT - NetGuard Security #"],
        "pattern": re.compile(r"^banner\s+(motd|login|exec)", re.IGNORECASE | re.MULTILINE),
        "negative": True,
    },
    {
        "id": "CDP_ENABLED",
        "vendors": ["cisco"],
        "anomaly_type": "information_disclosure",
        "severity": "low",
        "description": "CDP actif. Expose les informations de l'infrastructure réseau.",
        "suggestion": "Désactiver CDP : 'no cdp run'",
        "commands": ["no cdp run"],
        "pattern": re.compile(r"^no\s+cdp\s+run", re.IGNORECASE | re.MULTILINE),
        "negative": True,
    },
    {
        "id": "NO_STP_RAPID_PVST",
        "vendors": ["cisco"],
        "anomaly_type": "stp_no_rapid_pvst",
        "severity": "medium",
        "description": "Spanning Tree en mode PVST. Rapid-PVST+ recommande.",
        "suggestion": "Activer Rapid-PVST+ : spanning-tree mode rapid-pvst",
        "commands": ["spanning-tree mode rapid-pvst"],
        "pattern": re.compile(r"spanning-tree\s+mode\s+rapid-pvst", re.IGNORECASE),
        "negative": True,
    },
    {
        "id": "NO_STP_BPDUGUARD",
        "vendors": ["cisco"],
        "anomaly_type": "stp_no_bpduguard",
        "severity": "high",
        "description": "BPDU Guard non active. Risque d attaque STP.",
        "suggestion": "Activer BPDU Guard : spanning-tree portfast bpduguard default",
        "commands": ["spanning-tree portfast bpduguard default"],
        "pattern": re.compile(r"spanning-tree\s+portfast\s+(?:edge\s+)?bpduguard\s+default", re.IGNORECASE),
        "negative": True,
    },
        {
        "id": "NO_NTP_CISCO",
        "vendors": ["cisco"],
        "anomaly_type": "missing_ntp",
        "severity": "medium",
        "description": "Aucun serveur NTP configuré. L'horodatage des logs sera incorrect.",
        "suggestion": "Configurer un serveur NTP : 'ntp server <ip>'",
        "commands": ["ntp server 192.168.1.1", "ntp update-calendar"],
        "pattern": re.compile(r"^ntp\s+server\s+", re.IGNORECASE | re.MULTILINE),
        "negative": True,
    },
    {
        "id": "NO_SERVICE_PASSWORD_ENCRYPTION",
        "vendors": ["cisco"],
        "anomaly_type": "weak_authentication",
        "severity": "high",
        "description": "'service password-encryption' absent. Les mots de passe sont stockés en clair.",
        "suggestion": "Activer : 'service password-encryption'",
        "commands": ["service password-encryption"],
        "pattern": re.compile(r"^service\s+password-encryption", re.IGNORECASE | re.MULTILINE),
        "negative": True,
    },
    {
        "id": "VTY_NO_ACCESS_CLASS",
        "vendors": ["cisco"],
        "anomaly_type": "missing_vty_acl",
        "severity": "high",
        "description": "Lignes VTY accessibles sans restriction d'adresse IP (pas d'access-class).",
        "suggestion": "Restreindre l'accès VTY par ACL : 'access-class <ACL> in'",
        "commands": ["ip access-list standard SSH_ACCESS", "permit 192.168.0.0 0.0.255.255", "deny any log", "line vty 0 4", "access-class SSH_ACCESS in"],
        "pattern": re.compile(r"access-class\s+\S+\s+in", re.IGNORECASE),
        "negative": True,
    },

    # ──────────────────────────────────────────────────────────────
    # FORTIGATE / FORTINET
    # ──────────────────────────────────────────────────────────────
    {
        "id": "FORTI_TELNET_ENABLED",
        "vendors": ["fortinet", "fortigate"],
        "anomaly_type": "insecure_protocol",
        "severity": "critical",
        "description": "Telnet activé sur l'interface de gestion FortiGate. Protocole non chiffré.",
        "suggestion": "Retirer telnet : 'set allowaccess ping https ssh'",
        "commands": ["config system interface", "edit port1", "set allowaccess ping https ssh", "next", "end"],
        "pattern": re.compile(r"set\s+allowaccess\s+[^\n]*telnet", re.IGNORECASE),
        "negative": False,
    },
    {
        "id": "FORTI_HTTP_ENABLED",
        "vendors": ["fortinet", "fortigate"],
        "anomaly_type": "insecure_service",
        "severity": "high",
        "description": "Accès HTTP non chiffré activé sur l'interface de gestion FortiGate.",
        "suggestion": "Désactiver HTTP, garder HTTPS : 'set allowaccess ping https ssh'",
        "commands": ["config system interface", "edit port1", "set allowaccess ping https ssh", "next", "end"],
        "pattern": re.compile(r"set\s+allowaccess\s+[^\n]*\bhttp\b(?!s)", re.IGNORECASE),
        "negative": False,
    },
    {
        "id": "FORTI_NO_NTP",
        "vendors": ["fortinet", "fortigate"],
        "anomaly_type": "missing_ntp",
        "severity": "medium",
        "description": "NTP non configuré sur le FortiGate. L'horodatage des logs sera incorrect.",
        "suggestion": "Activer la synchronisation NTP : 'set ntpsync enable'",
        "commands": ["config system ntp", "set ntpsync enable", "set type custom", "config ntpserver", "edit 1", "set server 192.168.1.254", "next", "end", "end"],
        "pattern": re.compile(r"set\s+ntpsync\s+enable", re.IGNORECASE),
        "negative": True,
    },
    {
        "id": "FORTI_NO_LOGGING",
        "vendors": ["fortinet", "fortigate"],
        "anomaly_type": "missing_logging",
        "severity": "medium",
        "description": "Journalisation Syslog non configurée sur le FortiGate.",
        "suggestion": "Activer Syslog vers serveur centralisé.",
        "commands": ["config log syslogd setting", "set status enable", "set server 192.168.75.130", "set port 514", "set facility local7", "end"],
        "pattern": re.compile(r"config\s+log\s+syslogd\s+setting[\s\S]{0,200}?set\s+status\s+enable", re.IGNORECASE),
        "negative": True,
    },
    {
        "id": "FORTI_NO_BANNER",
        "vendors": ["fortinet", "fortigate"],
        "anomaly_type": "missing_banner",
        "severity": "medium",
        "description": "Bannière de pré-connexion non activée sur le FortiGate.",
        "suggestion": "Activer la bannière : 'set pre-login-banner enable'",
        "commands": ["config system global", "set pre-login-banner enable", "end"],
        "pattern": re.compile(r"set\s+pre-login-banner\s+enable", re.IGNORECASE),
        "negative": True,
    },
    {
        "id": "FORTI_SNMP_DEFAULT",
        "vendors": ["fortinet", "fortigate"],
        "anomaly_type": "default_credentials",
        "severity": "high",
        "description": "Communauté SNMP par défaut ('public') détectée sur le FortiGate.",
        "suggestion": "Remplacer la communauté SNMP par un nom sécurisé.",
        "commands": ["config system snmp community", "edit 1", "set name NetGuardSNMP", "end"],
        "pattern": re.compile(r"set\s+name\s+[\"']?public[\"']?", re.IGNORECASE),
        "negative": False,
    },
    {
        "id": "FORTI_ADMIN_NO_TIMEOUT",
        "vendors": ["fortinet", "fortigate"],
        "anomaly_type": "weak_session",
        "severity": "medium",
        "description": "Timeout de session administrateur non configuré (ou trop élevé) sur le FortiGate.",
        "suggestion": "Limiter à 5 minutes : 'set admintimeout 5'",
        "commands": ["config system global", "set admintimeout 5", "end"],
        "pattern": re.compile(r"set\s+admintimeout\s+([1-9]|1[0-5])\b", re.IGNORECASE),
        "negative": True,
    },
    {
        "id": "FORTI_LLDP_ENABLED",
        "vendors": ["fortinet", "fortigate"],
        "anomaly_type": "info_disclosure",
        "severity": "medium",
        "description": "LLDP activé sur le FortiGate — fuite d'informations de topologie possible.",
        "suggestion": "Désactiver LLDP : 'set lldp-transmission disable' et 'set lldp-reception disable'.",
        "commands": ["config system global", "set lldp-reception disable", "set lldp-transmission disable", "end"],
        "pattern": re.compile(r"set\s+lldp-transmission\s+disable", re.IGNORECASE),
        "negative": True,
    },
    {
        "id": "FORTI_WEAK_CRYPTO",
        "vendors": ["fortinet", "fortigate"],
        "anomaly_type": "weak_crypto",
        "severity": "high",
        "description": "Chiffrement fort SSH/SSL non activé sur le FortiGate.",
        "suggestion": "Activer le chiffrement fort : 'set strong-crypto enable'.",
        "commands": ["config system global", "set strong-crypto enable", "set ssl-static-key-ciphers disable", "set ssl-min-proto-version TLSv1.2", "set admin-ssh-v1 disable", "end"],
        "pattern": re.compile(r"set\s+(?:strong-crypto\s+enable|ssl-static-key-ciphers\s+disable)", re.IGNORECASE),
        "negative": True,
    },
    {
        "id": "FORTI_WEAK_PASSWORD_POLICY",
        "vendors": ["fortinet", "fortigate"],
        "anomaly_type": "weak_password",
        "severity": "medium",
        "description": "Politique de mot de passe faible ou absente sur le FortiGate.",
        "suggestion": "Activer une politique stricte : 'set status enable' + 'set minimum-length 12'.",
        "commands": ["config system password-policy", "set status enable", "set minimum-length 8", "set expire-status disable", "set min-lower-case-letter 0", "set min-upper-case-letter 0", "set min-non-alphanumeric 0", "end"],
        "pattern": re.compile(r"config\s+system\s+password-policy[\s\S]{0,200}?set\s+status\s+enable", re.IGNORECASE),
        "negative": True,
    },
    {
        "id": "FORTI_DEFAULT_ADMIN",
        "vendors": ["fortinet", "fortigate"],
        "anomaly_type": "default_credentials",
        "severity": "critical",
        "description": "Compte admin sans mot de passe configuré ou laissé en credentials par défaut.",
        "suggestion": "Définir un mot de passe fort pour le compte admin.",
        "commands": ["config system admin", "edit admin", "set password Netguard@2024", "set accprofile super_admin", "next", "end"],
        "pattern": re.compile(r'edit\s+"admin"[\s\S]{0,3000}?set\s+password\s+ENC\s+\S{10,}', re.IGNORECASE),
        "negative": True,
    },
    {
        "id": "FORTI_NO_DEVICE_ID",
        "vendors": ["fortinet", "fortigate"],
        "anomaly_type": "missing_port_security",
        "severity": "medium",
        "description": "Identification des équipements connectés non activée (équivalent Port Security FortiGate).",
        "suggestion": "Activer 'set device-identification enable' sur les interfaces d'accès.",
        "commands": ["config system interface", "edit port1", "set device-identification enable", "next", "end"],
        "pattern": re.compile(r"set\s+device-identification\s+enable", re.IGNORECASE),
        "negative": True,
    },
    {
        "id": "FORTI_NO_LOCKOUT",
        "vendors": ["fortinet", "fortigate"],
        "anomaly_type": "missing_lockout",
        "severity": "high",
        "description": "Verrouillage admin après échecs de login non configuré (brute-force possible).",
        "suggestion": "Activer le lockout : 'set admin-lockout-threshold 3' et 'set admin-lockout-duration 60'.",
        "commands": ["config system global", "set admin-lockout-threshold 3", "set admin-lockout-duration 60", "end"],
        "pattern": re.compile(r"set\s+admin-lockout-threshold\s+\d+", re.IGNORECASE),
        "negative": True,
    },
    {
        "id": "FORTI_NO_MGMT_ACL",
        "vendors": ["fortinet", "fortigate"],
        "anomaly_type": "weak_management_acl",
        "severity": "high",
        "description": "Aucune restriction d'accès admin par sous-réseau (trusthost / objet MGMT) configurée.",
        "suggestion": "Restreindre l'accès admin via 'set trusthost1' ou un objet adresse 'MGMT-SUBNET'.",
        "commands": ["config firewall address", "edit MGMT-SUBNET", "set subnet 192.168.99.0 255.255.255.0", "next", "end"],
        "pattern": re.compile(r"(edit\s+\"?MGMT-SUBNET\"?|set\s+trusthost\d+)", re.IGNORECASE),
        "negative": True,
    },
    {
        "id": "FORTI_NO_MGMT_VDOM",
        "vendors": ["fortinet", "fortigate"],
        "anomaly_type": "missing_mgmt_isolation",
        "severity": "medium",
        "description": "VDOM de management non explicitement défini sur le FortiGate.",
        "suggestion": "Définir le VDOM de management : 'set management-vdom root'.",
        "commands": ["config system global", "set management-vdom root", "end"],
        "pattern": re.compile(r"set\s+management-vdom\s+\S+", re.IGNORECASE),
        "negative": True,
    },
    {
        "id": "FORTI_WEAK_VPN",
        "vendors": ["fortinet", "fortigate"],
        "anomaly_type": "weak_vpn",
        "severity": "high",
        "description": "Tunnel VPN sans IKEv2 forcé (utilisation possible d'IKEv1, considéré obsolète).",
        "suggestion": "Forcer IKEv2 : 'set ike-version 2' dans config vpn ipsec phase1-interface.",
        "commands": ["config vpn ipsec phase1-interface", "edit VPN-NetGuard", "set ike-version 2", "next", "end"],
        "pattern": re.compile(r"set\s+ike-version\s+2", re.IGNORECASE),
        "negative": True,
    },
    {
        "id": "FORTI_NO_ANTISPOOFING",
        "vendors": ["fortinet", "fortigate"],
        "anomaly_type": "missing_antispoofing",
        "severity": "medium",
        "description": "Politique de routage anti-spoofing (router policy deny par défaut) non détectée.",
        "suggestion": "Définir une 'router policy' deny par défaut pour bloquer le trafic non légitime.",
        "commands": ["config router policy", "edit 1", "set src 0.0.0.0/0", "set dst 0.0.0.0/0", "set action deny", "next", "end"],
        "pattern": re.compile(r"config\s+router\s+policy", re.IGNORECASE),
        "negative": True,
    },
    {
        "id": "FORTI_BASIC_LOGGING",
        "vendors": ["fortinet", "fortigate"],
        "anomaly_type": "incomplete_logging",
        "severity": "low",
        "description": "Logs détaillés (resolve-ip / resolve-port) non activés sur le FortiGate.",
        "suggestion": "Enrichir la journalisation : 'set resolve-ip enable' + 'set resolve-port enable'.",
        "commands": ["config log setting", "set resolve-ip enable", "set resolve-port enable", "set log-user-in-upper enable", "end"],
        "pattern": re.compile(r"set\s+resolve-ip\s+enable", re.IGNORECASE),
        "negative": True,
    },

    # === 7 nouvelles règles Cisco (alignement 22 règles / 20 templates) ===
    {
        "id": "NO_EXEC_TIMEOUT",
        "description": "Lignes VTY sans timeout d'inactivite - sessions admin permanentes (risque de hijack).",
        "severity": "medium",
        "anomaly_type": "missing_timeout",
        "vendors": ["cisco"],
        "pattern": re.compile(r"line\s+vty[\s\S]{0,300}?exec-timeout\s+[1-9]"),
        "negative": True,
        "suggestion": "Configurer un timeout d'inactivite (10 min) sur les lignes VTY pour fermer les sessions inutilisees.",
        "commands": ["line vty 0 4", "exec-timeout 5 0", "exit"],
    },
    {
        "id": "NO_PORT_SECURITY",
        "description": "Port Security non configure sur les ports d'acces (risque usurpation MAC).",
        "severity": "medium",
        "anomaly_type": "missing_port_security",
        "vendors": ["cisco"],
        "pattern": re.compile(r"switchport\s+port-security"),
        "negative": True,
        "suggestion": "Activer Port Security sur les ports d'acces avec limite de MAC et action restrict.",
        "commands": ["interface range GigabitEthernet0/0-3", "switchport mode access", "switchport port-security", "switchport port-security maximum 2", "switchport port-security violation restrict", "end"],
    },
    {
        "id": "UNUSED_PORTS_UP",
        "description": "Ports inutilises actifs (sans description ni shutdown) - risque d'acces non autorise.",
        "severity": "medium",
        "anomaly_type": "unused_ports_up",
        "vendors": ["cisco"],
        "pattern": re.compile(r"interface\s+GigabitEthernet1/[0-3](?:(?!\ninterface)[\s\S])*?\n\s*shutdown"),
        "negative": True,
        "suggestion": "Desactiver (shutdown) tous les ports physiques non utilises pour eviter tout acces non autorise.",
        "commands": ["interface range GigabitEthernet1/0-3", "switchport mode access", "shutdown", "exit"],
    },
    {
        "id": "DEFAULT_VLAN_MGMT",
        "description": "Interface de gestion sur VLAN 1 par defaut - risque de compromission via broadcast.",
        "severity": "medium",
        "anomaly_type": "default_vlan_mgmt",
        "vendors": ["cisco"],
        "pattern": re.compile(r"interface\s+Vlan1\s*\n[\s\S]{0,200}?ip\s+address\s+\d"),
        "negative": False,
        "suggestion": "Creer un VLAN dedie pour la gestion (eviter le VLAN 1 par defaut).",
        "commands": ["vlan 99", "name MGMT", "exit", "interface vlan 99", "ip address 192.168.99.1 255.255.255.0", "no shutdown", "end"],
    },
    {
        "id": "TRUNK_INSECURE",
        "description": "Lignes trunk sans restriction VLAN (allowed vlan all) - risque de VLAN hopping.",
        "severity": "medium",
        "anomaly_type": "weak_trunk",
        "vendors": ["cisco"],
        "pattern": re.compile(r"switchport\s+trunk\s+allowed\s+vlan\s+all", re.IGNORECASE | re.MULTILINE),
        "negative": False,
        "suggestion": "Restreindre la liste des VLANs autorises sur chaque lien trunk (eviter 'allowed vlan all').",
        "commands": ["interface range GigabitEthernet1/0-1", "switchport trunk encapsulation dot1q", "switchport mode trunk", "switchport trunk allowed vlan 10,20,30,99", "end"],
    },
    {
        "id": "WEAK_VPN_CISCO",
        "description": "Tunnel VPN configure avec IKEv1 (faible) au lieu d'IKEv2 recommande.",
        "severity": "high",
        "anomaly_type": "weak_vpn",
        "vendors": ["cisco"],
        "pattern": re.compile(r"crypto\s+(?:isakmp|ikev1)\s+policy"),
        "negative": False,
        "suggestion": "Migrer la configuration VPN de IKEv1 (crypto isakmp) vers IKEv2 (crypto ikev2 policy).",
        "commands": ["no crypto isakmp policy 1", "no crypto isakmp policy 10", "no crypto isakmp policy 100", "crypto ikev2 policy 10", "encryption aes-256", "integrity sha256", "group 14", "exit"],
    },
    {
        "id": "NO_DHCP_SNOOPING",
        "description": "DHCP Snooping non active (anti-spoofing) - risque d'attaque DHCP rogue/MITM.",
        "severity": "medium",
        "anomaly_type": "missing_antispoofing",
        "vendors": ["cisco"],
        "pattern": re.compile(r"^ip\s+dhcp\s+snooping\s*$", re.MULTILINE),
        "negative": True,
        "suggestion": "Activer DHCP Snooping (anti-spoofing) sur les VLANs concernes pour bloquer les serveurs DHCP rogue.",
        "commands": ["ip dhcp snooping", "ip dhcp snooping vlan 1,10,20,99", "no ip dhcp snooping information option", "end"],
    },
]


def _match_vendor(rule: dict, vendor: str) -> bool:
    """Vérifie si la règle s'applique au vendeur de l'équipement."""
    vendors = rule.get("vendors", [])
    if not vendors:
        return True
    v = vendor.lower()
    return any(kw in v for kw in vendors)


def extract_affected_line(config_text: str, pattern: re.Pattern) -> str:
    match = pattern.search(config_text)
    if match:
        return match.group(0).strip()[:120]
    return "Configuration globale"


def analyze_config(config_text: str, vendor: str = "", enabled_rules: set = None) -> list[dict]:
    """
    Analyse la configuration et retourne les anomalies détectées.
    - vendor        : filtre les règles par fabricant
    - enabled_rules : ensemble des IDs de règles actives (None = toutes actives)
    """
    import json
    anomalies = []

    for rule in RULES:
        if enabled_rules is not None and rule["id"] not in enabled_rules:
            continue
        if not _match_vendor(rule, vendor):
            continue

        matches = rule["pattern"].search(config_text)
        triggered = bool(matches)

        if rule["negative"]:
            triggered = not triggered

        if triggered:
            affected = (
                extract_affected_line(config_text, rule["pattern"])
                if not rule["negative"]
                else "Configuration manquante"
            )
            anomalies.append({
                "anomaly_type": rule["anomaly_type"],
                "severity": rule["severity"],
                "description": rule["description"],
                "affected_config": affected,
                "suggested_fix": rule["suggestion"],
                "commands": json.dumps(rule.get("commands", [])),
                "status": "open",
            })

    return anomalies
