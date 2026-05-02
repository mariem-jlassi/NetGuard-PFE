import { useState, useEffect } from "react"
import { AppLayout } from "@/components/layout/AppLayout"
import {
  useGetResults,
  useGetCorrections,
  useApplyCorrection,
  useIgnoreCorrection,
} from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useQueryClient, useMutation } from "@tanstack/react-query"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/hooks/use-auth"
import {
  AlertTriangle, CheckCircle2, Wrench, XCircle, Terminal,
  Search, X, Filter, Download, Trash2, Clock, Clock3, WrenchIcon, Loader2
} from "lucide-react"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { formatDate, translateAnomalyType } from "@/lib/utils"

const SEVERITY_FR: Record<string, string> = {
  critical: "Critique", high: "Élevée", medium: "Moyenne", low: "Faible",
}
const STATUS_FR: Record<string, string> = {
  open: "Ouverte", corrected: "Corrigée", ignored: "Ignorée",
  pending: "En attente", applied: "Appliqué",
}

const SEV_BADGE: Record<string, string> = {
  critical: "badge badge-critical",
  high:     "badge badge-high",
  medium:   "badge badge-medium",
  low:      "badge badge-low",
}
const CORR_STATUS_BADGE: Record<string, string> = {
  pending:  "badge badge-pending",
  applied:  "badge badge-applied",
  ignored:  "badge badge-ignored",
}

function authHeader(): Record<string, string> {
  const t = localStorage.getItem("netguard_token")
  return t ? { Authorization: `Bearer ${t}` } : {}
}

type Tab = "anomalies" | "corrections"

export default function Anomalies() {
  const [tab, setTab] = useState<Tab>("anomalies")

  return (
    <AppLayout>
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-[22px] font-display font-bold text-foreground">
          Gestion des Anomalies
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Journal des anomalies détectées et corrections automatisées Zero-Touch
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-5 border-b border-border/40 pb-0">
        <TabBtn
          label="Anomalies Détectées"
          icon={AlertTriangle}
          active={tab === "anomalies"}
          onClick={() => setTab("anomalies")}
        />
  
      </div>

      <AnomaliesTab />
    </AppLayout>
  )
}

