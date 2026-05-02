import { AppLayout } from "@/components/layout/AppLayout"
import { useGetDashboardStats, useDeleteAudit } from "@workspace/api-client-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import {
  Server, ShieldAlert, AlertTriangle, Activity,
  RefreshCw, Trash2, TrendingUp, CheckCircle2, Gauge
} from "lucide-react"
import {
  PieChart, Pie, Cell, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid
} from "recharts"
import { formatDate } from "@/lib/utils"
import { useQueryClient } from "@tanstack/react-query"
import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/hooks/use-auth"

const SEVERITY_COLOR: Record<string, string> = {
  critical: "hsl(0,80%,58%)",
  high:     "hsl(24,95%,53%)",
  medium:   "hsl(45,93%,47%)",
  low:      "hsl(215,100%,65%)",
}

const SEVERITY_FR: Record<string, string> = {
  critical: "Critique",
  high:     "Élevée",
  medium:   "Moyenne",
  low:      "Faible",
}

const STATUS_FR: Record<string, string> = {
  pending:   "En attente",
  running:   "En cours",
  completed: "Terminé",
  failed:    "Échoué",
  open:      "Ouvert",
  corrected: "Corrigé",
  ignored:   "Ignoré",
}

const STATUS_BADGE: Record<string, string> = {
  completed: "badge badge-corrected",
  running:   "badge badge-open",
  pending:   "badge badge-pending",
  failed:    "badge badge-critical",
}

