import { useState, useEffect } from "react"
import { AppLayout } from "@/components/layout/AppLayout"
import { useGetAudits, useGetDevices, useCreateAudit, useRunAudit, useDeleteAudit } from "@workspace/api-client-react"
import { useGetResults } from "@/lib/workspace-api"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Play, ShieldCheck, FileSearch, Wifi, Download, Lock, AlertCircle, Trash2 } from "lucide-react"
import { getStatusColor, formatDate } from "@/lib/utils"
import { useQueryClient } from "@tanstack/react-query"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/hooks/use-auth"

const STATUS_FR: Record<string, string> = {
  pending: 'En attente',
  running: 'En cours',
  completed: 'Terminé',
  failed: 'Échoué',
}

export default function Audits() {
  const { data: audits, isLoading: loadingAudits } = useGetAudits()
  const { data: devices } = useGetDevices()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { isAdmin } = useAuth()
  
  const [selectedDevice, setSelectedDevice] = useState<string>("")
  const [configText, setConfigText] = useState("")
  const [lastRunAuditId, setLastRunAuditId] = useState<number|null>(null)
  const [deviceChanging, setDeviceChanging] = useState(false)

  const { data: deviceResults, isFetching: isLoadingResults } = useGetResults(
    selectedDevice ? { deviceId: selectedDevice } : undefined
  )

  // SSH state
  const [sshLoading, setSshLoading] = useState(false)
  const [auditLabel, setAuditLabel] = useState("dernier audit")
  const [showSshForm, setShowSshForm] = useState(false)
  const [sshUser, setSshUser] = useState("")
  const [sshPass, setSshPass] = useState("")
  const [sshPort, setSshPort] = useState("22")

  const selectedDeviceObj = (devices as any[])?.find(d => d.id.toString() === selectedDevice)

  useEffect(() => {
    setLastRunAuditId(null)
    setAuditLabel("dernier audit")
    setDeviceChanging(true)
  }, [selectedDevice])

  useEffect(() => {
    setDeviceChanging(false)
  }, [deviceResults])
  const hasStoredCreds = !!(selectedDeviceObj?.sshUsername && selectedDeviceObj?.sshPassword)

  const deleteMutation = useDeleteAudit({
    mutation: {
      onSuccess: () => {
        queryClient.refetchQueries({ queryKey: ['/api/audits'] })
        queryClient.refetchQueries({ queryKey: ['/api/dashboard/stats'] })
        toast({ title: "Audit supprimé", description: "L'entrée a été retirée de l'historique." })
      },
      onError: () => {
        toast({ title: "Erreur", description: "Impossible de supprimer cet audit.", variant: "destructive" })
      }
    }
  })

  const handleDeleteAudit = (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    deleteMutation.mutate({ id })
  }

  const createMutation = useCreateAudit({
    mutation: {
      onSuccess: (data: any) => {
        queryClient.refetchQueries({ queryKey: ['/api/audits'] })
        toast({ title: "Audit créé", description: "Lancement de l'analyse par IA/NLP..." })
        runMutation.mutate({ id: data.id })
      },
      onError: () => {
        toast({ title: "Échec de l'audit", description: "Impossible d'initialiser la séquence d'audit.", variant: "destructive" })
      }
    }
  })

  const runMutation = useRunAudit({
    mutation: {
      onSuccess: (data: any) => {
        queryClient.refetchQueries({ queryKey: ['/api/audits'] })
        queryClient.invalidateQueries({ queryKey: ['/api/results'] })
        queryClient.refetchQueries({ queryKey: ['/api/corrections'] })
        queryClient.refetchQueries({ queryKey: ['/api/dashboard/stats'] })
        toast({
          title: data.openCount > 0 ? `⚠️ ${data.openCount} anomalie(s) détectée(s)` : "✅ Équipement conforme", description: data.openCount > 0
          ? "Des corrections sont disponibles dans l'onglet Corrections." : "Aucune anomalie détectée sur cet équipement."
          })
        setConfigText("")
        setLastRunAuditId(data.id ?? null)
        setAuditLabel(`audit #AUD-${String(data.id).padStart(4, "0")}`)
      },
      onError: () => {
        toast({ title: "Erreur d'exécution", description: "L'analyse a échoué.", variant: "destructive" })
      }
    }
  })

  const handleRunAudit = () => {
    if (!selectedDevice) return
    createMutation.mutate({
      data: {
        deviceId: parseInt(selectedDevice),
        configText: configText
      }
    })
  }

  const handleFetchSSH = async (useStored = false) => {
    if (!selectedDevice) return
    setSshLoading(true)
    setShowSshForm(false)
    try {
      const body = useStored
        ? {}
        : { username: sshUser, password: sshPass, port: parseInt(sshPort) || 22 }
      
      const resp = await fetch(`/api/devices/${selectedDevice}/fetch-config`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": "Bearer " + (localStorage.getItem("netguard_token") || "")
        },
        body: JSON.stringify(body)
      })
      const data = await resp.json()
      if (resp.ok) {
        setConfigText(data.config)
        toast({ 
          title: "✅ Configuration récupérée", 
          description: `Config de ${data.device} importée depuis SSH. Prête à analyser.` 
        })
      } else {
        toast({ 
          title: "Connexion SSH échouée", 
          description: data.error, 
          variant: "destructive" 
        })
        setShowSshForm(true)
      }
    } catch {
      toast({ title: "Erreur réseau", description: "Impossible de contacter le serveur.", variant: "destructive" })
    } finally {
      setSshLoading(false)
    }
  }

  const onDeviceChange = (val: string) => {
    setSelectedDevice(val)
    setShowSshForm(false)
    setConfigText("")
  }

  const isProcessing = createMutation.isPending || runMutation.isPending

  return (
    <AppLayout>
      <div className="mb-5">
        <h1 className="text-[22px] font-display font-bold text-foreground">Audit de Configuration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Lancez une analyse IA/NLP sur les configurations brutes des équipements réseau
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Formulaire nouvelle analyse */}
        <Card className="glass-panel border-primary/20 lg:col-span-1 h-fit">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle className="flex items-center gap-2">
              <FileSearch className="w-5 h-5 text-primary" />
              Nouvelle Analyse
            </CardTitle>
            <CardDescription>Importez la config via SSH ou collez-la manuellement</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-5">
            {/* Device selector */}
            <div className="space-y-2">
              <Label>Équipement cible</Label>
              <Select value={selectedDevice} onValueChange={onDeviceChange}>
                <SelectTrigger className="bg-background border-border/50">
                  <SelectValue placeholder="Sélectionner un équipement..." />
                </SelectTrigger>
                <SelectContent>
                  {(devices as any[])?.map(d => (
                    <SelectItem key={d.id} value={d.id.toString()}>
                      <span className="flex items-center gap-2">
                        {d.name}
                        <span className="text-xs text-muted-foreground font-mono">{d.ipAddress}</span>
                        {d.sshUsername && <Wifi className="w-3 h-3 text-primary" />}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* SSH import section — only shown when a device is selected */}
            {selectedDevice && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                <p className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <Wifi className="w-3.5 h-3.5" /> Récupération SSH Automatique
                </p>

                {hasStoredCreds ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full overflow-hidden border-primary/40 text-primary hover:bg-primary/10"
                    onClick={() => handleFetchSSH(true)}
                    disabled={sshLoading}
                  >
                    {sshLoading ? (
                      <span className="animate-pulse flex items-center gap-2">
                        <Wifi className="w-4 h-4 animate-pulse" /> Connexion SSH en cours...
                      </span>
                    ) : (
                      <>
                        <Download className="w-4 h-4 shrink-0 mr-2" />
                        <span className="truncate">
                          Récupérer la config ({selectedDeviceObj?.sshUsername}@{selectedDeviceObj?.ipAddress})
                        </span>
                      </>
                    )}
                  </Button>
                ) : null}

                {!showSshForm && isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground hover:text-foreground border border-dashed border-border/50"
                    onClick={() => setShowSshForm(true)}
                    disabled={sshLoading}
                  >
                    <Lock className="w-3.5 h-3.5 mr-2" />
                    {hasStoredCreds ? "Changer les identifiants SSH" : "Connexion SSH manuelle"}
                  </Button>
                )}

                {showSshForm && (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Utilisateur</Label>
                        <Input
                          value={sshUser}
                          onChange={e => setSshUser(e.target.value)}
                          placeholder="admin"
                          className="h-8 text-xs bg-background"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Port SSH</Label>
                        <Input
                          value={sshPort}
                          onChange={e => setSshPort(e.target.value)}
                          placeholder="22"
                          className="h-8 text-xs bg-background"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Mot de passe</Label>
                      <Input
                        type="password"
                        value={sshPass}
                        onChange={e => setSshPass(e.target.value)}
                        placeholder="••••••••"
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 bg-primary text-primary-foreground"
                        onClick={() => handleFetchSSH(false)}
                        disabled={!sshUser || !sshPass || sshLoading}
                      >
                        {sshLoading ? (
                          <span className="animate-pulse">Connexion...</span>
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5 mr-1.5" />
                            Importer
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowSshForm(false)}
                      >
                        Annuler
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <AlertCircle className="w-3 h-3 shrink-0 mt-0.5 text-yellow-500" />
                      Les identifiants seront sauvegardés pour les prochains audits.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Config textarea */}
            <div className="space-y-2">
              <Label className="flex justify-between">
                <span>Configuration brute</span>
                <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">txt</span>
              </Label>
              <Textarea 
                placeholder="! Collez ici la config Cisco IOS ou FortiOS...&#10;version 17.3&#10;hostname CORE-SW-01&#10;transport input telnet&#10;enable password weak&#10;..."
                className="min-h-[220px] font-mono text-xs bg-background border-border/50 resize-none focus-visible:ring-primary/50"
                value={configText}
                onChange={(e) => setConfigText(e.target.value)}
              />
              {configText && (
                <p className="text-xs text-primary font-mono">
                  {configText.split('\n').length} lignes — prêt à analyser
                </p>
              )}
            </div>

            <Button 
              className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90 shadow-lg shadow-primary/25"
              disabled={!selectedDevice || isProcessing}
              onClick={handleRunAudit}
            >
              {isProcessing ? (
                <span className="animate-pulse">Traitement des modèles IA/NLP...</span>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" fill="currentColor" />
                  Lancer l'Audit Zero-Touch
                </>
              )}
            </Button>

            <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground border border-border/30">
              {!selectedDevice ? (
                <p className="italic text-center py-2">
                  Sélectionnez un équipement pour voir les anomalies du dernier audit
                </p>
              ) : (() => {
                const deviceAudits = ((audits as any[]) || [])
                  .filter((a: any) => (a.deviceId ?? a.device_id)?.toString() === selectedDevice && a.status === "completed")
                  .sort((a: any, b: any) => new Date(b.createdAt ?? b.created_at).getTime() - new Date(a.createdAt ?? a.created_at).getTime())
                const lastAudit = deviceAudits[0]
                if (!lastAudit) return (
                  <p className="italic text-center py-2">Aucun audit effectué sur cet équipement</p>
                )
                const targetAuditId = lastRunAuditId ?? lastAudit.id
                const latestResults = ((deviceResults as any[]) || []).filter((r: any) => {
                  const auditId = r.auditId ?? r.audit_id
                  return auditId === targetAuditId
                })
                const resolvedStatuses = ["corrected","corrige","corrigee","resolved","resolu","closed","ferme"]
                const openCount = latestResults.filter((r: any) => !resolvedStatuses.includes((r.status ?? "").toLowerCase())).length
                if (isLoadingResults || deviceResults === undefined) return null
                if (latestResults.length === 0) return (
                  <p className="font-semibold text-green-400 text-center py-2">
                    ✅ Équipement conforme — aucune anomalie
                  </p>
                )
                return (
                  <>
                    <p className="font-semibold text-foreground mb-2">
                      {isProcessing
                        ? "Analyse en cours..."
                        : `Anomalies détectées (${latestResults.length}) — ${auditLabel}${openCount < latestResults.length ? ` · ${latestResults.length - openCount} corrigée(s)` : ""} :`}
                    </p>
                    <ul className="space-y-1">
                      {latestResults.map((r: any, i: number) => {
                        const isResolved = resolvedStatuses.includes((r.status ?? "").toLowerCase())
                        return (
                        <li key={i} className={`flex items-start gap-1.5 ${isResolved ? "opacity-50" : ""}`}>
                          <span className={`mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full ${
                            isResolved              ? "bg-green-500"  :
                            r.severity === "critical" ? "bg-red-500"    :
                            r.severity === "high"     ? "bg-orange-400" :
                            r.severity === "medium"   ? "bg-yellow-400" :
                                                        "bg-blue-400"
                          }`} />
                          <span className={isResolved ? "line-through" : ""}>{r.description}</span>
                          {isResolved && <span className="ml-1 text-green-400 text-[10px] font-semibold">✓</span>}
                        </li>
                        )
                      })}
                    </ul>
                  </>
                )
              })()}
            </div>
          </CardContent>
        </Card>

        {/* Historique des audits */}
        <Card className="glass-panel border-border/50 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-accent" />
              Historique des Audits
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/30 border-b border-border/50">
                  <tr>
                    <th className="px-6 py-4">ID Audit</th>
                    <th className="px-6 py-4">Équipement</th>
                    <th className="px-6 py-4">Statut</th>
                    <th className="px-6 py-4">Anomalies</th>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {loadingAudits ? (
                    <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Chargement de l'historique...</td></tr>
                  )  : (audits as any[])?.length === 0 ? (
                    <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Aucun audit effectué.</td></tr>
                  ) : (
                    (audits as any[])?.map((audit) => (
                      <tr key={audit.id} 
                          className="hover:bg-muted/20 transition-colors cursor-pointer"
                          >
                        <td className="px-6 py-4 font-mono text-muted-foreground">AUD-{audit.id.toString().padStart(4, '0')}</td>
                        <td className="px-6 py-4 font-medium text-foreground">{audit.deviceName}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusColor(audit.status)}`}>
                            {STATUS_FR[audit.status] || audit.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {audit.status === 'failed' ? (
                           <span className="text-muted-foreground font-bold">—</span>
                            ) : audit.anomaliesFound > 0 ? (
                             <span className="text-destructive font-bold">{audit.anomaliesFound} détectée(s)</span>
                              ) : (
                                <span className="text-emerald-500 font-bold">Conforme</span>
                                  )}
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">{formatDate(audit.createdAt)}</td>
                        <td className="px-6 py-4">
                        {isAdmin && (
                         <button
                          onClick={(e) => handleDeleteAudit(e, audit.id)}
                          disabled={deleteMutation.isPending}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                          title="Supprimer cet audit">
                         <Trash2 className="w-4 h-4" />
                         </button>
                         )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  )
}
