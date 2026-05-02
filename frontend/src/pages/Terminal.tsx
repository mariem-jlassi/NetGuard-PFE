import { useState, useRef, useEffect } from "react"
import { AppLayout } from "@/components/layout/AppLayout"
import { useGetDevices } from "@workspace/api-client-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Terminal, Send, Server, Shield, Eye, Play, RotateCcw,
  ChevronDown, ChevronUp, Wrench, MonitorDot, Circle,
  CheckCircle2, XCircle, AlertTriangle, Loader2, ShieldCheck, Zap, ArrowDown
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

function isFortigate(vendor: string) {
  return /fortinet|fortigate|forti/i.test(vendor)
}

type Mode = "terminal" | "correction"

// ── Commandes show Cisco (Switch / Routeur) ──────────────────────────────
const CISCO_SHOW_CMDS = [
  { group: "Interfaces",     items: ["show interface", "show ip interface brief", "show interface status"] },
  { group: "Système",        items: ["show version", "show processes cpu", "show memory statistics"] },
  { group: "Réseau",         items: ["show ip route", "show arp", "show mac address-table"] },
  { group: "Sécurité",       items: ["show ip ssh", "show line vty 0 4", "show users", "show logging"] },
  { group: "Infrastructure", items: ["show vlan brief", "show cdp neighbors", "show lldp neighbors", "show running-config"] },
]

// ── Commandes show FortiGate (Pare-feu) ───────────────────────────────────
const FORTIGATE_SHOW_CMDS = [
  { group: "Système",        items: ["get system status", "get system performance status", "diagnose sys top", "get system admin"] },
  { group: "Interfaces",     items: ["get system interface physical", "diagnose netlink interface list", "diagnose ip address list"] },
  { group: "Réseau",         items: ["get router info routing-table all", "get system arp", "diagnose sniffer packet any '' 4"] },
  { group: "Politiques",     items: ["show firewall policy", "get firewall policy", "diagnose firewall packet-count all"] },
  { group: "Sécurité / VPN", items: ["get vpn ipsec tunnel summary", "diagnose firewall auth list", "get system session list"] },
  { group: "Journaux",       items: ["execute log filter category event", "diagnose log test", "get log memory filter"] },
]

// ── Templates CISCO (Switch/Routeur) ──────────────────────────────────────
const CISCO_TEMPLATES = [
  {
    section: "Sécurité des accès",
    items: [
      {
        label: "SSH v2 uniquement (bloquer Telnet)",
        cmd: "line vty 0 4\ntransport input ssh\nlogin local\nexit\nip ssh version 2",
      },
      {
        label: "Authentification locale",
        cmd: "username admin privilege 15 secret Netguard@2024\nline vty 0 4\nlogin local\nexit",
      },
      {
        label: "Bannière MOTD",
        cmd: "banner motd ^C\n**** ACCES AUTORISE UNIQUEMENT ****\nToute connexion non autorisee est interdite.\n^C",
      },
      {
        label: "Timeout session (5 min)",
        cmd: "line vty 0 4\nexec-timeout 5 0\nexit\nline console 0\nexec-timeout 5 0\nexit",
      },
      {
        label: "Chiffrement des mots de passe",
        cmd: "service password-encryption\nenable secret Netguard@2024",
      },
    ],
  },
  {
    section: "Surveillance & Journalisation",
    items: [
      {
        label: "Syslog centralisé",
        cmd: "logging host 192.168.1.253\nlogging trap informational\nlogging on\nlogging buffered 16384",
      },
      {
        label: "NTP (synchronisation horaire)",
        cmd: "ntp server 192.168.1.254\nclock timezone CET 1\nclock summer-time CEST recurring",
      },
      {
        label: "SNMP v3 sécurisé",
        cmd: "no snmp-server community public\nno snmp-server community private\nsnmp-server group NGgroup v3 priv\nsnmp-server user NGuser NGgroup v3 auth sha Netguard@Auth priv aes 128 Netguard@Priv",
      },
    ],
  },
  {
    section: "Hardening réseau",
    items: [
      {
        label: "Désactiver CDP",
        cmd: "no cdp run",
      },
      {
        label: "Désactiver LLDP",
        cmd: "no lldp run",
      },
      {
        label: "Désactiver HTTP (garder HTTPS)",
        cmd: "no ip http server\nip http secure-server",
      },
      {
        label: "Port security (access ports)",
        cmd: "interface range GigabitEthernet0/1 - 24\nswitchport mode access\nswitchport port-security maximum 2\nswitchport port-security violation restrict\nswitchport port-security\nexit",
      },
      {
        label: "Désactiver ports inutilisés",
        cmd: "interface range GigabitEthernet0/10 - 24\nshutdown\nexit",
      },
    ],
  },
  {
    section: "Réseau & VLANs",
    items: [
      {
        label: "VLAN de gestion (VLAN 99)",
        cmd: "vlan 99\nname MANAGEMENT\nexit\ninterface vlan 99\nip address 192.168.99.1 255.255.255.0\nno shutdown\nexit",
      },
      {
        label: "Trunk sécurisé (VLAN autorisés)",
        cmd: "interface GigabitEthernet0/1\nswitchport mode trunk\nswitchport trunk allowed vlan 10,20,99\nswitchport nonegotiate\nexit",
      },
      {
        label: "STP PortFast + BPDU Guard",
        cmd: "spanning-tree portfast default\nspanning-tree portfast bpduguard default",
      },
    ],
  },
]