export default function Dashboard() {
  const queryClient = useQueryClient()
  useEffect(() => {
    const refetch = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] })
      queryClient.invalidateQueries({ queryKey: ["/api/audits"] })
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

  const [refreshing, setRefreshing] = useState(false)
  const { toast } = useToast()
  const { isAdmin } = useAuth()

  const { data: statsRaw, isLoading, isError } = useGetDashboardStats({
    query: { refetchInterval: 30_000, staleTime: 0 },
  })
  const stats = statsRaw as any

  const deleteMutation = useDeleteAudit({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] })
        queryClient.invalidateQueries({ queryKey: ["/api/audits"] })
        toast({ title: "Audit supprimé", description: "L'entrée a été retirée." })
      },
      onError: () =>
        toast({ title: "Erreur", description: "Suppression impossible.", variant: "destructive" }),
    },
  })

  const handleRefresh = async () => {
    setRefreshing(true)
    await queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] })
    setRefreshing(false)
  }

  const handleDeleteAudit = (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    if (!confirm("Supprimer cet audit ? Cette action est irréversible.")) return
    deleteMutation.mutate({ id })
  }

  if (isError) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-4">
          <ShieldAlert className="w-12 h-12 text-destructive opacity-60" />
          <h2 className="text-xl font-display font-bold">Erreur de connexion</h2>
          <p className="text-muted-foreground text-sm max-w-sm">
            Impossible de charger les données. Vérifiez que le serveur Flask est actif.
          </p>
        </div>
      </AppLayout>
    )
  }

  const chartData = (stats?.anomaliesBySeverity ?? []).map((item: any) => ({
    name:  SEVERITY_FR[item.severity.toLowerCase()] || item.severity,
    value: item.count,
    color: SEVERITY_COLOR[item.severity.toLowerCase()] || SEVERITY_COLOR.low,
  }))

  const barData = (stats?.anomaliesByDevice ?? []).map((d: any) => ({
    name:  d.deviceName,
    count: d.count,
  }))

  const kpiCards = [
    {
      label: "Équipements surveillés",
      value: stats?.totalDevices ?? 0,
      icon: Server,
      accent: "text-cyan-400",
      ring: "ring-cyan-500/20",
      bg: "bg-cyan-500/10",
    },
    {
      label: "Audits réalisés",
      value: stats?.totalAudits ?? 0,
      icon: Activity,
      accent: "text-violet-400",
      ring: "ring-violet-500/20",
      bg: "bg-violet-500/10",
    },
    {
      label: "Anomalies ouvertes",
      value: stats?.openAnomalies ?? 0,
      icon: AlertTriangle,
      accent: "text-orange-400",
      ring: "ring-orange-500/20",
      bg: "bg-orange-500/10",
    },
    {
      label: "Menaces critiques",
      value: stats?.criticalAnomalies ?? 0,
      icon: ShieldAlert,
      accent: "text-red-400",
      ring: "ring-red-500/20",
      bg: "bg-red-500/10",
    },
  ]

  return (
    <AppLayout>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-display font-bold text-foreground">
            Centre de Commande
          </h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
            </span>
            Télémétrie réseau en temps réel — actualisation toutes les 30 s
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing || isLoading}
          className="h-8 border-border/60 bg-card hover:bg-muted/50 text-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[100px] rounded-xl" />
            ))
          : kpiCards.map((card) => (
              <div
                key={card.label}
                className={`rounded-xl border border-border/40 bg-card/80 p-5 ring-1 ${card.ring} hover:ring-2 transition-all`}
              >
                <div className="flex items-start justify-between mb-3">
                  <p className="text-[12px] text-muted-foreground font-medium leading-tight">
                    {card.label}
                  </p>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${card.bg}`}>
                    <card.icon className={`w-4 h-4 ${card.accent}`} />
                  </div>
                </div>
                <p className={`text-3xl font-display font-bold ${card.accent}`}>{card.value}</p>
              </div>
            ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Pie chart */}
        <div className="rounded-xl border border-border/40 bg-card/80 p-5">
          <div className="mb-3">
            <p className="text-[13px] font-semibold text-foreground">Répartition par Sévérité</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Anomalies actives par niveau</p>
          </div>
          {isLoading ? (
            <Skeleton className="h-[220px] rounded-lg" />
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="45%"
                  innerRadius={55}
                  outerRadius={78}
                  paddingAngle={4}
                  dataKey="value"
                  stroke="none"
                >
                  {chartData.map((entry: any, i: number) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                 contentStyle={{
                  background: "hsl(220,16%,7%)",
                  border: "1px solid hsl(220,14%,14%)",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "#ffffff",
                 }}
                 itemStyle={{ color: "#ffffff" }}
                 labelStyle={{ color: "#94a3b8" }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(v) => (
                    <span style={{ fontSize: 11, color: "hsl(220,8%,60%)" }}>{v}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center">
              <div className="text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-60" />
                <p className="text-sm text-muted-foreground">Aucune anomalie active</p>
              </div>
            </div>
          )}
        </div>

        {/* Bar chart */}
        <div className="lg:col-span-2 rounded-xl border border-border/40 bg-card/80 p-5">
          <div className="mb-3">
            <p className="text-[13px] font-semibold text-foreground">Top 5 — Équipements (Anomalies)</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Équipements nécessitant une intervention</p>
          </div>
          {isLoading ? (
            <Skeleton className="h-[220px] rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(220,14%,13%)"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "hsl(220,8%,55%)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(220,8%,55%)" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: "hsl(220,14%,11%)" }}
                  contentStyle={{
                    background: "hsl(220,16%,7%)",
                    border: "1px solid hsl(220,14%,14%)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar
                  dataKey="count"
                  name="Anomalies"
                  fill="hsl(185,96%,46%)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Risk Score Section */}
      {!isLoading && (stats?.deviceRiskScores ?? []).length > 0 && (
        <div className="rounded-xl border border-border/40 bg-card/80 mb-6 overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between">
            <div>
              <p className="text-[13px] font-semibold text-foreground flex items-center gap-2">
                <Gauge className="w-4 h-4 text-primary" strokeWidth={1.8} />
                Indice de Risque par Équipement
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Score pondéré basé sur les anomalies actives — critical ×40, high ×25, medium ×15, low ×5
              </p>
            </div>
          </div>
          <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(stats?.deviceRiskScores ?? []).map((d: any) => {
              const score = d.score as number
              const color =
                score >= 70 ? "bg-red-500" :
                score >= 40 ? "bg-orange-500" :
                score >= 15 ? "bg-yellow-500" :
                "bg-emerald-500"
              const textColor =
                score >= 70 ? "text-red-400" :
                score >= 40 ? "text-orange-400" :
                score >= 15 ? "text-yellow-400" :
                "text-emerald-400"
              const label =
                score >= 70 ? "Critique" :
                score >= 40 ? "Élevé" :
                score >= 15 ? "Modéré" :
                "Faible"
              return (
                <div key={d.deviceId} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[12px] font-semibold text-foreground truncate max-w-[160px]">
                        {d.deviceName}
                      </p>
                      <p className="text-[10px] font-mono text-muted-foreground">{d.ipAddress || d.vendor}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-[14px] font-bold font-display ${textColor}`}>{score}</p>
                      <p className={`text-[10px] font-medium ${textColor}`}>{label}</p>
                    </div>
                  </div>
                  <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${color}`}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent audits table */}
      <div className="rounded-xl border border-border/40 bg-card/80 overflow-hidden">
        <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between">
          <div>
            <p className="text-[13px] font-semibold text-foreground">Journaux d'Audit Récents</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Historique des scans de sécurité</p>
          </div>
          <TrendingUp className="w-4 h-4 text-muted-foreground/40" />
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Équipement cible</th>
                <th>Anomalies détectées</th>
                <th>Statut</th>
                <th>Date d'exécution</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j}>
                          <Skeleton className="h-4 w-24 rounded" />
                        </td>
                      ))}
                    </tr>
                  ))
                : (stats?.recentAudits ?? []).map((audit: any) => (
                    <tr key={audit.id}>
                      <td>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          #{String(audit.id).padStart(4, "0")}
                        </span>
                      </td>
                      <td>
                        <span className="font-medium text-foreground text-[13px]">
                          {audit.deviceName}
                        </span>
                      </td>
                      <td>
                        {audit.anomaliesFound > 0 ? (
                          <span className="badge badge-high">
                            <AlertTriangle className="w-3 h-3" />
                            {audit.anomaliesFound} anomalie{audit.anomaliesFound > 1 ? "s" : ""}
                          </span>
                        ) : (
                          <span className="badge badge-corrected">
                            <CheckCircle2 className="w-3 h-3" />
                            Aucune
                          </span>
                        )}
                      </td>
                      <td>
                        <span
                          className={
                            STATUS_BADGE[audit.status] ??
                            "badge badge-pending"
                          }
                        >
                          {STATUS_FR[audit.status] || audit.status}
                        </span>
                      </td>
                      <td>
                        <span className="text-[12px] text-muted-foreground">
                          {formatDate(audit.createdAt)}
                        </span>
                      </td>
                      <td>
                        {isAdmin && (
                        <button
                          onClick={(e) => handleDeleteAudit(e, audit.id)}
                          disabled={deleteMutation.isPending}
                          className="p-1.5 rounded-md text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30"
                          title="Supprimer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        )}
                      </td>
                    </tr>
                  ))}
              {!isLoading && (stats?.recentAudits?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                    Aucun audit trouvé. Lancez un audit depuis la section « Lancer un Audit ».
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  )
}
