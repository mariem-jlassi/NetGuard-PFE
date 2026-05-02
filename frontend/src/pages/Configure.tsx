import { useState } from "react"
import { AppLayout } from "@/components/layout/AppLayout"
import { useGetDevices } from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"

import {
  Terminal, Send, CheckCircle2, XCircle, Server, Shield,
  ChevronDown, ChevronUp, AlertCircle, Wifi, Copy, Zap, Info
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Template {
  label: string
  description: string
  cisco: string
  fortinet: string
}

const TEMPLATES: Template[] = [
  {
    label: "Désactiver Telnet",
    description: "Bloquer Telnet, activer SSH uniquement",
    cisco: "line vty 0 4\ntransport input ssh\nlogin local\nexit",
    fortinet: "config system global\nset admin-telnet disable\nend",
  },
  {
    label: "Activer HTTPS uniquement",
    description: "Désactiver HTTP admin, forcer HTTPS",
    cisco: "ip http secure-server\nno ip http server",
    fortinet: "config system global\nset admin-https enable\nset admin-http disable\nend",
  },
  {
    label: "Configurer NTP",
    description: "Synchroniser l'horloge réseau",
    cisco: "ntp server 192.168.1.254\nclock timezone CET 1",
    fortinet: "config system ntp\nset ntpsync enable\nset syncinterval 60\nset ntpserver \"192.168.1.254\"\nend",
  },
  {
    label: "Activer Syslog",
    description: "Envoyer les logs vers un serveur centralisé",
    cisco: "logging host 192.168.1.253\nlogging trap informational\nlogging on",
    fortinet: "config log syslogd setting\nset status enable\nset server \"192.168.1.253\"\nset port 514\nend",
  },
  {
    label: "Bannière de sécurité",
    description: "Message d'avertissement à la connexion",
    cisco: "banner motd ^C\nACCES AUTORISE UNIQUEMENT - Systeme surveille\n^C",
    fortinet: "config system global\nset pre-login-banner \"ACCES AUTORISE UNIQUEMENT\"\nend",
  },
  {
    label: "SNMP sécurisé",
    description: "Remplacer les communautés par défaut",
    cisco: "no snmp-server community public\nno snmp-server community private\nsnmp-server community NGsecure123 RO",
    fortinet: "config system snmp community\ndelete 1\nend",
  },
  {
    label: "Timeout Admin",
    description: "Déconnecter les sessions inactives",
    cisco: "line vty 0 4\nexec-timeout 5 0\nexit\nline console 0\nexec-timeout 5 0\nexit",
    fortinet: "config system global\nset admintimeout 5\nend",
  },
  {
    label: "Désactiver CDP/LLDP",
    description: "Masquer les informations de topologie",
    cisco: "no cdp run\nno lldp run",
    fortinet: "config system global\nset lldp-transmission disable\nend",
  },
]

interface PushResult {
  deviceId: number
  deviceName: string
  ipAddress: string
  success: boolean
  output: string
  error?: string
  appliedAt: string
}

function isFortigate(vendor: string) {
  return /fortinet|fortigate|forti/i.test(vendor)
}

export default function Configure() {
  const { data: devices } = useGetDevices()
  const { toast } = useToast()

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [ciscoCmd,    setCiscoCmd]    = useState("")
  const [fortiCmd,    setFortiCmd]    = useState("")
  const [loading,     setLoading]     = useState(false)
  const [results,     setResults]     = useState<PushResult[]>([])
  const [expanded,    setExpanded]    = useState<number | null>(null)
  const [globalUser,  setGlobalUser]  = useState("")
  const [globalPass,  setGlobalPass]  = useState("")
  const [showCreds,   setShowCreds]   = useState(false)

  const toggleDevice = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const selectAll  = () => setSelectedIds(new Set(devices?.map(d => d.id) ?? []))
  const selectNone = () => setSelectedIds(new Set())

  const applyTemplate = (tpl: Template) => {
    setCiscoCmd(tpl.cisco)
    setFortiCmd(tpl.fortinet)
    toast({ title: `Template chargé : ${tpl.label}`, description: "Les deux éditeurs ont été remplis. Modifiez si besoin." })
  }

  const applyFullConfig = () => {
    const ciscoFull = [
      "! === Configuration de sécurité complète NetGuard ===",
      "!",
      "! 1. Désactiver Telnet, forcer SSH",
      "line vty 0 4",
      " transport input ssh",
      " login local",
      " exec-timeout 5 0",
      "exit",
      "line console 0",
      " exec-timeout 5 0",
      "exit",
      "!",
      "! 2. Activer HTTPS uniquement",
      "ip http secure-server",
      "no ip http server",
      "!",
      "! 3. Synchronisation NTP",
      "ntp server 192.168.1.254",
      "clock timezone CET 1",
      "!",
      "! 4. Syslog centralisé",
      "logging host 192.168.1.253",
      "logging trap informational",
      "logging on",
      "!",
      "! 5. Bannière de sécurité",
      "banner motd ^C",
      "ACCES AUTORISE UNIQUEMENT - Systeme surveille par NetGuard",
      "^C",
      "!",
      "! 6. SNMP sécurisé",
      "no snmp-server community public",
      "no snmp-server community private",
      "snmp-server community NGsecure123 RO",
      "!",
      "! 7. Désactiver CDP/LLDP",
      "no cdp run",
      "no lldp run",
      "!",
      "end",
      "write memory",
    ].join("\n")

    const fortiFull = [
      "# === Configuration de sécurité complète NetGuard ===",
      "config system global",
      "    set admin-telnet disable",
      "    set admin-https enable",
      "    set admin-http disable",
      "    set admintimeout 5",
      "    set pre-login-banner \"ACCES AUTORISE UNIQUEMENT - Systeme surveille par NetGuard\"",
      "    set lldp-transmission disable",
      "end",
      "config system ntp",
      "    set ntpsync enable",
      "    set syncinterval 60",
      "    set ntpserver \"192.168.1.254\"",
      "end",
      "config log syslogd setting",
      "    set status enable",
      "    set server \"192.168.1.253\"",
      "    set port 514",
      "end",
      "config system snmp community",
      "    delete 1",
      "end",
    ].join("\n")

    setCiscoCmd(ciscoFull)
    setFortiCmd(fortiFull)
    toast({
      title: "✅ Configuration complète chargée",
      description: "Tous les correctifs de sécurité ont été combinés dans les deux éditeurs.",
    })
  }

  const selectedDevices = devices?.filter(d => selectedIds.has(d.id)) ?? []
  const hasCisco   = selectedDevices.some(d => !isFortigate(d.vendor))
  const hasForti   = selectedDevices.some(d =>  isFortigate(d.vendor))

  const handlePush = async () => {
    if (selectedIds.size === 0) {
      toast({ title: "Aucun équipement sélectionné", variant: "destructive" })
      return
    }
    if (hasCisco && !ciscoCmd.trim()) {
      toast({ title: "Commandes Cisco manquantes", description: "Vous avez des switches sélectionnés mais l'éditeur Cisco est vide.", variant: "destructive" })
      return
    }
    if (hasForti && !fortiCmd.trim()) {
      toast({ title: "Commandes FortiGate manquantes", description: "Vous avez des firewalls sélectionnés mais l'éditeur FortiGate est vide.", variant: "destructive" })
      return
    }

    setLoading(true)
    setResults([])
    try {
      const ciscoCommands     = ciscoCmd.split("\n").map(l => l.trim()).filter(Boolean)
      const fortigateCommands = fortiCmd.split("\n").map(l => l.trim()).filter(Boolean)

      // Backend /api/ssh/push attend UN device a la fois → on boucle
      const pushResults: any[] = await Promise.all(selectedDevices.map(async (dev) => {
        const cmds = isFortigate(dev.vendor) ? fortigateCommands : ciscoCommands
        const body: any = { deviceId: dev.id, commands: cmds }
        if (globalUser && globalPass) { body.username = globalUser; body.password = globalPass }
        try {
          const r = await fetch("/api/ssh/push", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
          const d = await r.json()
          return { deviceId: dev.id, deviceName: dev.name, success: !!d.success, output: d.output || "", error: d.error || "" }
        } catch (e: any) {
          return { deviceId: dev.id, deviceName: dev.name, success: false, output: "", error: String(e) }
        }
      }))

      setResults(pushResults)
      const success = pushResults.filter(r => r.success).length
      const failed  = pushResults.length - success
      toast({
        title: failed === 0 ? "✅ Configuration appliquée" : `⚠️ ${success}/${pushResults.length} réussi(s)`,
        description: failed > 0
          ? `${failed} équipement(s) en erreur.`
          : `Commandes envoyées sur ${success} équipement(s).`,
        variant: failed > 0 && success === 0 ? "destructive" : "default",
      })

      // 🆕 Auto-relance des audits pour les équipements poussés avec succès
      const successDeviceIds = pushResults.filter(r => r.success).map(r => r.deviceId)
      if (successDeviceIds.length > 0) {
        await Promise.all(successDeviceIds.map((devId: number) =>
          fetch("/api/audits", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deviceId: devId })
          }).catch(() => {})
        ))
        toast({
          title: "🔍 Audits relancés automatiquement",
          description: `${successDeviceIds.length} équipement(s) en cours d'audit. Consultez Anomalies dans 5 secondes.`,
        })
      }
    } catch {
      toast({ title: "Erreur réseau", description: "Impossible de contacter le serveur.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-[22px] font-display font-bold text-foreground">Centre de Configuration et d'Automatisation</h1>
        <p className="text-muted-foreground mt-1">
          Gestion centralisée des politiques réseau et déploiement de templates de sécurité.
        </p>
      </div>

      {/* ═══ SECTION 1 : CONFIGURATION EN MASSE ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* ─── Panneau gauche : sélection ─── */}
        <div className="lg:col-span-1 space-y-4">

          {/* Sélection des équipements */}
          <Card className="glass-panel border-primary/20">
            <CardHeader className="border-b border-border/50 bg-muted/20 py-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Server className="w-4 h-4 text-primary" /> Équipements cibles
                </CardTitle>
                <div className="flex gap-2">
                  <button onClick={selectAll}  className="text-xs text-primary hover:underline">Tous</button>
                  <span className="text-muted-foreground">·</span>
                  <button onClick={selectNone} className="text-xs text-muted-foreground hover:underline">Aucun</button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-3 space-y-2">
              {!devices?.length && (
                <p className="text-xs text-muted-foreground text-center py-4">Aucun équipement configuré</p>
              )}
              {devices?.map(device => {
                const isFW  = isFortigate(device.vendor) || device.type === "firewall"
                const sel   = selectedIds.has(device.id)
                const creds = !!(device.sshUsername && device.sshPassword)
                return (
                  <button key={device.id} onClick={() => toggleDevice(device.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${sel ? "border-primary/40 bg-primary/10" : "border-border/30 bg-muted/10 hover:bg-muted/30 text-muted-foreground"}`}>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${sel ? "border-primary bg-primary" : "border-border"}`}>
                      {sel && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                    </div>
                    <div className={`w-6 h-6 rounded flex items-center justify-center ${isFW ? "bg-orange-500/20" : "bg-cyan-500/20"}`}>
                      {isFW ? <Shield className="w-3.5 h-3.5 text-orange-400" /> : <Server className="w-3.5 h-3.5 text-cyan-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{device.name}</p>
                      <p className="text-[10px] font-mono text-muted-foreground">{device.ipAddress}</p>
                      <p className="text-[9px] text-muted-foreground/60 uppercase">{isFW ? "FortiGate" : "Cisco"}</p>
                    </div>
                    {creds
                      ? <Wifi className="w-3.5 h-3.5 text-primary shrink-0" title="SSH configuré" />
                      : <AlertCircle className="w-3.5 h-3.5 text-yellow-500/60 shrink-0" title="SSH non configuré" />}
                  </button>
                )
              })}
              {selectedIds.size > 0 && (
                <div className="pt-1 text-center space-y-0.5">
                  <p className="text-xs text-primary font-medium">{selectedIds.size} équipement(s) sélectionné(s)</p>
                  {hasCisco && hasForti && (
                    <p className="text-[10px] text-accent">Mix Cisco + FortiGate détecté</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Identifiants SSH globaux */}
          <Card className="glass-panel border-border/50">
            <button className="w-full flex items-center justify-between p-4 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setShowCreds(!showCreds)}>
              <span className="flex items-center gap-2 font-medium">
                <Wifi className="w-4 h-4" /> Identifiants SSH globaux
              </span>
              {showCreds ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showCreds && (
              <div className="px-4 pb-4 space-y-3">
                <p className="text-xs text-muted-foreground">Remplace les identifiants enregistrés pour cette session.</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Utilisateur</Label>
                    <Input value={globalUser} onChange={e => setGlobalUser(e.target.value)} placeholder="admin" className="h-8 text-xs bg-background" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Mot de passe</Label>
                    <Input type="password" value={globalPass} onChange={e => setGlobalPass(e.target.value)} placeholder="••••••" className="h-8 text-xs bg-background" />
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* ─── Panneau droit : éditeurs + templates ─── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Templates */}
          <Card className="glass-panel border-border/50">
            <CardHeader className="border-b border-border/50 bg-muted/20 py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-accent" /> Templates de correction rapide
              </CardTitle>
              <CardDescription className="text-xs">
                Un clic charge automatiquement les commandes dans les deux éditeurs (Cisco + FortiGate)
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TEMPLATES.map(tpl => (
                <button key={tpl.label} onClick={() => applyTemplate(tpl)}
                  className="text-left p-2.5 rounded-lg border border-border/30 bg-muted/10 hover:border-primary/40 hover:bg-primary/5 transition-all group">
                  <p className="text-xs font-semibold text-foreground group-hover:text-primary leading-tight">{tpl.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{tpl.description}</p>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* ─── Deux éditeurs côte à côte ─── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* Éditeur Cisco */}
            <Card className={`glass-panel flex flex-col transition-all ${hasCisco || selectedIds.size === 0 ? "border-cyan-500/30" : "border-border/30 opacity-50"}`}>
              <CardHeader className="border-b border-border/50 bg-muted/20 py-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Server className="w-4 h-4 text-cyan-400" />
                    <span>Commandes Cisco IOS</span>
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {ciscoCmd && (
                      <button className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                        onClick={() => { navigator.clipboard.writeText(ciscoCmd); toast({ title: "Copié !" }) }}>
                        <Copy className="w-3 h-3" /> Copier
                      </button>
                    )}
                    {hasCisco && !ciscoCmd && (
                      <span className="text-[10px] text-yellow-500 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Requis
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-3 flex-1">
                <Textarea
                  value={ciscoCmd}
                  onChange={e => setCiscoCmd(e.target.value)}
                  placeholder={"Commandes Cisco (une par ligne) :\n\nline vty 0 4\n  transport input ssh\n  exec-timeout 5 0\nexit\nntp server 192.168.1.254\nlogging host 192.168.1.253"}
                  className="min-h-[220px] font-mono text-xs bg-background border-cyan-500/20 resize-none focus-visible:ring-cyan-400/50"
                />
                {ciscoCmd && (
                  <p className="text-[10px] text-muted-foreground font-mono mt-1.5">
                    {ciscoCmd.split("\n").filter(l => l.trim()).length} commande(s)
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Éditeur FortiGate */}
            <Card className={`glass-panel flex flex-col transition-all ${hasForti || selectedIds.size === 0 ? "border-orange-500/30" : "border-border/30 opacity-50"}`}>
              <CardHeader className="border-b border-border/50 bg-muted/20 py-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="w-4 h-4 text-orange-400" />
                    <span>Commandes FortiGate</span>
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {fortiCmd && (
                      <button className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                        onClick={() => { navigator.clipboard.writeText(fortiCmd); toast({ title: "Copié !" }) }}>
                        <Copy className="w-3 h-3" /> Copier
                      </button>
                    )}
                    {hasForti && !fortiCmd && (
                      <span className="text-[10px] text-yellow-500 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Requis
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-3 flex-1">
                <Textarea
                  value={fortiCmd}
                  onChange={e => setFortiCmd(e.target.value)}
                  placeholder={"Commandes FortiGate (une par ligne) :\n\nconfig system global\n  set admin-telnet disable\n  set admintimeout 5\nend\nconfig log syslogd setting\n  set status enable\n  set server \"192.168.1.253\"\nend"}
                  className="min-h-[220px] font-mono text-xs bg-background border-orange-500/20 resize-none focus-visible:ring-orange-400/50"
                />
                {fortiCmd && (
                  <p className="text-[10px] text-muted-foreground font-mono mt-1.5">
                    {fortiCmd.split("\n").filter(l => l.trim()).length} commande(s)
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Info bulle + bouton envoi */}
          <Card className="glass-panel border-primary/20">
            <CardContent className="p-4 space-y-3">
              {selectedIds.size > 0 && (hasCisco || hasForti) && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/20 border border-border/30 text-xs text-muted-foreground">
                  <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
                  <div>
                    {hasCisco && hasForti
                      ? <>Les <span className="text-cyan-400 font-semibold">switches Cisco</span> recevront l'éditeur gauche, les <span className="text-orange-400 font-semibold">firewalls FortiGate</span> recevront l'éditeur droit.</>
                      : hasCisco
                        ? <>Seul l'éditeur <span className="text-cyan-400 font-semibold">Cisco</span> sera envoyé (aucun FortiGate sélectionné).</>
                        : <>Seul l'éditeur <span className="text-orange-400 font-semibold">FortiGate</span> sera envoyé (aucun Cisco sélectionné).</>}
                  </div>
                </div>
              )}
              <Button
                className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90 shadow-lg shadow-primary/25"
                disabled={selectedIds.size === 0 || loading}
                onClick={handlePush}
              >
                {loading
                  ? <span className="animate-pulse flex items-center gap-2"><Terminal className="w-4 h-4" /> Application en cours...</span>
                  : <><Send className="w-4 h-4 mr-2" /> Envoyer sur {selectedIds.size} équipement{selectedIds.size > 1 ? "s" : ""}</>}
              </Button>
            </CardContent>
          </Card>

          {/* Résultats */}
          {results.length > 0 && (
            <Card className="glass-panel border-border/50">
              <CardHeader className="border-b border-border/50 py-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-accent" /> Résultats d'exécution
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-3">
                {results.map(r => (
                  <div key={r.deviceId} className={`rounded-lg border p-3 space-y-2 ${r.success ? "border-emerald-500/25 bg-emerald-500/5" : "border-red-500/25 bg-red-500/5"}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {r.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                        <span className="text-sm font-semibold">{r.deviceName}</span>
                        <span className="text-xs text-muted-foreground font-mono">{r.ipAddress}</span>
                      </div>
                      {r.output && (
                        <button className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                          onClick={() => setExpanded(expanded === r.deviceId ? null : r.deviceId)}>
                          {expanded === r.deviceId ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          Détails
                        </button>
                      )}
                    </div>
                    {r.error && <p className="text-xs text-red-400 flex items-start gap-1.5"><AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />{r.error}</p>}
                    {r.success && expanded !== r.deviceId && <p className="text-xs text-emerald-400/80">Commandes appliquées avec succès</p>}
                    {expanded === r.deviceId && r.output && (
                      <pre className="text-[10px] text-muted-foreground bg-black/40 p-3 rounded-lg overflow-auto max-h-48 whitespace-pre-wrap font-mono border border-border/30">
                        {r.output}
                      </pre>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>


    </AppLayout>
  )
}