function TabBtn({
  label, icon: Icon, active, onClick,
}: {
  label: string
  icon: any
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors -mb-px ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
      }`}
    >
      <Icon className="w-3.5 h-3.5" strokeWidth={1.8} />
      {label}
    </button>
  )
}

/* ─────────────────────────────────────────────
   TAB 1 : Anomalies Détectées (Results)
───────────────────────────────────────────── */
function AnomaliesTab() {
  const queryClient = useQueryClient()
  useEffect(() => {
    const refetch = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/results"] })
      queryClient.invalidateQueries({ queryKey: ["/api/corrections"] })
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] })
    }
    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel('netguard')
      bc.onmessage = (e) => { if (e.data?.type === 'audit-done') refetch() }
    } catch {}
    const onEvt = () => refetch()
    const onStorage = (e: StorageEvent) => { if (e.key === 'netguard:audit-done') refetch() }
    window.addEventListener('netguard:audit-done', onEvt)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('netguard:audit-done', onEvt)
      window.removeEventListener('storage', onStorage)
      try { bc?.close() } catch {}
    }
  }, [queryClient])

  const { toast } = useToast()
  const [searchQuery, setSearchQuery] = useState("")
  const [filterSeverity, setFilterSeverity] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [cleanDialog, setCleanDialog] = useState(false)

  const { data: results, isLoading } = useGetResults()
  const { isAdmin } = useAuth()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/results"] })
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] })
  }

  const [remediating, setRemediating] = useState<number | null>(null)

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/results/${id}`, { method: "DELETE", headers: authHeader() })
      if (!res.ok) throw new Error("Échec de la suppression")
    },
    onSuccess: () => {
      toast({ title: "Anomalie supprimée" })
      invalidate()
      setDeleteId(null)
    },
    onError: () => {
      toast({ title: "Erreur", description: "Suppression impossible.", variant: "destructive" })
      setDeleteId(null)
    },
  })

  const remediateMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/results/${id}/remediate`, {
        method: "POST",
        headers: authHeader(),
      })
      const data = await res.json().catch(() => ({ error: res.statusText || "Erreur serveur" }))
      if (!res.ok) throw new Error(data?.error || "Échec de la remédiation SSH.")
      return data
    },
    onSuccess: (_data, id) => {
      toast({
        title: "Remédiation Zero-Touch appliquée",
        description: "Le script a été déployé via SSH sur l'équipement.",
      })
      invalidate()
      setRemediating(null)
    },
    onError: (err: any, id) => {
      toast({
        title: "Échec SSH",
        description: err?.message || "Connexion SSH impossible.",
        variant: "destructive",
      })
      setRemediating(null)
    },
  })

  const handleRemediate = (id: number) => {
    if (!confirm("Appliquer la correction via SSH sur l'équipement ?")) return
    setRemediating(id)
    remediateMutation.mutate(id)
  }

  const cleanMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/results?status=corrected`, { method: "DELETE", headers: authHeader() })
      if (!res.ok) throw new Error()
    },
    onSuccess: () => {
      toast({ title: "Nettoyage effectué" })
      invalidate()
      setCleanDialog(false)
    },
    onError: () => {
      toast({ title: "Erreur", variant: "destructive" })
      setCleanDialog(false)
    },
  })

  const filtered = (results ?? []).filter((r: any) => {
    const q = searchQuery.toLowerCase()
    return (
      (!q || r.anomalyType?.toLowerCase().includes(q) || r.deviceName?.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q)) &&
      (filterSeverity === "all" || r.severity === filterSeverity) &&
      (filterStatus === "all" || r.status === filterStatus)
    )
  })

  const correctedCount = (results ?? []).filter((r: any) => r.status === "corrected" || r.status === "ignored").length
  const criticalCount = filtered.filter((r: any) => r.severity === "critical").length

  const exportCSV = () => {
    const header = "Type;Équipement;Audit;Sévérité;Statut;Description;Date\n"
    const rows = filtered.map((r: any) =>
      [translateAnomalyType(r.anomalyType), r.deviceName, `AUD-${String(r.auditId).padStart(4,"0")}`,
       SEVERITY_FR[r.severity]||r.severity, STATUS_FR[r.status]||r.status,
       `"${r.description?.replace(/"/g,'""')}"`, formatDate(r.detectedAt)].join(";")
    ).join("\n")
    const blob = new Blob(["\uFEFF"+header+rows], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    Object.assign(document.createElement("a"), { href: url, download: `anomalies_${new Date().toISOString().slice(0,10)}.csv` }).click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette anomalie ?</AlertDialogTitle>
            <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white" onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}>
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cleanDialog} onOpenChange={setCleanDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nettoyer les entrées traitées ?</AlertDialogTitle>
            <AlertDialogDescription>
              {correctedCount} résultat(s) corrigé(s)/ignoré(s) seront supprimés définitivement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction className="bg-orange-600 text-white" onClick={() => cleanMutation.mutate()}>
              Nettoyer ({correctedCount})
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Rechercher une anomalie, équipement..."
            className="pl-9 h-8 text-[13px] bg-card border-border/50"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
          <SelectTrigger className="w-40 h-8 text-[13px] bg-card border-border/50">
            <Filter className="w-3 h-3 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Sévérité" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes</SelectItem>
            <SelectItem value="critical">Critique</SelectItem>
            <SelectItem value="high">Élevée</SelectItem>
            <SelectItem value="medium">Moyenne</SelectItem>
            <SelectItem value="low">Faible</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 h-8 text-[13px] bg-card border-border/50">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="open">Ouverte</SelectItem>
            <SelectItem value="corrected">Corrigée</SelectItem>
            <SelectItem value="ignored">Ignorée</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 ml-auto">
          {filtered.length > 0 && (
            <Button variant="outline" size="sm" onClick={exportCSV} className="h-8 text-[12px]">
              <Download className="w-3.5 h-3.5 mr-1.5" /> CSV
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const token = localStorage.getItem("netguard_token")
              const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
              fetch("/api/export/report", { headers })
                .then((r) => r.blob())
                .then((blob) => {
                  const url = URL.createObjectURL(blob)
                  Object.assign(document.createElement("a"), {
                    href: url,
                    download: `netguard_report_${new Date().toISOString().slice(0, 10)}.json`,
                  }).click()
                  URL.revokeObjectURL(url)
                })
            }}
            className="h-8 text-[12px] border-violet-500/40 text-violet-400 hover:bg-violet-500/10"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" /> Rapport JSON
          </Button>
          {correctedCount > 0 && isAdmin &&(
            <Button variant="outline" size="sm" onClick={() => setCleanDialog(true)} className="h-8 text-[12px] border-orange-500/40 text-orange-400 hover:bg-orange-500/10">
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Nettoyer ({correctedCount})
            </Button>
          )}
        </div>
      </div>

      {/* Stats row */}
      {!isLoading && filtered.length > 0 && (
        <div className="flex items-center gap-3 mb-4 text-[12px] text-muted-foreground">
          <span>{filtered.length} résultat(s)</span>
          {criticalCount > 0 && <span className="text-red-400 font-semibold">{criticalCount} critique(s)</span>}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border/40 bg-card/80 overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Anomalie</th>
              <th>Équipement</th>
              <th>Sévérité</th>
              <th>Statut</th>
              <th>Détectée le</th>
              {isAdmin && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j}><div className="h-4 bg-muted/30 rounded animate-pulse w-24" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-14">
                  <div className="flex flex-col items-center gap-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 opacity-50" />
                    <p className="text-sm text-muted-foreground">Aucune anomalie trouvée</p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((r: any) => (
                <tr key={r.id}>
                  <td className="max-w-[280px]">
                    <p className="font-semibold text-[13px] text-foreground">{translateAnomalyType(r.anomalyType)}</p>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">{r.description}</p>
                    {r.affectedConfig && (
                      <p className="text-[10px] font-mono text-muted-foreground/50 truncate mt-0.5">{r.affectedConfig}</p>
                    )}
                  </td>
                  <td>
                    <p className="text-[13px] font-medium">{r.deviceName}</p>
                    <p className="text-[11px] font-mono text-muted-foreground">AUD-{String(r.auditId).padStart(4,"0")}</p>
                  </td>
                  <td>
                    <span className={SEV_BADGE[r.severity] ?? "badge badge-low"}>
                      {SEVERITY_FR[r.severity] || r.severity}
                    </span>
                  </td>
                  <td>
                    <span className={r.status === "open" ? "badge badge-open" : r.status === "corrected" ? "badge badge-corrected" : "badge badge-ignored"}>
                      {STATUS_FR[r.status] || r.status}
                    </span>
                  </td>
                  <td className="text-[12px] text-muted-foreground whitespace-nowrap">{formatDate(r.detectedAt)}</td>
                  {isAdmin && (
                  <td>
                    <div className="flex items-center gap-1.5">
                      {r.status === "open" && isAdmin &&  (
                        <button
                          onClick={() => handleRemediate(r.id)}
                          disabled={remediating === r.id}
                          title="Remédiation Zero-Touch"
                          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors disabled:opacity-50"
                        >
                          {remediating === r.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Wrench className="w-3 h-3" />
                          )}
                          Réparer
                        </button>
                      )}
                      {isAdmin && (
                       <button
                        onClick={() => setDeleteId(r.id)}
                        className="p-1.5 rounded text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                       >
                         <Trash2 className="w-3.5 h-3.5" />
                       </button>
                      )}
                    </div>
                  </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

/* ─────────────────────────────────────────────
   TAB 2 : Corrections
───────────────────────────────────────────── */
function CorrectionsTab() {
  const { data: corrections, isLoading } = useGetCorrections()
  
  const pending  = (corrections ?? []).filter((c: any) => c.status === "pending")
  const resolved = (corrections ?? []).filter((c: any) => c.status !== "pending")

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-56 rounded-xl border border-border/40 bg-card/50 animate-pulse" />
        ))}
      </div>
    )
  }

  if (!corrections || corrections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-56 rounded-xl border border-dashed border-border/40 bg-card/20">
        <CheckCircle2 className="w-10 h-10 text-emerald-400 opacity-50 mb-2" />
        <p className="text-sm font-semibold text-foreground">Tout est en ordre</p>
        <p className="text-[12px] text-muted-foreground mt-1">Aucune correction en attente.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <section>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-bold mb-3 flex items-center gap-1.5">
            <Clock3 className="w-3 h-3" /> En attente ({pending.length})
          </p>
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
            {pending.map((c: any) => <CorrectionCard key={c.id} correction={c} />)}
          </div>
        </section>
      )}
      {resolved.length > 0 && (
        <section>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-bold mb-3 flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Traitées ({resolved.length})
          </p>
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
            {resolved.map((c: any) => <CorrectionCard key={c.id} correction={c} />)}
          </div>
        </section>
      )}
    </div>
  )
}

