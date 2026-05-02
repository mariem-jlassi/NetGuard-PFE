import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@workspace/api-client-react"
import { AppLayout } from "@/components/layout/AppLayout"
import { Shield, RefreshCw, CheckCircle2, XCircle, ShieldOff, RotateCcw } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Policy {
  ruleId: string
  ruleName: string
  vendor: string
  severity: string
  category: string
  isEnabled: boolean
  updatedAt: string | null
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: "text-red-400 bg-red-500/10 border-red-500/20",
  high:     "text-orange-400 bg-orange-500/10 border-orange-500/20",
  medium:   "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  low:      "text-blue-400 bg-blue-500/10 border-blue-500/20",
}

const SEVERITY_FR: Record<string, string> = {
  critical: "Critique", high: "Élevé", medium: "Moyen", low: "Faible",
}

const VENDOR_FR: Record<string, string> = {
  cisco: "Cisco IOS",
  fortinet: "FortiGate",
  fortigate: "FortiGate",
  all: "Tous",
}

const CATEGORY_FR: Record<string, string> = {
  insecure_protocol:    "Protocole non sécurisé",
  insecure_service:     "Service non sécurisé",
  weak_authentication:  "Authentification faible",
  default_credentials:  "Identifiants par défaut",
  permissive_acl:       "ACL permissive",
  missing_logging:      "Journalisation absente",
  missing_ntp:          "NTP absent",
  missing_banner:       "Bannière absente",
  information_disclosure: "Divulgation d'infos",
  vlan_misconfiguration:  "Mauvaise config VLAN",
}

