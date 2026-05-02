import { AppLayout } from "@/components/layout/AppLayout"
import { useGetResults } from "@workspace/api-client-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getSeverityColor, getStatusColor, formatDate, translateAnomalyType } from "@/lib/utils"
import { FileText, Search, Trash2, AlertTriangle, Printer, Download, Filter, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useState } from "react"
import { useQueryClient, useMutation } from "@tanstack/react-query"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

const SEVERITY_FR: Record<string, string> = {
  critical: "Critique",
  high: "Élevée",
  medium: "Moyenne",
  low: "Faible",
}

const STATUS_FR: Record<string, string> = {
  open: "Ouverte",
  corrected: "Corrigée",
  ignored: "Ignorée",
}

export default function Results() {
  const search = window.location.search
  const params = new URLSearchParams(search)
  const deviceId = params.get("deviceId") ? parseInt(params.get("deviceId")!) : undefined

  const [searchQuery, setSearchQuery] = useState("")
  const [filterSeverity, setFilterSeverity] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [cleanDialog, setCleanDialog] = useState(false)

  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: results, isLoading } = useGetResults({ deviceId })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/results"] })
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] })
  }

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/results/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Échec de la suppression")
    },
    onSuccess: () => {
      toast({ title: "Résultat supprimé", description: "L'anomalie a été retirée du journal." })
      invalidateAll()
      setDeleteId(null)
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de supprimer ce résultat.", variant: "destructive" })
      setDeleteId(null)
    },
  })

  const cleanMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/results?status=corrected`, { 
        method: "DELETE",
        headers: { "Authorization": "Bearer " + (localStorage.getItem("netguard_token") || "") }
      })
      if (!res.ok) throw new Error("Échec du nettoyage")
    },
    onSuccess: () => {
      toast({ title: "Nettoyage effectué", description: "Tous les résultats corrigés ont été supprimés." })
      invalidateAll()
      setCleanDialog(false)
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de nettoyer les résultats.", variant: "destructive" })
      setCleanDialog(false)
    },
  })

  const filtered = (results ?? []).filter((r) => {
    const q = searchQuery.toLowerCase()
    const matchSearch =
      !q ||
      r.anomalyType.toLowerCase().includes(q) ||
      r.deviceName.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q)
    const matchSeverity = filterSeverity === "all" || r.severity === filterSeverity
    const matchStatus = filterStatus === "all" || r.status === filterStatus
    return matchSearch && matchSeverity && matchStatus
  })

  const correctedCount = results?.filter((r) => r.status === "corrected" || r.status === "ignored").length ?? 0
  const activeFilters = (filterSeverity !== "all" ? 1 : 0) + (filterStatus !== "all" ? 1 : 0)

  // Stats rapides
  const criticalCount = filtered.filter((r) => r.severity === "critical").length
  const openCount = filtered.filter((r) => r.status === "open").length

  const exportToPDF = () => {
    const now = new Date().toLocaleString("fr-FR")
    const rows = (filtered ?? [])
      .map(
        (r) => `
      <tr>
        <td>${translateAnomalyType(r.anomalyType)}</td>
        <td>${r.deviceName}<br/><small>AUD-${r.auditId.toString().padStart(4, "0")}</small></td>
        <td><span class="sev sev-${r.severity}">${SEVERITY_FR[r.severity] || r.severity}</span></td>
        <td>${STATUS_FR[r.status] || r.status}</td>
        <td style="font-size:11px">${r.description}</td>
        <td>${formatDate(r.detectedAt)}</td>
      </tr>`
      )
      .join("")

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Rapport d'Audit NetGuard</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1a1a2e; padding: 32px; }
  header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 16px; border-bottom: 3px solid #00f0ff; margin-bottom: 24px; }
  header h1 { font-size: 22px; color: #00b4cc; letter-spacing: 1px; }
  header .meta { text-align: right; font-size: 11px; color: #555; }
  .stats { display: flex; gap: 16px; margin-bottom: 24px; }
  .stat { background: #f0fbfc; border: 1px solid #d0edf5; border-radius: 8px; padding: 12px 20px; flex: 1; text-align: center; }
  .stat strong { display: block; font-size: 24px; color: #00b4cc; }
  .stat span { font-size: 11px; color: #666; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #e8f7fb; color: #004466; font-size: 11px; text-transform: uppercase; padding: 10px 12px; text-align: left; border-bottom: 2px solid #c0e8f5; }
  td { padding: 9px 12px; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
  tr:nth-child(even) td { background: #fafcfd; }
  small { color: #888; font-size: 10px; }
  .sev { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; text-transform: uppercase; }
  .sev-critical { background:#fee; color:#c00; border:1px solid #fcc; }
  .sev-high { background:#fff0e0; color:#b06000; border:1px solid #fcd9a0; }
  .sev-medium { background:#fffbcc; color:#7a6400; border:1px solid #f0e060; }
  .sev-low { background:#efffef; color:#1a7a1a; border:1px solid #aee; }
  footer { margin-top: 24px; text-align: center; font-size: 10px; color: #aaa; border-top: 1px solid #e0e0e0; padding-top: 12px; }
  @media print { body { padding: 16px; } }
</style>
</head>
<body>
<header>
  <div>
    <h1>🛡 NetGuard — Rapport d'Audit Réseau</h1>
    <p style="font-size:12px;color:#555;margin-top:4px;">Système de détection automatique d'anomalies Zero-Touch</p>
  </div>
  <div class="meta">
    <p><strong>Généré le :</strong> ${now}</p>
    <p><strong>Nombre d'anomalies :</strong> ${filtered?.length ?? 0}</p>
  </div>
</header>
<div class="stats">
  <div class="stat"><strong>${filtered?.filter((r) => r.severity === "critical").length ?? 0}</strong><span>Critiques</span></div>
  <div class="stat"><strong>${filtered?.filter((r) => r.severity === "high").length ?? 0}</strong><span>Élevées</span></div>
  <div class="stat"><strong>${filtered?.filter((r) => r.severity === "medium").length ?? 0}</strong><span>Moyennes</span></div>
  <div class="stat"><strong>${filtered?.filter((r) => r.status === "corrected").length ?? 0}</strong><span>Corrigées</span></div>
</div>
<table>
  <thead>
    <tr>
      <th>Type d'anomalie</th>
      <th>Équipement / Audit</th>
      <th>Sévérité</th>
      <th>Statut</th>
      <th>Description</th>
      <th>Détectée le</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<footer>NetGuard — PFE Génie Informatique &nbsp;|&nbsp; Confidentiel &nbsp;|&nbsp; ${now}</footer>
</body>
</html>`

    const win = window.open("", "_blank")
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 500)
  }

  const exportToCSV = () => {
    const header = "Type Anomalie;Équipement;Audit;Sévérité;Statut;Description;Détectée le\n"
    const rows = (filtered ?? [])
      .map(
        (r) =>
          [
            translateAnomalyType(r.anomalyType),
            r.deviceName,
            `AUD-${r.auditId.toString().padStart(4, "0")}`,
            SEVERITY_FR[r.severity] || r.severity,
            STATUS_FR[r.status] || r.status,
            `"${r.description.replace(/"/g, '""')}"`,
            formatDate(r.detectedAt),
          ].join(";")
      )
      .join("\n")

    const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `netguard_resultats_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <AppLayout>
      {/* Confirmation suppression individuelle */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="glass-panel border-border/50">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Supprimer ce résultat ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cette anomalie sera définitivement retirée du journal. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation nettoyage global */}
      <AlertDialog open={cleanDialog} onOpenChange={setCleanDialog}>
        <AlertDialogContent className="glass-panel border-border/50">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-orange-500" />
              Nettoyer les anciens résultats ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Les <strong>{correctedCount}</strong> résultat(s) corrigé(s) ou ignoré(s) seront
              définitivement supprimés. Seules les anomalies encore ouvertes seront conservées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={() => cleanMutation.mutate()}
            >
              Nettoyer ({correctedCount})
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* En-tête */}
      <div className="mb-5 flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-display font-bold text-foreground">Résultats d'Audit</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Journal détaillé — {filtered?.length ?? 0} résultat(s)
            {criticalCount > 0 && (
              <span className="ml-2 text-red-400 font-semibold">
                · {criticalCount} critique(s)
              </span>
            )}
            {openCount > 0 && (
              <span className="ml-2 text-yellow-400 font-semibold">
                · {openCount} ouverte(s)
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(filtered?.length ?? 0) > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={exportToCSV}
                className="border-accent/40 text-accent hover:bg-accent/10"
              >
                <Download className="w-4 h-4 mr-1.5" />
                Exporter CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportToPDF}
                className="border-primary/40 text-primary hover:bg-primary/10"
              >
                <Printer className="w-4 h-4 mr-1.5" />
                Exporter PDF
              </Button>
            </>
          )}
          {correctedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCleanDialog(true)}
              className="border-orange-500/40 text-orange-400 hover:bg-orange-500/10"
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Nettoyer ({correctedCount})
            </Button>
          )}
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher une anomalie, équipement..."
            className="pl-9 bg-card border-border/50 focus-visible:ring-primary/50"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
          <SelectTrigger className="w-44 bg-card border-border/50">
            <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Sévérité" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes sévérités</SelectItem>
            <SelectItem value="critical">🔴 Critique</SelectItem>
            <SelectItem value="high">🟠 Élevée</SelectItem>
            <SelectItem value="medium">🟡 Moyenne</SelectItem>
            <SelectItem value="low">🟢 Faible</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40 bg-card border-border/50">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="open">Ouverte</SelectItem>
            <SelectItem value="corrected">Corrigée</SelectItem>
            <SelectItem value="ignored">Ignorée</SelectItem>
          </SelectContent>
        </Select>

        {activeFilters > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setFilterSeverity("all"); setFilterStatus("all") }}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5 mr-1.5" />
            Réinitialiser ({activeFilters})
          </Button>
        )}
      </div>

      {/* Tableau */}
      <Card className="glass-panel border-border/50">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/30 border-b border-border/50">
                <tr>
                  <th className="px-6 py-4">Détails de l'anomalie</th>
                  <th className="px-6 py-4">Équipement</th>
                  <th className="px-6 py-4">Sévérité</th>
                  <th className="px-6 py-4">Statut</th>
                  <th className="px-6 py-4 text-center">Détectée le</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground animate-pulse">
                      Chargement des journaux...
                    </td>
                  </tr>
                ) : filtered?.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-16 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <FileText className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
                        <p className="text-lg font-medium text-foreground">Aucune anomalie trouvée</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Lancez un nouvel audit ou ajustez vos filtres.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered?.map((result) => (
                    <tr key={result.id} className="hover:bg-muted/20 transition-colors group">
                      <td className="px-6 py-4 max-w-md">
                        <p className="font-semibold text-foreground mb-1">
                          {translateAnomalyType(result.anomalyType)}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{result.description}</p>
                        <p className="text-xs font-mono text-muted-foreground/60 mt-1 truncate">
                          Config: {result.affectedConfig}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium text-foreground">{result.deviceName}</p>
                        <p className="text-xs font-mono text-muted-foreground">
                          AUD-{result.auditId.toString().padStart(4, "0")}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider border ${getSeverityColor(
                            result.severity
                          )}`}
                        >
                          {SEVERITY_FR[result.severity] || result.severity}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`flex items-center w-fit gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusColor(
                            result.status
                          )}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {STATUS_FR[result.status] || result.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center text-muted-foreground whitespace-nowrap">
                        {formatDate(result.detectedAt)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteId(result.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          title="Supprimer ce résultat"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </AppLayout>
  )
}
