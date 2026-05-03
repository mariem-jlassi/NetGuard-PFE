import { useState } from "react"
import { AppLayout } from "@/components/layout/AppLayout"
import { useGetDevices } from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Calendar, Clock, Play, Plus, Trash2, ToggleLeft, ToggleRight,
  Zap, AlertCircle, CheckCircle2, Server,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useToast } from "@/hooks/use-toast"
import { formatDate } from "@/lib/utils"

const FREQ_FR: Record<string, string> = {
  hourly: "Toutes les heures",
  daily: "Chaque jour",
  weekly: "Chaque semaine",
}

const DAY_FR: Record<string, string> = {
  "0": "Dimanche", "1": "Lundi", "2": "Mardi", "3": "Mercredi",
  "4": "Jeudi", "5": "Vendredi", "6": "Samedi",
}

function authHeader() {
  const t = localStorage.getItem("netguard_token")
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" }
}

export default function Scheduler() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { data: devices } = useGetDevices()
  const [isFormOpen, setIsFormOpen] = useState(false)

  const { data: schedules, isLoading } = useQuery<any[]>({
    queryKey: ["/api/scheduler"],
    queryFn: async () => {
      const r = await fetch("/api/scheduler", { headers: authHeader() })
      if (!r.ok) throw new Error("Chargement impossible")
      return r.json()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/scheduler/${id}`, { method: "DELETE", headers: authHeader() })
      if (!r.ok) throw new Error("Suppression impossible")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/scheduler"] })
      toast({ title: "Planning supprimé" })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      const r = await fetch(`/api/scheduler/${id}`, {
        method: "PUT",
        headers: authHeader(),
        body: JSON.stringify({ enabled }),
      })
      if (!r.ok) throw new Error("Mise à jour impossible")
      return r.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/scheduler"] })
    },
  })

  const runNowMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/scheduler/${id}/run-now`, { method: "POST", headers: authHeader() })
      if (!r.ok) throw new Error("Échec du lancement")
      return r.json()
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/scheduler"] })
      qc.invalidateQueries({ queryKey: ["/api/audits"] })
      qc.invalidateQueries({ queryKey: ["/api/results"] })
      qc.invalidateQueries({ queryKey: ["/api/dashboard/stats"] })
      const count = data?.anomaliesFound ?? 0
      const desc = count > 0
        ? `${count} anomalie${count > 1 ? "s" : ""} détectée${count > 1 ? "s" : ""}.`
        : "Aucune anomalie détectée. Équipement conforme ✅"
      toast({ title: "✅ Audit lancé manuellement", description: desc })
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" })
    },
  })

  const enabledCount = schedules?.filter((s) => s.enabled).length ?? 0
  const totalCount = schedules?.length ?? 0

  return (
    <AppLayout>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-display font-bold text-foreground">Planification des Scans</h1>
          <p className="text-muted-foreground mt-1">
            Audits Zero-Touch récurrents — {enabledCount} planning(s) actif(s) sur {totalCount}
          </p>
        </div>
        <Button
          onClick={() => setIsFormOpen(true)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_rgba(0,240,255,0.2)]"
        >
          <Plus className="w-4 h-4 mr-2" /> Nouveau planning
        </Button>
      </div>

      <div className="mb-6 p-4 rounded-xl border border-primary/20 bg-primary/5 flex gap-4">
        <Zap className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-foreground">Automatisation Zero-Touch</p>
          <p className="text-xs text-muted-foreground mt-1">
            Les audits planifiés se connectent automatiquement en SSH à l'heure définie,
            récupèrent la configuration de l'équipement, analysent les anomalies via les modèles NLP
            et génèrent les corrections — sans aucune intervention humaine.
          </p>
        </div>
      </div>

      {isFormOpen && (
        <Card className="glass-panel border-primary/30 mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Nouveau planning d'audit
            </CardTitle>
            <CardDescription>
              Définissez la fréquence et l'heure d'exécution automatique
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScheduleForm
              devices={devices ?? []}
              onSuccess={() => {
                setIsFormOpen(false)
                qc.invalidateQueries({ queryKey: ["/api/scheduler"] })
              }}
              onCancel={() => setIsFormOpen(false)}
            />
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="glass-panel h-44 animate-pulse bg-muted/20 border-border/50" />
          ))}
        </div>
      ) : schedules?.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[40vh] text-center bg-card/30 rounded-2xl border border-border/50 border-dashed">
          <Calendar className="w-16 h-16 text-muted-foreground mb-4 opacity-30" />
          <h2 className="text-xl font-display font-bold">Aucun planning configuré</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Créez un premier planning pour activer les audits automatiques Zero-Touch.
          </p>
          <Button onClick={() => setIsFormOpen(true)} className="mt-6 bg-primary text-primary-foreground">
            <Plus className="w-4 h-4 mr-2" />
            Créer un planning
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {schedules?.map((schedule) => (
            <Card
              key={schedule.id}
              className={`glass-panel border-border/50 relative overflow-hidden transition-opacity ${
                !schedule.enabled ? "opacity-60" : ""
              }`}
            >
              <div className={`absolute top-0 left-0 w-full h-0.5 ${schedule.enabled ? "bg-primary" : "bg-muted"}`} />
              <CardContent className="p-5">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center border border-border">
                      <Server className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-foreground">
                        {schedule.deviceName || `Device #${schedule.deviceId}`}
                      </p>
                      {schedule.label && (
                        <p className="text-xs text-muted-foreground">{schedule.label}</p>
                      )}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      schedule.enabled ? "border-primary/40 text-primary" : "border-muted-foreground/30 text-muted-foreground"
                    }`}
                  >
                    {schedule.enabled ? "Actif" : "Inactif"}
                  </Badge>
                </div>

                <div className="space-y-1.5 mb-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    <span className="font-medium text-foreground">
                      {FREQ_FR[schedule.frequency] || schedule.frequency}
                    </span>
                    {schedule.frequency !== "hourly" && (
                      <span>à {String(schedule.hour).padStart(2, "0")}:{String(schedule.minute).padStart(2, "0")}</span>
                    )}
                    {schedule.frequency === "weekly" && (
                      <span>({DAY_FR[schedule.dayOfWeek] || `Jour ${schedule.dayOfWeek}`})</span>
                    )}
                  </div>
                  {schedule.lastRun ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Dernier : {formatDate(schedule.lastRun)}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />
                      <span>Jamais exécuté</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-xs border-primary/40 text-primary hover:bg-primary/10"
                    onClick={() => runNowMutation.mutate(schedule.id)}
                    disabled={runNowMutation.isPending}
                    title="Lancer l'audit immédiatement"
                  >
                    <Play className="w-3 h-3 mr-1" />
                    {runNowMutation.isPending ? "..." : "Lancer"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="px-2 hover:bg-muted/50"
                    onClick={() => toggleMutation.mutate({ id: schedule.id, enabled: !schedule.enabled })}
                    title={schedule.enabled ? "Désactiver" : "Activer"}
                  >
                    {schedule.enabled ? (
                      <ToggleRight className="w-4 h-4 text-primary" />
                    ) : (
                      <ToggleLeft className="w-4 h-4 text-muted-foreground" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="px-2 hover:text-destructive hover:bg-destructive/10"
                    onClick={() => { if (confirm("Supprimer ce planning ?")) deleteMutation.mutate(schedule.id) }}
                    disabled={deleteMutation.isPending}
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppLayout>
  )
}

function ScheduleForm({
  devices, onSuccess, onCancel,
}: { devices: any[]; onSuccess: () => void; onCancel: () => void }) {
  const { toast } = useToast()
  const [frequency, setFrequency] = useState("daily")
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const deviceId = form.get("deviceId")
    if (!deviceId) {
      toast({ title: "Erreur", description: "Sélectionnez un équipement.", variant: "destructive" })
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        deviceId: parseInt(deviceId as string),
        label: form.get("label") as string,
        frequency,
        hour: parseInt((form.get("hour") as string) || "2"),
        minute: parseInt((form.get("minute") as string) || "0"),
        dayOfWeek: (form.get("dayOfWeek") as string) || "1",
      }
      const r = await fetch("/api/scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!r.ok) {
        const err = await r.json()
        throw new Error(err.error || "Création impossible")
      }
      toast({ title: "Planning créé", description: "L'audit automatique est maintenant planifié." })
      onSuccess()
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2 col-span-2">
          <Label>Équipement cible</Label>
          <Select name="deviceId" required>
            <SelectTrigger className="bg-background border-border/50">
              <SelectValue placeholder="Sélectionner un équipement..." />
            </SelectTrigger>
            <SelectContent>
              {devices.map((d) => (
                <SelectItem key={d.id} value={d.id.toString()}>
                  <span className="flex items-center gap-2">
                    {d.name}
                    <span className="text-xs text-muted-foreground font-mono">{d.ipAddress}</span>
                    {!d.sshUsername && <span className="text-[10px] text-yellow-500">(SSH non configuré)</span>}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 col-span-2">
          <Label htmlFor="label">Libellé (optionnel)</Label>
          <Input id="label" name="label" placeholder="ex. Audit nuit CORE-SW-01" className="bg-background" />
        </div>
        <div className="space-y-2 col-span-2">
          <Label>Fréquence</Label>
          <Select value={frequency} onValueChange={setFrequency}>
            <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hourly">Toutes les heures</SelectItem>
              <SelectItem value="daily">Chaque jour</SelectItem>
              <SelectItem value="weekly">Chaque semaine</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {frequency !== "hourly" && (
          <>
            <div className="space-y-2">
              <Label htmlFor="hour">Heure (0–23)</Label>
              <Input id="hour" name="hour" type="number" min={0} max={23} defaultValue={2} className="bg-background" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="minute">Minute (0–59)</Label>
              <Input id="minute" name="minute" type="number" min={0} max={59} defaultValue={0} className="bg-background" />
            </div>
          </>
        )}
        {frequency === "weekly" && (
          <div className="space-y-2 col-span-2">
            <Label>Jour de la semaine</Label>
            <Select name="dayOfWeek" defaultValue="1">
              <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(DAY_FR).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Annuler</Button>
        <Button type="submit" disabled={submitting || devices.length === 0} className="bg-primary text-primary-foreground">
          {submitting ? "Création..." : "Créer le planning"}
        </Button>
      </div>
    </form>
  )
}