export default function Policies() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [filterVendor, setFilterVendor] = useState<string>("all")
  const [filterSeverity, setFilterSeverity] = useState<string>("all")
  const [filterStatus, setFilterStatus] = useState<string>("all")

  const { data: policies = [], isLoading } = useQuery<Policy[]>({
    queryKey: ["/api/policies"],
    queryFn: () => apiFetch("/api/policies"),
    refetchInterval: false,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ ruleId, isEnabled }: { ruleId: string; isEnabled: boolean }) =>
      apiFetch(`/api/policies/${ruleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/policies"] }),
    onError: () => toast({ title: "Erreur", description: "Impossible de modifier la règle.", variant: "destructive" }),
  })

  const resetMutation = useMutation({
    mutationFn: () => apiFetch("/api/policies/reset", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/policies"] })
      toast({ title: "Réinitialisé", description: "Toutes les règles ont été réactivées." })
    },
  })

  const filtered = policies.filter(p => {
    if (filterVendor !== "all" && p.vendor !== filterVendor) return false
    if (filterSeverity !== "all" && p.severity !== filterSeverity) return false
    if (filterStatus === "active" && !p.isEnabled) return false
    if (filterStatus === "disabled" && p.isEnabled) return false
    return true
  })

  const enabledCount = policies.filter(p => p.isEnabled).length
  const totalCount = policies.length
  const vendors = [...new Set(policies.map(p => p.vendor))]

  return (
    <AppLayout>
    <div className="flex-1 flex flex-col min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/30 bg-card/40 px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-display font-bold text-foreground flex items-center gap-2.5">
              <Shield className="w-5 h-5 text-primary" strokeWidth={1.8} />
              Politiques de Sécurité
            </h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Activez ou désactivez les règles NLP appliquées lors des audits
            </p>
          </div>
          <button
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium border border-border/40 text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Tout réactiver
          </button>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-6 mt-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" strokeWidth={1.8} />
            <span className="text-[13px] text-muted-foreground">
              <span className="text-emerald-400 font-semibold">{enabledCount}</span> règles actives
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldOff className="w-4 h-4 text-muted-foreground/50" strokeWidth={1.8} />
            <span className="text-[13px] text-muted-foreground">
              <span className="font-semibold text-foreground">{totalCount - enabledCount}</span> désactivées
            </span>
          </div>
          <div className="flex-1 h-1.5 rounded-full bg-white/[0.05] overflow-hidden max-w-[200px]">
            <div
              className="h-full rounded-full bg-emerald-500/70 transition-all duration-500"
              style={{ width: totalCount > 0 ? `${(enabledCount / totalCount) * 100}%` : "0%" }}
            />
          </div>
          <span className="text-[11px] text-muted-foreground/50">
            {totalCount > 0 ? Math.round((enabledCount / totalCount) * 100) : 0}% actives
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="px-8 py-4 flex items-center gap-3 border-b border-border/20">
        <span className="text-[12px] text-muted-foreground/60 mr-1">Filtrer :</span>

        <select
          value={filterVendor}
          onChange={e => setFilterVendor(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-border/40 bg-card/80 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
        >
          <option value="all">Tous les équipements</option>
          {vendors.map(v => (
            <option key={v} value={v}>{VENDOR_FR[v] || v}</option>
          ))}
        </select>

        <select
          value={filterSeverity}
          onChange={e => setFilterSeverity(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-border/40 bg-card/80 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
        >
          <option value="all">Toutes les sévérités</option>
          <option value="critical">Critique</option>
          <option value="high">Élevé</option>
          <option value="medium">Moyen</option>
          <option value="low">Faible</option>
        </select>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-border/40 bg-card/80 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
        >
          <option value="all">Actives + Désactivées</option>
          <option value="active">Actives uniquement</option>
          <option value="disabled">Désactivées uniquement</option>
        </select>

        <span className="ml-auto text-[12px] text-muted-foreground/50">
          {filtered.length} règle{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 px-8 py-6">
        <div className="rounded-xl border border-border/40 bg-card/80 overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 52 }}>Statut</th>
                <th>Règle NLP</th>
                <th>Équipement</th>
                <th>Sévérité</th>
                <th>Catégorie</th>
                <th style={{ width: 80 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j}><div className="h-3 bg-white/[0.04] rounded animate-pulse w-full" /></td>
                      ))}
                    </tr>
                  ))
                : filtered.length === 0
                  ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-muted-foreground/40 text-[13px]">
                        Aucune règle ne correspond aux filtres sélectionnés.
                      </td>
                    </tr>
                  )
                  : filtered.map(policy => (
                    <tr key={policy.ruleId} className={!policy.isEnabled ? "opacity-50" : ""}>
                      <td>
                        <span
                          className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${
                            policy.isEnabled ? "text-emerald-400" : "text-muted-foreground/30"
                          }`}
                        >
                          {policy.isEnabled
                            ? <CheckCircle2 className="w-4 h-4" strokeWidth={2} />
                            : <XCircle className="w-4 h-4" strokeWidth={2} />
                          }
                        </span>
                      </td>
                      <td>
                        <div>
                          <p className="text-[12px] font-mono text-primary/80 leading-none mb-0.5">{policy.ruleId}</p>
                          <p className="text-[12px] text-foreground/80 leading-snug">{policy.ruleName}</p>
                        </div>
                      </td>
                      <td>
                        <span className="text-[12px] text-muted-foreground">
                          {VENDOR_FR[policy.vendor] || policy.vendor}
                        </span>
                      </td>
                      <td>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${SEVERITY_COLOR[policy.severity] || ""}`}>
                          {SEVERITY_FR[policy.severity] || policy.severity}
                        </span>
                      </td>
                      <td>
                        <span className="text-[12px] text-muted-foreground/70">
                          {CATEGORY_FR[policy.category] || policy.category}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => toggleMutation.mutate({ ruleId: policy.ruleId, isEnabled: !policy.isEnabled })}
                          disabled={toggleMutation.isPending}
                          className={`px-3 py-1 rounded text-[11px] font-medium border transition-colors ${
                            policy.isEnabled
                              ? "text-red-400 bg-red-500/10 border-red-500/20 hover:bg-red-500/20"
                              : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20"
                          }`}
                        >
                          {policy.isEnabled ? "Désactiver" : "Activer"}
                        </button>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>

        {/* Info notice */}
        <div className="mt-4 flex items-start gap-2.5 px-4 py-3 rounded-lg border border-primary/10 bg-primary/5">
          <RefreshCw className="w-3.5 h-3.5 text-primary/60 mt-0.5 shrink-0" strokeWidth={1.8} />
          <p className="text-[12px] text-muted-foreground/70 leading-relaxed">
            Les modifications prennent effet immédiatement au prochain audit. Les règles désactivées ne seront pas 
            exécutées par le moteur NLP, ce qui réduit le nombre d'anomalies détectées sur les équipements concernés.
          </p>
        </div>
      </div>
    </div>
    </AppLayout>
  )
}