function CorrectionCard({ correction }: { correction: any }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const isPending = correction.status === "pending"

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/corrections"] })
    queryClient.invalidateQueries({ queryKey: ["/api/results"] })
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] })
  }

  const applyMutation = useApplyCorrection({
    mutation: {
      onSuccess: () => {
        invalidate()
        toast({ title: "Correction appliquée", description: `Commandes SSH envoyées sur ${correction.deviceName}.` })
      },
      onError: (err: any) => {
        toast({ title: "Échec SSH", description: err?.response?.data?.error || err?.message, variant: "destructive" })
      },
    },
  })

  const ignoreMutation = useIgnoreCorrection({
    mutation: {
      onSuccess: () => {
        invalidate()
        toast({ title: "Correction ignorée" })
      },
    },
  })

  const dismissMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/corrections/${correction.id}`, { method: "DELETE", headers: authHeader() })
      if (!res.ok) throw new Error()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corrections"] })
      toast({ title: "Correction retirée" })
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  })

  const sevColors: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-blue-500",
}
const sevColor = sevColors[correction.severity] || "bg-blue-500"

  return (
    <div className={`relative rounded-xl border border-border/40 bg-card/80 flex flex-col overflow-hidden ${!isPending ? "opacity-65" : ""}`}>
      {/* Severity bar top */}
      <div className={`absolute top-0 inset-x-0 h-[3px] ${sevColor}`} />

      {/* Header */}
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center justify-between mb-2">
          <span className={SEV_BADGE[correction.severity] ?? "badge badge-low"}>
            {SEVERITY_FR[correction.severity] || correction.severity}
          </span>
          <span className={CORR_STATUS_BADGE[correction.status] ?? "badge badge-pending"}>
            {STATUS_FR[correction.status] || correction.status}
          </span>
        </div>
        <p className="text-[13px] font-semibold text-foreground leading-snug">
          {translateAnomalyType(correction.anomalyType)}
        </p>
        <p className="text-[11px] font-mono text-muted-foreground mt-1">{correction.deviceName}</p>
        <p className="text-[10px] text-muted-foreground/50 mt-0.5 flex items-center gap-1">
          <Clock className="w-2.5 h-2.5" />
          {formatDate(correction.createdAt)}
        </p>
      </div>

      {/* Description + script */}
      <div className="px-4 pb-3 flex-1">
        <p className="text-[12px] text-muted-foreground mb-3">{correction.description}</p>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="w-full h-7 text-[11px] text-muted-foreground border-border/50 bg-background hover:bg-muted/30">
              <Terminal className="w-3 h-3 mr-1.5" />
              Voir le script de remédiation
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-mono text-[13px]">Script — {correction.deviceName}</DialogTitle>
            </DialogHeader>
            <pre className="bg-black/80 rounded-lg p-4 font-mono text-[12px] text-emerald-400 overflow-x-auto whitespace-pre-wrap border border-white/10">
              {correction.correctionScript}
            </pre>
          </DialogContent>
        </Dialog>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border/30">
        {isPending ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-7 text-[11px] hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10"
              onClick={() => ignoreMutation.mutate({ id: correction.id })}
              disabled={ignoreMutation.isPending || applyMutation.isPending}
            >
              <XCircle className="w-3 h-3 mr-1.5" /> Ignorer
            </Button>
            <Button
              size="sm"
              className="flex-1 h-7 text-[11px] bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => {
                if (confirm(`Appliquer la correction sur ${correction.deviceName} via SSH ?`))
                  applyMutation.mutate({ id: correction.id })
              }}
              disabled={ignoreMutation.isPending || applyMutation.isPending}
            >
              <Wrench className="w-3 h-3 mr-1.5" />
              {applyMutation.isPending ? "En cours..." : "Appliquer SSH"}
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              Traité le {formatDate(correction.appliedAt || correction.createdAt)}
            </span>
            <button
              onClick={() => dismissMutation.mutate()}
              disabled={dismissMutation.isPending}
              className="p-1 rounded text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