// ── Templates combinés (Cisco + FortiGate) ────────────────────────────────
const COMBINED_TEMPLATES: { label: string; desc: string; cisco: string; forti: string }[] = [
  { label: "Désactiver Telnet",        desc: "Bloquer Telnet, activer SSH uniquement",       cisco: "line vty 0 4\ntransport input ssh\nlogin local\nexit\nip ssh version 2", forti: "config system interface\nedit port1\nset allowaccess ping https ssh\nnext\nend" },
  { label: "Activer HTTPS uniquement", desc: "Désactiver HTTP admin, forcer HTTPS",           cisco: "no ip http server\nip http secure-server", forti: "config system interface\nedit port1\nset allowaccess ping https ssh\nnext\nend" },
  { label: "Configurer NTP",           desc: "Synchroniser l'horloge réseau",                 cisco: "ntp server 192.168.1.254\nclock timezone CET 1\nclock summer-time CEST recurring", forti: "config system ntp\nset ntpsync enable\nset type custom\nset syncinterval 60\nconfig ntpserver\nedit 1\nset server \"192.168.1.254\"\nnext\nend\nend" },
  { label: "Activer Syslog",           desc: "Envoyer les logs vers un serveur centralisé",   cisco: "logging host 192.168.1.253\nlogging trap informational\nlogging on\nlogging buffered 16384", forti: "config log syslogd setting\nset status enable\nset server \"192.168.1.253\"\nset port 514\nset facility local7\nend" },
  { label: "Bannière de sécurité",     desc: "Message d'avertissement à la connexion",        cisco: "banner motd ^C\n**** ACCES AUTORISE UNIQUEMENT ****\nToute connexion non autorisee est interdite.\n^C", forti: "config system global\nset pre-login-banner enable\nend\nconfig system replacemsg admin pre_admin-disclaimer-text\nset buffer \"**** ACCES AUTORISE UNIQUEMENT - NetGuard ****\"\nend" },
  { label: "SNMP sécurisé",            desc: "Remplacer les communautés par défaut",          cisco: "no snmp-server community public\nno snmp-server community private\nsnmp-server group NGgroup v3 priv\nsnmp-server user NGuser NGgroup v3 auth sha Netguard@Auth priv aes 128 Netguard@Priv", forti: "config system snmp sysinfo\nset status enable\nset description \"NetGuard PFE\"\nend\nconfig system snmp user\nedit \"NGuser\"\nset security-level auth-no-priv\nset queries enable\nset auth-proto sha\nset auth-pwd \"Netguard@Auth\"\nnext\nend" },
  { label: "Timeout Admin",            desc: "Déconnecter les sessions inactives",            cisco: "line vty 0 4\nexec-timeout 5 0\nexit\nline console 0\nexec-timeout 5 0\nexit", forti: "config system global\nset admintimeout 5\nend" },
  { label: "Désactiver CDP/LLDP",      desc: "Masquer les informations de topologie",         cisco: "no cdp run\nno lldp run", forti: "config system global\nset lldp-reception disable\nset lldp-transmission disable\nend" },
  { label: "SSH v2 exclusif",          desc: "Forcer SSH version 2, désactiver v1",           cisco: "ip ssh version 2\nip ssh time-out 60\nip ssh authentication-retries 3", forti: "config system global\nset admintimeout 5\nend" },
  { label: "Chiffrement des mots de passe", desc: "Renforcer le stockage des credentials",   cisco: "service password-encryption", forti: "config system password-policy\nset status enable\nset minimum-length 12\nend" },
  { label: "Authentification locale",  desc: "Créer un compte admin sécurisé",               cisco: "username admin privilege 15 secret Netguard@2024\nline vty 0 4\nlogin local\nexit", forti: "config system admin\nedit admin\nset password Netguard@2024\nset accprofile super_admin\nnext\nend" },
  { label: "Port Security",            desc: "Limiter les adresses MAC par port",             cisco: "interface range GigabitEthernet0/1 - 3\nswitchport mode access\nswitchport port-security\nswitchport port-security maximum 2\nswitchport port-security violation restrict\nexit", forti: "config system interface\nedit port1\nset device-identification enable\nnext\nend" },
  { label: "STP BPDU Guard",           desc: "Prévenir les attaques STP",                    cisco: "spanning-tree portfast default\nspanning-tree portfast bpduguard default", forti: "" },
  { label: "Désactiver ports inutilisés", desc: "Réduire la surface d'attaque",              cisco: "interface GigabitEthernet1/3\ndescription NETGUARD-PORT-DESACTIVE\nshutdown\nexit", forti: "config system global\nset admin-lockout-duration 60\nset admin-lockout-threshold 3\nend" },
  { label: "ACL de gestion",           desc: "Restreindre l'accès à l'interface admin",      cisco: "ip access-list standard MGMT-ACL\npermit 192.168.75.0 0.0.0.255\ndeny any log\nexit\nline vty 0 4\naccess-class MGMT-ACL in\nexit\nline vty 5 15\naccess-class MGMT-ACL in", forti: "config firewall address\nedit MGMT-SUBNET\nset subnet 192.168.99.0 255.255.255.0\nnext\nend" },
  { label: "VLAN de gestion",          desc: "Isoler le trafic d'administration",            cisco: "vlan 99\nname MANAGEMENT\nexit\ninterface vlan 99\nip address 192.168.99.1 255.255.255.0\nno shutdown\nexit", forti: "config system global\nset management-vdom root\nend" },
  { label: "Trunk sécurisé",           desc: "Limiter les VLANs autorisés sur le trunk",     cisco: "interface GigabitEthernet0/1\nswitchport mode trunk\nswitchport trunk allowed vlan 10,20,99\nswitchport nonegotiate\nexit", forti: "" },
  { label: "IKEv2 / VPN sécurisé",     desc: "Configurer un tunnel VPN avec chiffrement fort", cisco: "crypto ikev2 proposal ng-prop\nencryption aes-cbc-256\nintegrity sha256\ngroup 14\nexit\ncrypto ikev2 policy ng-policy\nproposal ng-prop\nexit", forti: "config vpn ipsec phase1-interface\nedit \"VPN-NetGuard\"\nset interface \"port1\"\nset ike-version 2\nset remote-gw 8.8.8.8\nset psksecret NetguardVPN2026\nnext\nend" },
  { label: "Anti-spoofing",            desc: "Filtrer les paquets avec source invalide",     cisco: "ip dhcp snooping\nip dhcp snooping vlan 1\nno ip dhcp snooping information option", forti: "config router policy\nedit 1\nset src 0.0.0.0/0\nset dst 0.0.0.0/0\nset action deny\nnext\nend" },
  { label: "Logging amélioré",         desc: "Activer les logs détaillés de session",        cisco: "logging buffered 65536 debugging\nlogging console informational\nlogging monitor informational", forti: "config log setting\nset resolve-ip enable\nset resolve-port enable\nset log-user-in-upper enable\nend" },
]

// ── Templates FORTIGATE (Firewall) ────────────────────────────────────────
const FORTIGATE_TEMPLATES = [
  {
    section: "Administration",
    items: [
      {
        label: "Désactiver Telnet et HTTP",
        cmd: "config system global\nset admin-telnet disable\nset admin-http disable\nset admin-https enable\nend",
      },
      {
        label: "Timeout admin (5 min)",
        cmd: "config system global\nset admintimeout 5\nend",
      },
      {
        label: "Bannière de connexion",
        cmd: "config system global\nset pre-login-banner \"**** ACCES AUTORISE UNIQUEMENT ****\"\nset post-login-banner \"Toute connexion non autorisee est enregistree.\"\nend",
      },
      {
        label: "Politique de mot de passe",
        cmd: "config system password-policy\nset status enable\nset minimum-length 12\nset must-contain upper-case-letter lower-case-letter number non-alphanumeric\nset expire-status enable\nset expire-day 90\nend",
      },
    ],
  },
  {
    section: "Surveillance & Journalisation",
    items: [
      {
        label: "Syslog centralisé",
        cmd: "config log syslogd setting\nset status enable\nset server \"192.168.1.253\"\nset port 514\nset facility local7\nend",
      },
      {
        label: "NTP (synchronisation horaire)",
        cmd: "config system ntp\nset ntpsync enable\nset type custom\nset ntpserver \"192.168.1.254\"\nset syncinterval 60\nend",
      },
      {
        label: "SNMP v3 sécurisé",
        cmd: "config system snmp community\ndelete 1\nend\nconfig system snmp user\nedit NGuser\nset security-level auth-priv\nset auth-proto sha\nset auth-pwd Netguard@Auth\nset priv-proto aes\nset priv-pwd Netguard@Priv\nnext\nend",
      },
      {
        label: "Activer logs sur disque",
        cmd: "config log disk setting\nset status enable\nset severity information\nset max-log-file-size 100\nend",
      },
    ],
  },
  {
    section: "Hardening sécurité",
    items: [
      {
        label: "Désactiver LLDP",
        cmd: "config system global\nset lldp-transmission disable\nset lldp-reception disable\nend",
      },
      {
        label: "Restreindre accès admin par IP",
        cmd: "config system interface\nedit \"mgmt\"\nset allowaccess https ssh\nnext\nend",
      },
      {
        label: "Activer IPS sur politiques",
        cmd: "config ips sensor\nedit \"default\"\nset block-malicious-url enable\nappend entries\nedit 1\nset severity high critical\nset action block\nnext\nend\nend",
      },
    ],
  },
  {
    section: "Réseau",
    items: [
      {
        label: "DNS sécurisé",
        cmd: "config system dns\nset primary 1.1.1.1\nset secondary 8.8.8.8\nset domain \"local\"\nend",
      },
      {
        label: "Interface management dédiée",
        cmd: "config system interface\nedit \"mgmt\"\nset mode static\nset ip 192.168.99.1 255.255.255.0\nset allowaccess https ssh\nset role management\nnext\nend",
      },
    ],
  },
]

type ErrType =
  | "SSH_CONN_REFUSED" | "SSH_AUTH_FAILED" | "SSH_TIMEOUT" | "SSH_NO_CREDS"
  | "SSH_SHELL" | "CLI_INVALID_CMD" | "CLI_INCOMPLETE_CMD" | "CLI_AMBIGUOUS_CMD"
  | "CLI_ACCESS_DENIED" | "CLI_ERROR" | "NETWORK_UNREACHABLE" | "UNKNOWN"

const ERR_LABELS: Record<ErrType, { label: string; cls: string }> = {
  SSH_CONN_REFUSED:   { label: "Connexion SSH refusée",    cls: "text-orange-300 bg-orange-900/40 border-orange-500/50" },
  SSH_AUTH_FAILED:    { label: "Authentification échouée", cls: "text-red-300 bg-red-900/40 border-red-500/50" },
  SSH_TIMEOUT:        { label: "Délai SSH dépassé",        cls: "text-yellow-300 bg-yellow-900/40 border-yellow-500/50" },
  SSH_NO_CREDS:       { label: "Identifiants manquants",   cls: "text-yellow-300 bg-yellow-900/40 border-yellow-500/50" },
  SSH_SHELL:          { label: "Erreur shell SSH",         cls: "text-red-300 bg-red-900/40 border-red-500/50" },
  CLI_INVALID_CMD:    { label: "Commande invalide",        cls: "text-red-300 bg-red-900/40 border-red-500/50" },
  CLI_INCOMPLETE_CMD: { label: "Commande incomplète",      cls: "text-orange-300 bg-orange-900/40 border-orange-500/50" },
  CLI_AMBIGUOUS_CMD:  { label: "Commande ambiguë",         cls: "text-yellow-300 bg-yellow-900/40 border-yellow-500/50" },
  CLI_ACCESS_DENIED:  { label: "Accès refusé (CLI)",       cls: "text-red-300 bg-red-900/40 border-red-500/50" },
  CLI_ERROR:          { label: "Erreur CLI",               cls: "text-red-300 bg-red-900/40 border-red-500/50" },
  NETWORK_UNREACHABLE:{ label: "Réseau inaccessible",      cls: "text-orange-300 bg-orange-900/40 border-orange-500/50" },
  UNKNOWN:            { label: "Erreur inconnue",          cls: "text-red-300 bg-red-900/40 border-red-500/50" },
}

/** Devine le type d'erreur depuis le message texte (fallback si l'API n'envoie pas errorType) */
function guessErrType(msg: string): ErrType {
  if (!msg) return "UNKNOWN"
  if (msg.includes("refusée") || msg.includes("ECONNREFUSED")) return "SSH_CONN_REFUSED"
  if (msg.includes("Authentification") || msg.includes("authentication")) return "SSH_AUTH_FAILED"
  if (msg.includes("Délai") || msg.includes("dépassé") || msg.includes("ETIMEDOUT")) return "SSH_TIMEOUT"
  if (msg.includes("manquants") || msg.includes("Configurez"))    return "SSH_NO_CREDS"
  if (msg.includes("inaccessible") || msg.includes("ENOTFOUND")) return "NETWORK_UNREACHABLE"
  if (msg.includes("Invalid input"))   return "CLI_INVALID_CMD"
  if (msg.includes("Incomplete"))      return "CLI_INCOMPLETE_CMD"
  if (msg.includes("Ambiguous"))       return "CLI_AMBIGUOUS_CMD"
  if (msg.includes("Access denied"))   return "CLI_ACCESS_DENIED"
  if (msg.includes("%"))               return "CLI_ERROR"
  return "UNKNOWN"
}

interface OutputEntry {
  cmd: string
  configMode: boolean
  results: { deviceName: string; ipAddress: string; out: string; ok: boolean; errorType?: ErrType }[]
  ts: string
}

interface Correction {
  id: number
  deviceId: number
  deviceName: string
  anomalyType: string
  severity: string
  description: string
  correctionScript: string
  status: string
  appliedAt: string | null
  createdAt: string
}

const SEV_COLOR: Record<string, string> = {
  critical: "text-red-400 border-red-500/40 bg-red-500/10",
  high:     "text-orange-400 border-orange-500/40 bg-orange-500/10",
  medium:   "text-yellow-400 border-yellow-500/40 bg-yellow-500/10",
  low:      "text-sky-400 border-sky-500/40 bg-sky-500/10",
}
const SEV_LABEL: Record<string, string> = { critical: "Critique", high: "Élevé", medium: "Moyen", low: "Faible" }

export default function TerminalPage() {
  const { data: devices } = useGetDevices()
  const { toast } = useToast()
  const qc = useQueryClient()

  const [selectedIds,  setSelectedIds]  = useState<Set<number>>(new Set())
  const [cmd,          setCmd]          = useState("")
  const [output,       setOutput]       = useState<OutputEntry[]>([])
  const [loading,      setLoading]      = useState(false)
  const [mode,         setMode]         = useState<Mode>("correction")
  const [configMode,   setConfigMode]   = useState(false)
  const [showTpl,      setShowTpl]      = useState(false)
  const [showReadCmds, setShowReadCmds] = useState(false)
  const [showCreds,    setShowCreds]    = useState(false)
  const [openShowGroups, setOpenShowGroups] = useState<Set<string>>(new Set())
  const [openTplSections, setOpenTplSections] = useState<Set<string>>(new Set())
  const toggleShowGroup = (g: string) => setOpenShowGroups(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n })
  const toggleTplSection = (s: string) => setOpenTplSections(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n })
  const [globalUser,      setGlobalUser]      = useState("")
  const [globalPass,      setGlobalPass]      = useState("")
  const [globalEnablePwd, setGlobalEnablePwd] = useState("")
  const [showDevices,      setShowDevices]      = useState(true)
  const [showCorrTpl,      setShowCorrTpl]      = useState(true)
  const [showCiscoSection, setShowCiscoSection] = useState(true)
  const [showFortiSection, setShowFortiSection] = useState(true)
  const [showFreeTerminal, setShowFreeTerminal] = useState(true)
  const [corrTplType,      setCorrTplType]      = useState<"cisco" | "forti">("cisco")
  const [applyingTpl,      setApplyingTpl]      = useState<Set<string>>(new Set())
  const [selectedCiscoTpls, setSelectedCiscoTpls] = useState<Set<string>>(new Set())
  const [selectedFortiTpls, setSelectedFortiTpls] = useState<Set<string>>(new Set())
  const [applyingMulti,    setApplyingMulti]    = useState(false)
  const toggleCiscoTpl = (label: string) =>
    setSelectedCiscoTpls(prev => { const n = new Set(prev); n.has(label) ? n.delete(label) : n.add(label); return n })
  const toggleFortiTpl = (label: string) =>
    setSelectedFortiTpls(prev => { const n = new Set(prev); n.has(label) ? n.delete(label) : n.add(label); return n })
  const [applying,       setApplying]       = useState<Set<number>>(new Set())
  const [applyingAll,    setApplyingAll]    = useState(false)
  const [selectedCorrIds, setSelectedCorrIds] = useState<Set<number>>(new Set())
  const [previewCorr,    setPreviewCorr]    = useState<Correction | null>(null)
  // Terminal libre dans l'onglet Correction
  const [corrCmd,        setCorrCmd]        = useState("")
  const [corrOutput,     setCorrOutput]     = useState<typeof output>([])
  const [corrLoading,    setCorrLoading]    = useState(false)
  const [corrConfigMode, setCorrConfigMode] = useState(false)
  const corrEndRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const freeTerminalRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }) }, [output])

  const { data: corrections, isLoading: loadingCorr } = useQuery<Correction[]>({
    queryKey: ["corrections"],
    queryFn: () => fetch("/api/corrections").then(r => r.json()),
    enabled: mode === "correction",
    refetchInterval: mode === "correction" ? 10000 : false,
  })

  const pending  = corrections?.filter(c => c.status === "pending")  ?? []
  const applied  = corrections?.filter(c => c.status === "applied")  ?? []

  const toggle = (id: number) => {
    const clicked = devices?.find(d => d.id === id)
    if (!clicked) return
    const clickedIsFW = isFortigate(clicked.vendor) || clicked.type === "firewall"
    // Déselectionner si déjà coché
    if (selectedIds.has(id)) {
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n })
      return
    }
    // Détecter un conflit de type depuis l'état courant (pas depuis le setter)
    const typeMismatch = Array.from(selectedIds).some(eid => {
      const d = devices?.find(x => x.id === eid)
      return d != null && (isFortigate(d.vendor) || d.type === "firewall") !== clickedIsFW
    })
    if (typeMismatch) {
      toast({
        title: "Sélection réinitialisée",
        description: `Impossible de mélanger switch et firewall. Sélection basculée sur ${clicked.name}.`,
        variant: "destructive",
      })
      setSelectedIds(new Set<number>([id]))
      return
    }
    setSelectedIds(prev => new Set(prev).add(id))
  }

  const execCmd = async (rawCmd: string, forceConfigMode?: boolean) => {
    if (selectedIds.size === 0) {
      toast({ title: "Aucun équipement sélectionné", variant: "destructive" })
      return
    }
    if (!rawCmd.trim()) return
    const lines = rawCmd.split("\n").map(l => l.trim()).filter(Boolean)
    const execOnlyPrefixes = ["show", "ping", "traceroute", "debug", "undebug", "dir", "more", "copy"]
    const isExecOnly = lines.every(l => execOnlyPrefixes.some(p => l.toLowerCase().startsWith(p)))
    const useConfig = isExecOnly ? false : (forceConfigMode ?? configMode)
    const cmds  = useConfig ? ["conf t", ...lines, "end", "write memory"] : lines
    const body: Record<string, unknown> = { deviceIds: Array.from(selectedIds), commands: cmds }
    if (globalUser)      body.username       = globalUser
    if (globalPass)      body.password       = globalPass
    if (globalEnablePwd) body.enablePassword = globalEnablePwd
    const ts = new Date().toLocaleTimeString("fr-FR")

    setLoading(true)
    try {
      const resp = await fetch("/api/ssh-exec", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await resp.json()
      if (!resp.ok) {
        const errMsg = data.error || "Erreur inconnue"
        setOutput(prev => [...prev, { cmd: rawCmd, configMode: useConfig, ts, results: [{ deviceName: "Erreur", ipAddress: "", out: errMsg, ok: false, errorType: guessErrType(errMsg) }] }])
      } else {
        const results = (data.results as { deviceName: string; ipAddress: string; output: string; success: boolean; error?: string; errorType?: ErrType }[])
          .map(r => {
            const errMsg = r.error || "Erreur"
            return { deviceName: r.deviceName, ipAddress: r.ipAddress, out: r.success ? r.output : errMsg, ok: r.success, errorType: r.success ? undefined : (r.errorType ?? guessErrType(errMsg)) }
          })
        setOutput(prev => [...prev, { cmd: rawCmd, configMode: useConfig, ts, results }])
      }
      setCmd("")
    } catch {
      setOutput(prev => [...prev, { cmd: rawCmd, configMode: useConfig, ts, results: [{ deviceName: "Erreur réseau", ipAddress: "", out: "Serveur inaccessible.", ok: false, errorType: "NETWORK_UNREACHABLE" as ErrType }] }])
    } finally {
      setLoading(false)
    }
  }

  const applyCorrection = async (corrId: number) => {
    setApplying(prev => new Set(prev).add(corrId))
    try {
      const resp = await fetch(`/api/corrections/${corrId}/apply`, { method: "POST" })
      const data = await resp.json()
      if (resp.ok) {
        qc.invalidateQueries({ queryKey: ["corrections"] })
        setSelectedCorrIds(prev => { const n = new Set(prev); n.delete(corrId); return n })
        if (previewCorr?.id === corrId) setPreviewCorr(null)
        return true
      } else {
        toast({ title: `Échec — ${data.error || "Erreur inconnue"}`, variant: "destructive" })
        return false
      }
    } catch {
      toast({ title: "Erreur réseau", description: "Serveur inaccessible.", variant: "destructive" })
      return false
    } finally {
      setApplying(prev => { const n = new Set(prev); n.delete(corrId); return n })
    }
  }

  const applyAllSelected = async () => {
    if (selectedCorrIds.size === 0) return
    setApplyingAll(true)
    const ids = Array.from(selectedCorrIds)
    let ok = 0, fail = 0
    for (const id of ids) {
      const success = await applyCorrection(id)
      success ? ok++ : fail++
    }
    setApplyingAll(false)
    toast({
      title: ok > 0 ? `${ok} correction${ok > 1 ? "s" : ""} appliquée${ok > 1 ? "s" : ""}` : "Aucune correction appliquée",
      description: fail > 0 ? `${fail} échec${fail > 1 ? "s" : ""}` : "Toutes les corrections ont réussi.",
      variant: fail > 0 ? "destructive" : "default",
    })
  }

  const toggleCorrId = (id: number) =>
    setSelectedCorrIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const execCorrCmd = async (rawCmd: string) => {
    if (selectedIds.size === 0) { toast({ title: "Aucun équipement sélectionné", variant: "destructive" }); return }
    if (!rawCmd.trim()) return
    const lines = rawCmd.split("\n").map(l => l.trim()).filter(Boolean)
    const cmds  = corrConfigMode ? ["conf t", ...lines, "end", "write memory"] : lines
    const body: Record<string, unknown> = { deviceIds: Array.from(selectedIds), commands: cmds }
    if (globalUser)      body.username       = globalUser
    if (globalPass)      body.password       = globalPass
    if (globalEnablePwd) body.enablePassword = globalEnablePwd
    const ts = new Date().toLocaleTimeString("fr-FR")
    setCorrLoading(true)
    try {
      const resp = await fetch("/api/ssh-exec", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const data = await resp.json()
      if (!resp.ok) {
        const errMsg = data.error || "Erreur inconnue"
        setCorrOutput(prev => [...prev, { cmd: rawCmd, configMode: corrConfigMode, ts, results: [{ deviceName: "Erreur", ipAddress: "", out: errMsg, ok: false, errorType: guessErrType(errMsg) }] }])
      } else {
        const results = (data.results as { deviceName: string; ipAddress: string; output: string; success: boolean; error?: string; errorType?: ErrType }[])
          .map(r => {
            const errMsg = r.error || "Erreur"
            return { deviceName: r.deviceName, ipAddress: r.ipAddress, out: r.success ? r.output : errMsg, ok: r.success, errorType: r.success ? undefined : (r.errorType ?? guessErrType(errMsg)) }
          })
        setCorrOutput(prev => [...prev, { cmd: rawCmd, configMode: corrConfigMode, ts, results }])
      }
      setCorrCmd("")
    } catch {
      setCorrOutput(prev => [...prev, { cmd: rawCmd, configMode: corrConfigMode, ts, results: [{ deviceName: "Erreur réseau", ipAddress: "", out: "Serveur inaccessible.", ok: false, errorType: "NETWORK_UNREACHABLE" as ErrType }] }])
    } finally {
      setCorrLoading(false)
      setTimeout(() => corrEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50)
    }
  }

  const selectedDevices = devices?.filter(d => selectedIds.has(d.id)) ?? []

  const applyTemplateCmd = async (cmd: string, type: "cisco" | "forti") => {
    const targets = selectedDevices.filter(d =>
      type === "forti"
        ? isFortigate(d.vendor) || d.type === "firewall"
        : !isFortigate(d.vendor) && d.type !== "firewall"
    )
    if (targets.length === 0) {
      toast({
        title: "Aucun équipement compatible sélectionné",
        description: type === "forti" ? "Sélectionnez d'abord un FortiGate dans la liste." : "Sélectionnez d'abord un switch Cisco dans la liste.",
        variant: "destructive",
      })
      return
    }
    const key = cmd.slice(0, 30)
    setApplyingTpl(prev => new Set(prev).add(key))
    try {
      const lines = cmd.split("\n").map(l => l.trim()).filter(Boolean)
      const cmds = type === "cisco" ? ["conf t", ...lines, "end", "write memory"] : lines
      const body: Record<string, unknown> = { deviceIds: targets.map(d => d.id), commands: cmds }
      if (globalUser)      body.username       = globalUser
      if (globalPass)      body.password       = globalPass
      if (globalEnablePwd && type === "cisco") body.enablePassword = globalEnablePwd
      const resp = await fetch("/api/ssh-exec", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const data = await resp.json()
      if (resp.ok) {
        const allOk = (data.results ?? []).every((r: any) => r.success)
        toast({
          title: allOk ? "Template appliqué avec succès" : "Appliqué avec des erreurs",
          description: `${targets.length} équipement${targets.length > 1 ? "s" : ""} ciblé${targets.length > 1 ? "s" : ""}`,
          variant: allOk ? "default" : "destructive",
        })
        // 🆕 Auto-relance des audits sur les equipements pousses
        const _ids3 = targets.map(d => d.id)
        if (_ids3.length > 0) {
          await Promise.all(_ids3.map(devId => fetch("/api/audits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId: devId }) }).catch(() => {})))
          toast({ title: "🔍 Audits relancés automatiquement", description: `${_ids3.length} équipement(s) en cours. Anomalies à jour dans 5 sec.` })
        try {
          const bc = new BroadcastChannel('netguard')
          bc.postMessage({ type: 'audit-done' })
          bc.close()
        } catch (e) {}
        window.dispatchEvent(new CustomEvent('netguard:audit-done'))
        localStorage.setItem('netguard:audit-done', String(Date.now()))
        }
      } else {
        toast({ title: "Erreur SSH", description: data.error || "Erreur inconnue", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur réseau", description: "Serveur inaccessible.", variant: "destructive" })
    } finally {
      setApplyingTpl(prev => { const n = new Set(prev); n.delete(key); return n })
    }
  }

  const applyMultiTemplates = async (type: "cisco" | "forti") => {
    const targets = selectedDevices.filter(d =>
      type === "forti"
        ? isFortigate(d.vendor) || d.type === "firewall"
        : !isFortigate(d.vendor) && d.type !== "firewall"
    )
    if (targets.length === 0) {
      toast({
        title: "Aucun équipement compatible sélectionné",
        description: type === "forti" ? "Sélectionnez un FortiGate dans la liste." : "Sélectionnez un switch Cisco dans la liste.",
        variant: "destructive",
      })
      return
    }
    const selectedSet = type === "cisco" ? selectedCiscoTpls : selectedFortiTpls
    const tpls = COMBINED_TEMPLATES.filter(t => selectedSet.has(t.label))
    const rawLines = tpls
      .map(t => (type === "cisco" ? t.cisco : t.forti))
      .filter(Boolean)
      .flatMap(c => c.split("\n").map(l => l.trim()).filter(Boolean))
    if (rawLines.length === 0) {
      toast({ title: "Aucune commande disponible", variant: "destructive" })
      return
    }
    const cmds = type === "cisco" ? ["conf t", ...rawLines, "end", "write memory"] : rawLines
    const body: Record<string, unknown> = { deviceIds: targets.map(d => d.id), commands: cmds }
    if (globalUser)      body.username       = globalUser
    if (globalPass)      body.password       = globalPass
    if (globalEnablePwd && type === "cisco") body.enablePassword = globalEnablePwd
    setApplyingMulti(true)
    try {
      const resp = await fetch("/api/ssh-exec", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const data = await resp.json()
      if (resp.ok) {
        const allOk = (data.results ?? []).every((r: any) => r.success)
        toast({
          title: allOk
            ? `${tpls.length} template${tpls.length > 1 ? "s" : ""} appliqué${tpls.length > 1 ? "s" : ""} avec succès`
            : "Appliqués avec des erreurs",
          description: `${targets.length} équipement${targets.length > 1 ? "s" : ""} ciblé${targets.length > 1 ? "s" : ""}`,
          variant: allOk ? "default" : "destructive",
        })
        if (allOk) type === "cisco" ? setSelectedCiscoTpls(new Set()) : setSelectedFortiTpls(new Set())
        // 🆕 Auto-relance des audits sur les equipements pousses
        const _ids4 = targets.map(d => d.id)
        if (_ids4.length > 0) {
          await Promise.all(_ids4.map(devId => fetch("/api/audits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId: devId }) }).catch(() => {})))
          toast({ title: "🔍 Audits relancés automatiquement", description: `${_ids4.length} équipement(s) en cours. Anomalies à jour dans 5 sec.` })
        try {
          const bc = new BroadcastChannel('netguard')
          bc.postMessage({ type: 'audit-done' })
          bc.close()
        } catch (e) {}
        window.dispatchEvent(new CustomEvent('netguard:audit-done'))
        localStorage.setItem('netguard:audit-done', String(Date.now()))
        }
      } else {
        toast({ title: "Erreur SSH", description: data.error || "Erreur inconnue", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur réseau", description: "Serveur inaccessible.", variant: "destructive" })
    } finally {
      setApplyingMulti(false)
    }
  }

  const injectIntoTerminal = (type: "cisco" | "forti") => {
    const tpls = type === "cisco"
      ? COMBINED_TEMPLATES.filter(t => selectedCiscoTpls.has(t.label) && t.cisco.trim())
      : COMBINED_TEMPLATES.filter(t => selectedFortiTpls.has(t.label) && t.forti.trim())
    if (tpls.length === 0) return
    const lines = tpls.map(t => {
      const cmd = (type === "cisco" ? t.cisco : t.forti).trim()
      return `! === ${t.label} ===\n${cmd}`
    }).join("\n\n")
    setCorrCmd(lines)
    setCorrConfigMode(true)
    setShowFreeTerminal(true)
    setTimeout(() => freeTerminalRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80)
  }

  const MODES = [
    { key: "correction" as Mode, label: "Configuration en masse", icon: ShieldCheck, accent: "#a78bfa", desc: "Templates & commandes groupées" },
    { key: "terminal"   as Mode, label: "Terminal",    icon: Terminal,    accent: "#38bdf8", desc: "Show / Exec / Configuration" },
  ]

  return (
    <AppLayout>
      {/* En-tête */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-display font-bold text-foreground">
            Centre de Configuration et d'Automatisation
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestion centralisée des politiques réseau et déploiement de templates de sécurité.
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted/20 border border-border/40">
          <MonitorDot className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm">
            {selectedIds.size === 0
              ? <span className="text-muted-foreground">Aucun équipement sélectionné</span>
              : <span className="text-foreground font-semibold">{selectedIds.size} équipement{selectedIds.size > 1 ? "s" : ""} actif{selectedIds.size > 1 ? "s" : ""}</span>}
          </span>
        </div>
      </div>

      <div className="flex gap-5 h-[calc(100vh-190px)] min-h-[600px]">

        {/* ════ PANNEAU GAUCHE ════ */}
        <div className="w-60 shrink-0 flex flex-col gap-3 overflow-y-auto pr-1" style={{height: "calc(100vh - 190px)", minHeight: 600}}>

          {/* Équipements */}
          <div className="rounded-xl border border-border/50 bg-card/40 overflow-hidden">
            <div
              onClick={() => setShowDevices(v => !v)}
              className="w-full px-4 py-2.5 border-b border-border/40 bg-muted/10 flex items-center justify-between hover:bg-muted/20 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Équipements</span>
                {selectedIds.size > 0 && (
                  <span className="text-[9px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">{selectedIds.size}</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {showDevices && (
                  <div className="flex gap-2 text-[10px]" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setSelectedIds(new Set(devices?.map(d => d.id) ?? []))} className="text-primary hover:underline">Tous</button>
                    <span className="text-border">|</span>
                    <button onClick={() => setSelectedIds(new Set())} className="text-muted-foreground hover:underline">Aucun</button>
                  </div>
                )}
                {showDevices
                  ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                  : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />}
              </div>
            </div>
            {showDevices && <div className="divide-y divide-border/30 overflow-y-auto max-h-[28vh]">
              {devices?.map(device => {
                const isFW  = isFortigate(device.vendor) || device.type === "firewall"
                const sel   = selectedIds.has(device.id)
                const isOn  = device.status === "active" || device.status === "online"
                // Incompatible si la sélection existante est d'un type différent
                const incompatible = !sel && selectedIds.size > 0 && Array.from(selectedIds).some(eid => {
                  const d = devices?.find(x => x.id === eid)
                  return d && (isFortigate(d.vendor) || d.type === "firewall") !== isFW
                })
                return (
                  <button key={device.id} onClick={() => toggle(device.id)}
                    title={incompatible ? "Type différent — la sélection actuelle sera réinitialisée" : undefined}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all group ${
                      sel         ? "bg-primary/8"
                      : incompatible ? "opacity-35 cursor-not-allowed"
                      : "hover:bg-muted/20"
                    }`}>
                    <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${sel ? "border-primary bg-primary" : "border-border/60 group-hover:border-primary/40"}`}>
                      {sel && <svg className="w-2.5 h-2.5 text-primary-foreground" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5L4 7.5 8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>}
                    </div>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isFW ? "bg-orange-500/15" : "bg-sky-500/15"}`}>
                      {isFW ? <Shield className="w-3.5 h-3.5 text-orange-400" /> : <Server className="w-3.5 h-3.5 text-sky-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold truncate ${sel ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"}`}>{device.name}</p>
                      <p className="text-[10px] font-mono text-muted-foreground/50">{device.ipAddress}</p>
                    </div>
                    <Circle className={`w-2 h-2 shrink-0 fill-current ${isOn ? "text-green-500" : "text-red-500/60"}`} />
                  </button>
                )
              })}
              {!devices?.length && <p className="px-4 py-6 text-center text-xs text-muted-foreground">Aucun équipement</p>}
            </div>}
          </div>

          {/* ── Panneau unifié : Show rapide + Templates config ── */}
          {mode === "terminal" && (() => {
            const hasFW    = Array.from(selectedIds).some(id => { const d = devices?.find(x => x.id === id); return d && (isFortigate(d.vendor) || d.type === "firewall") })
            const hasCisco = Array.from(selectedIds).some(id => { const d = devices?.find(x => x.id === id); return d && !isFortigate(d.vendor) && d.type !== "firewall" })
            const isFWOnly = hasFW && !hasCisco
            const templates = isFWOnly ? FORTIGATE_TEMPLATES : CISCO_TEMPLATES
            const showCmds  = isFWOnly ? FORTIGATE_SHOW_CMDS : CISCO_SHOW_CMDS
            const typeLabel = isFWOnly ? "FortiGate" : "Cisco"
            const typeColor = isFWOnly ? "text-orange-400" : "text-sky-400"
            const TypeIcon  = isFWOnly ? Shield : Server
            const showAccent= isFWOnly ? "text-orange-400" : "text-sky-400"
            const showHover = isFWOnly ? "hover:text-orange-300 hover:bg-orange-500/5" : "hover:text-sky-300 hover:bg-sky-500/5"
            const showArrow = isFWOnly ? "text-orange-500/40" : "text-sky-500/40"
            return (
              <>
                {/* ── Show — Lecture ── */}
                <div className="rounded-xl border border-border/50 bg-card/40 overflow-hidden">
                  <button
                    onClick={() => setShowReadCmds(!showReadCmds)}
                    className="w-full px-3 py-2 flex items-center justify-between text-muted-foreground hover:text-foreground transition-colors border-b border-border/30"
                  >
                    <div className="flex items-center gap-2">
                      <Eye className={`w-3.5 h-3.5 shrink-0 ${showAccent}`} />
                      <span className="text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">
                        {isFWOnly ? "Get / Diagnose" : "Show"} — Lecture
                      </span>
                    </div>
                    {showReadCmds
                      ? <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                      : <ChevronDown className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                  {showReadCmds && (
                    <div className="overflow-y-auto max-h-[40vh]">
                      {showCmds.map(group => {
                        const isOpen = openShowGroups.has(group.group)
                        return (
                          <div key={group.group} className="border-b border-border/20 last:border-0">
                            <button
                              onClick={() => toggleShowGroup(group.group)}
                              className="w-full flex items-center justify-between px-4 py-2 bg-muted/5 hover:bg-muted/10 transition-colors"
                            >
                              <span className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-bold">{group.group}</span>
                              {isOpen
                                ? <ChevronUp className="w-3 h-3 text-muted-foreground/40" />
                                : <ChevronDown className="w-3 h-3 text-muted-foreground/40" />}
                            </button>
                            {isOpen && group.items.map(c => (
                              <button key={c}
                                onClick={() => execCmd(c, false)}
                                disabled={selectedIds.size === 0 || loading}
                                className={`w-full text-left px-5 py-1.5 text-[11px] font-mono text-muted-foreground transition-colors disabled:opacity-40 border-b border-border/10 last:border-0 ${showHover}`}>
                                <span className={`mr-1 ${showArrow}`}>›</span>{c}
                              </button>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* ── Config — Templates ── */}
                <div className="rounded-xl border border-border/50 bg-card/40 overflow-hidden">
                  <button onClick={() => setShowTpl(!showTpl)}
                    className="w-full px-3 py-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors border-b border-border/30">
                    <div className="flex items-center gap-2">
                      <Wrench className="w-3.5 h-3.5 shrink-0" />
                      <span className="whitespace-nowrap">Config — Templates</span>
                    </div>
                    {showTpl ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {showTpl && (
                    <div className="overflow-y-auto max-h-[70vh]">
                      {templates.map((section) => {
                        const sKey = section.section
                        const isOpen = openTplSections.has(sKey)
                        const accent = isFWOnly ? "hover:bg-orange-500/5" : "hover:bg-sky-500/5"
                        const hoverColor = isFWOnly ? "group-hover:text-orange-300" : "group-hover:text-sky-300"
                        return (
                          <div key={sKey} className="border-b border-border/20 last:border-0">
                            <button
                              onClick={() => toggleTplSection(sKey)}
                              className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/8 hover:bg-muted/15 transition-colors"
                            >
                              <span className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground/50 text-left">{section.section}</span>
                              {isOpen
                                ? <ChevronUp className="w-3 h-3 text-muted-foreground/40" />
                                : <ChevronDown className="w-3 h-3 text-muted-foreground/40" />}
                            </button>
                            {isOpen && section.items.map((tpl, ti) => (
                              <button key={ti}
                                onClick={() => { setCmd(tpl.cmd); setConfigMode(true) }}
                                className={`w-full text-left px-4 py-2.5 border-b border-border/10 last:border-0 transition-colors group ${accent}`}>
                                <p className={`text-[11px] font-medium text-muted-foreground ${hoverColor} transition-colors`}>{tpl.label}</p>
                                <p className="text-[9px] font-mono text-muted-foreground/35 truncate mt-0.5">{tpl.cmd.split("\n")[0]}</p>
                              </button>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )
          })()}
        </div>

        {/* ════ PANNEAU PRINCIPAL ════ */}
        <div className="flex-1 flex flex-col rounded-xl border border-border/50 bg-[#0a0f1a] overflow-hidden">

          {/* Onglets */}
          <div className="flex items-stretch border-b border-border/40 bg-[#0d1420] shrink-0">
            {MODES.map(m => {
              const Icon = m.icon
              const active = mode === m.key
              return (
                <button key={m.key} onClick={() => setMode(m.key)}
                  style={active ? { borderBottomColor: m.accent, color: m.accent } : {}}
                  className={`flex items-center gap-2 px-5 py-3 text-xs font-semibold border-b-2 transition-all ${active ? "bg-[#0a0f1a]" : "border-transparent text-muted-foreground hover:text-foreground hover:bg-white/4"}`}>
                  <Icon className="w-3.5 h-3.5" />
                  {m.label}
                  {active && <span className="text-[9px] font-normal opacity-50 hidden sm:inline">{m.desc}</span>}
                </button>
              )
            })}
            <div className="flex-1" />
            {selectedDevices.length > 0 && mode !== "correction" && (
              <div className="flex items-center gap-1.5 px-4 text-[10px] text-muted-foreground border-l border-border/30">
                {selectedDevices.slice(0, 3).map(d => (
                  <span key={d.id} className="px-2 py-0.5 rounded bg-muted/20 font-mono">{d.name}</span>
                ))}
                {selectedDevices.length > 3 && <span>+{selectedDevices.length - 3}</span>}
              </div>
            )}
            {output.length > 0 && mode !== "correction" && (
              <button onClick={() => setOutput([])}
                className="flex items-center gap-1.5 px-4 text-[11px] text-muted-foreground hover:text-destructive transition-colors border-l border-border/30">
                <RotateCcw className="w-3 h-3" /> Effacer
              </button>
            )}
          </div>

          {/* ──── CONTENU MODE CORRECTION ──── */}
          {mode === "correction" && (
            <div className="flex-1 overflow-y-auto p-5 space-y-5">

                {/* ── Templates de correction rapide ── */}
                <div className="rounded-xl border border-border/40 bg-[#0d1420] overflow-hidden">
                  <button onClick={() => setShowCorrTpl(!showCorrTpl)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-center gap-2.5">
                      <Zap className="w-3.5 h-3.5 text-yellow-400" />
                      <div className="text-left">
                        <p className="text-xs font-bold text-foreground">Templates de correction rapide</p>
                        <p className="text-[10px] text-muted-foreground">Un clic charge automatiquement les commandes dans l'éditeur (Cisco + FortiGate)</p>
                      </div>
                    </div>
                    {showCorrTpl ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                  </button>
                  {showCorrTpl && (
                    <div className="border-t border-border/30 divide-y divide-border/20">

                      {/* ── Section Switch Cisco IOS ── */}
                      <div className={`transition-opacity ${selectedDevices.length > 0 && !selectedDevices.some(d => !isFortigate(d.vendor) && d.type !== "firewall") ? "opacity-30 pointer-events-none select-none" : ""}`}>
                        <div className="flex items-center justify-between px-4 py-2.5 bg-[#080d17]/60 border-b border-border/20">
                          <button onClick={() => setShowCiscoSection(p => !p)} className="flex items-center gap-2 hover:opacity-80 transition-opacity text-left">
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/20">
                              <Server className="w-3 h-3 text-cyan-400" />
                              <span className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider">Switch Cisco IOS</span>
                            </div>
                            {selectedDevices.length > 0 && !selectedDevices.some(d => !isFortigate(d.vendor) && d.type !== "firewall")
                              ? <span className="text-[10px] text-muted-foreground/60 italic">Aucun switch sélectionné</span>
                              : <span className="text-[10px] text-muted-foreground">{COMBINED_TEMPLATES.filter(t => t.cisco.trim()).length} templates</span>}
                            {showCiscoSection ? <ChevronUp className="w-3 h-3 text-muted-foreground/50" /> : <ChevronDown className="w-3 h-3 text-muted-foreground/50" />}
                          </button>
                          <div className="flex items-center gap-3">
                            {showCiscoSection && (
                              <button
                                onClick={() => {
                                  const all = COMBINED_TEMPLATES.filter(t => t.cisco.trim() !== "").map(t => t.label)
                                  const allSel = all.every(l => selectedCiscoTpls.has(l))
                                  setSelectedCiscoTpls(prev => { const n = new Set(prev); allSel ? all.forEach(l => n.delete(l)) : all.forEach(l => n.add(l)); return n })
                                }}
                                className="text-[10px] text-muted-foreground hover:text-cyan-300 transition-colors">
                                {COMBINED_TEMPLATES.filter(t => t.cisco.trim() !== "").every(t => selectedCiscoTpls.has(t.label)) ? "Tout désélect." : "Tout sélect."}
                              </button>
                            )}
                            {selectedCiscoTpls.size > 0 && (<>
                              <button onClick={() => applyMultiTemplates("cisco")} disabled={applyingMulti}
                                className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 border border-cyan-500/25 disabled:opacity-50 transition-all">
                                {applyingMulti ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                                Appliquer {selectedCiscoTpls.size}
                              </button>
                            </>)}
                          </div>
                        </div>
                        {showCiscoSection && (
                          <div className="p-4 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                            {COMBINED_TEMPLATES.filter(t => t.cisco.trim() !== "").map(tpl => {
                              const checked = selectedCiscoTpls.has(tpl.label)
                              return (
                                <button
                                  key={"cisco-" + tpl.label}
                                  onClick={() => toggleCiscoTpl(tpl.label)}
                                  className={`text-left rounded-lg border p-3 transition-all group relative ${checked ? "border-cyan-500/60 bg-cyan-500/8" : "border-border/40 bg-[#080d17] hover:border-cyan-500/30 hover:bg-cyan-500/4"}`}>
                                  <div className={`absolute top-2 right-2 w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors ${checked ? "border-cyan-500 bg-cyan-500" : "border-border/60 group-hover:border-cyan-400/60"}`}>
                                    {checked && <svg className="w-2 h-2 text-white" viewBox="0 0 8 8" fill="none"><path d="M1 4l2 2 4-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                  </div>
                                  <p className={`text-[11px] font-semibold leading-snug pr-5 transition-colors ${checked ? "text-cyan-200" : "text-foreground group-hover:text-cyan-300"}`}>{tpl.label}</p>
                                  <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{tpl.desc}</p>
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      {/* ── Section Pare-feu FortiGate ── */}
                      <div className={`transition-opacity ${selectedDevices.length > 0 && !selectedDevices.some(d => isFortigate(d.vendor) || d.type === "firewall") ? "opacity-30 pointer-events-none select-none" : ""}`}>
                        <div className="flex items-center justify-between px-4 py-2.5 bg-[#080d17]/60 border-b border-border/20">
                          <button onClick={() => setShowFortiSection(p => !p)} className="flex items-center gap-2 hover:opacity-80 transition-opacity text-left">
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-orange-500/10 border border-orange-500/20">
                              <Shield className="w-3 h-3 text-orange-400" />
                              <span className="text-[10px] font-bold text-orange-300 uppercase tracking-wider">Pare-feu FortiGate</span>
                            </div>
                            {selectedDevices.length > 0 && !selectedDevices.some(d => isFortigate(d.vendor) || d.type === "firewall")
                              ? <span className="text-[10px] text-muted-foreground/60 italic">Aucun pare-feu sélectionné</span>
                              : <span className="text-[10px] text-muted-foreground">{COMBINED_TEMPLATES.filter(t => t.forti.trim()).length} templates</span>}
                            {showFortiSection ? <ChevronUp className="w-3 h-3 text-muted-foreground/50" /> : <ChevronDown className="w-3 h-3 text-muted-foreground/50" />}
                          </button>
                          <div className="flex items-center gap-3">
                            {showFortiSection && (
                              <button
                                onClick={() => {
                                  const all = COMBINED_TEMPLATES.filter(t => t.forti.trim() !== "").map(t => t.label)
                                  const allSel = all.every(l => selectedFortiTpls.has(l))
                                  setSelectedFortiTpls(prev => { const n = new Set(prev); allSel ? all.forEach(l => n.delete(l)) : all.forEach(l => n.add(l)); return n })
                                }}
                                className="text-[10px] text-muted-foreground hover:text-orange-300 transition-colors">
                                {COMBINED_TEMPLATES.filter(t => t.forti.trim() !== "").every(t => selectedFortiTpls.has(t.label)) ? "Tout désélect." : "Tout sélect."}
                              </button>
                            )}
                            {selectedFortiTpls.size > 0 && (<>
                              <button onClick={() => applyMultiTemplates("forti")} disabled={applyingMulti}
                                className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-orange-500/15 text-orange-300 hover:bg-orange-500/25 border border-orange-500/25 disabled:opacity-50 transition-all">
                                {applyingMulti ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                                Appliquer {selectedFortiTpls.size}
                              </button>
                            </>)}
                          </div>
                        </div>
                        {showFortiSection && (
                          <div className="p-4 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                            {COMBINED_TEMPLATES.filter(t => t.forti.trim() !== "").map(tpl => {
                              const checked = selectedFortiTpls.has(tpl.label)
                              return (
                                <button
                                  key={"forti-" + tpl.label}
                                  onClick={() => toggleFortiTpl(tpl.label)}
                                  className={`text-left rounded-lg border p-3 transition-all group relative ${checked ? "border-orange-500/60 bg-orange-500/8" : "border-border/40 bg-[#080d17] hover:border-orange-500/30 hover:bg-orange-500/4"}`}>
                                  <div className={`absolute top-2 right-2 w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors ${checked ? "border-orange-500 bg-orange-500" : "border-border/60 group-hover:border-orange-400/60"}`}>
                                    {checked && <svg className="w-2 h-2 text-white" viewBox="0 0 8 8" fill="none"><path d="M1 4l2 2 4-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                  </div>
                                  <p className={`text-[11px] font-semibold leading-snug pr-5 transition-colors ${checked ? "text-orange-200" : "text-foreground group-hover:text-orange-300"}`}>{tpl.label}</p>
                                  <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{tpl.desc}</p>
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>

                    </div>
                  )}
                </div>
            </div>
          )}

          {/* ──── CONTENU MODE TERMINAL ──── */}
          {mode === "terminal" && (
            <>
              <div className="flex-1 overflow-y-auto p-5 font-mono text-[11px] leading-relaxed space-y-5">
                {output.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full opacity-25 gap-3">
                    <Terminal className="w-10 h-10 text-muted-foreground" />
                    <p className="text-muted-foreground text-xs text-center">
                      {selectedIds.size === 0
                        ? "Sélectionnez un équipement à gauche"
                        : "Cliquez sur une commande Show ou saisissez ci-dessous"}
                    </p>
                  </div>
                )}
                {output.map((entry, i) => {
                  const accent = entry.configMode ? "#fb923c" : "#38bdf8"
                  const prompt = entry.configMode ? "(config)#" : "#"
                  return (
                    <div key={i}>
                      {entry.results.map((r, j) => (
                        <div key={j} className={j < entry.results.length - 1 ? "mb-4 pb-4 border-b border-border/15" : ""}>
                          <div className="flex items-baseline gap-2 mb-1">
                            <span className="text-muted-foreground/30 text-[9px] shrink-0">[{entry.ts}]</span>
                            <span className="text-muted-foreground/40">{r.ipAddress}{prompt}</span>
                            <span style={{ color: accent }} className="font-semibold">{entry.cmd.split("\n").join(" ; ")}</span>
                          </div>
                          {!r.ok && r.errorType && (
                            <div className={`inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border mb-1.5 ${ERR_LABELS[r.errorType]?.cls ?? ERR_LABELS.UNKNOWN.cls}`}>
                              ✗&nbsp;{ERR_LABELS[r.errorType]?.label ?? "Erreur inconnue"}
                            </div>
                          )}
                          <pre className={`whitespace-pre-wrap break-words pl-4 border-l-2 ${r.ok ? "border-border/20 text-slate-300" : "border-red-500/40 text-red-400"}`}>
                            {r.out || "(aucune sortie)"}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )
                })}
                <div ref={endRef} />
              </div>

              {/* Zone de saisie */}
              <div className="shrink-0 border-t border-border/40 bg-[#0d1420] p-4">
                {/* Toggle config mode — toujours visible */}
                <div className="flex items-center gap-3 mb-3">
                  <button onClick={() => setConfigMode(!configMode)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${configMode ? "bg-orange-500/15 border-orange-500/30 text-orange-300" : "bg-muted/10 border-border/30 text-muted-foreground hover:border-border/60"}`}>
                    <div className={`w-2.5 h-2.5 rounded-full ${configMode ? "bg-orange-400" : "bg-muted-foreground/30"}`} />
                    {configMode ? "Mode configuration (conf t)" : "Mode EXEC / Show"}
                  </button>
                  {configMode && (
                    <span className="text-[10px] text-orange-300/50 font-mono">conf t → … → end → write memory</span>
                  )}
                  {output.length > 0 && (
                    <button onClick={() => setOutput([])} className="ml-auto text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                      Effacer
                    </button>
                  )}
                </div>

                <div className="flex gap-3 items-end">
                  <div className="flex-1 flex flex-col gap-1">
                    <span className="text-[11px] font-mono text-muted-foreground/50 select-none px-1">
                      {selectedDevices.length === 0
                        ? "x.x.x.x"
                        : selectedDevices.map((d, i) => (
                            <span key={d.id}>
                              {i > 0 && <span className="text-muted-foreground/25 mx-1">|</span>}
                              <span>{d.ipAddress}</span>
                            </span>
                          ))
                      }{configMode ? "(config)#" : "#"}
                    </span>
                    <Textarea
                      value={cmd}
                      onChange={e => setCmd(e.target.value)}
                      placeholder={configMode
                        ? "interface GigabitEthernet0/1\n no shutdown\nip ssh version 2"
                        : "show running-config\nshow ip interface brief\nping 192.168.1.1"}
                      className="min-h-[72px] max-h-[150px] font-mono text-xs bg-[#0a0f1a] border-border/40 text-slate-200 placeholder:text-muted-foreground/20 resize-none focus-visible:ring-1 focus-visible:ring-primary/30"
                      onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); execCmd(cmd) } }}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 items-center">
                    <Button
                      onClick={() => execCmd(cmd)}
                      disabled={selectedIds.size === 0 || !cmd.trim() || loading}
                      style={!loading && cmd.trim() && selectedIds.size > 0
                        ? { backgroundColor: configMode ? "#fb923c" : "#38bdf8", color: "#000" }
                        : {}}
                      className="h-9 px-5 font-semibold text-xs disabled:opacity-40"
                    >
                      {loading
                        ? <span className="flex items-center gap-1.5 animate-pulse"><Terminal className="w-3.5 h-3.5" /> SSH…</span>
                        : configMode
                          ? <><Wrench className="w-3.5 h-3.5 mr-1.5" /> Configurer</>
                          : <><Send className="w-3.5 h-3.5 mr-1.5" /> Envoyer</>}
                    </Button>
                    <span className="text-[9px] text-muted-foreground/30">Ctrl+↵</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
