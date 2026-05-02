import { useRef, useState } from "react"
import { AppLayout } from "@/components/layout/AppLayout"
import { useGetDevices, useCreateDevice, useDeleteDevice, useUpdateDevice } from "@workspace/api-client-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Plus, Server, Trash2, Edit2, Shield, Wifi, Search,
  Download, Upload, X, CheckCircle2, Filter,
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getStatusColor, formatDate } from "@/lib/utils"
import { useQueryClient } from "@tanstack/react-query"
import { useToast } from "@/hooks/use-toast"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/hooks/use-auth"

const STATUS_FR: Record<string, string> = {
  online: "En ligne",
  offline: "Hors ligne",
  unknown: "Inconnu",
}

const TYPE_FR: Record<string, string> = {
  switch: "Commutateur",
  firewall: "Pare-feu",
}

export default function Devices() {
  const { data: devicesRaw, isLoading } = useGetDevices()
  const devices = devicesRaw as any[] | undefined
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editDevice, setEditDevice] = useState<any>(null)

  // Filtres
  const [search, setSearch] = useState("")
  const [filterType, setFilterType] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")

  // Import CSV
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { isAdmin } = useAuth()

  const filtered = ((devices ?? []) as any[]).filter((d) => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      d.name.toLowerCase().includes(q) ||
      d.ipAddress.toLowerCase().includes(q) ||
      (d.vendor || "").toLowerCase().includes(q) ||
      (d.model || "").toLowerCase().includes(q)
    const matchType = filterType === "all" || d.type === filterType
    const matchStatus = filterStatus === "all" || d.status === filterStatus
    return matchSearch && matchType && matchStatus
  })

  const activeFilters = (filterType !== "all" ? 1 : 0) + (filterStatus !== "all" ? 1 : 0)

  const handleExportCSV = async () => {
    try {
      const resp = await fetch("/api/devices/export-csv")
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "netguard_equipements.csv"
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast({ title: "Erreur", description: "Export CSV impossible.", variant: "destructive" })
    }
  }

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const resp = await fetch("/api/devices/import-csv", { method: "POST", body: formData })
      const data = await resp.json()
      if (resp.ok) {
        queryClient.invalidateQueries({ queryKey: ["/api/devices"] })
        toast({
          title: `${data.created} équipement(s) importé(s)`,
          description: data.errors.length > 0
            ? `${data.errors.length} ligne(s) ignorée(s).`
            : "Import CSV réussi.",
        })
      } else {
        toast({ title: "Erreur", description: data.error || "Import échoué.", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur réseau", description: "Impossible de contacter le serveur.", variant: "destructive" })
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <AppLayout>
      {/* En-tête */}
      <div className="mb-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-display font-bold text-foreground">Inventaire des Équipements</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} équipement(s) affiché(s) sur {devices?.length ?? 0} enregistré(s)
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Export CSV */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="border-primary/40 text-primary hover:bg-primary/10"
            title="Exporter l'inventaire au format CSV"
          >
            <Download className="w-4 h-4 mr-1.5" />
            Exporter CSV
          </Button>
                    {/* Import CSV */}
          {isAdmin && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={importing}
                className="border-accent/40 text-accent hover:bg-accent/10"
                title="Importer des équipements depuis un CSV"
              >
                <Upload className="w-4 h-4 mr-1.5" />
                {importing ? "Import..." : "Importer CSV"}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleImportCSV}
              />
            </>
          )}


                     {/* Ajouter */}
          {isAdmin && (
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_rgba(0,240,255,0.2)]">
                  <Plus className="w-4 h-4 mr-2" /> Ajouter
                </Button>
              </DialogTrigger>
              <DialogContent className="glass-panel sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle className="font-display text-xl">Enregistrer un nouvel équipement</DialogTitle>
                </DialogHeader>
                <DeviceForm onSuccess={() => setIsCreateOpen(false)} />
              </DialogContent>
            </Dialog>
                    )}
        </div>
      </div>

      {/* Barre de filtres */}

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, IP, fabricant..."
            className="pl-9 bg-card border-border/50 focus-visible:ring-primary/50"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-44 bg-card border-border/50">
            <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            <SelectItem value="switch">Commutateur</SelectItem>
            <SelectItem value="firewall">Pare-feu</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44 bg-card border-border/50">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="online">En ligne</SelectItem>
            <SelectItem value="offline">Hors ligne</SelectItem>
            <SelectItem value="unknown">Inconnu</SelectItem>
          </SelectContent>
        </Select>

        {activeFilters > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setFilterType("all"); setFilterStatus("all") }}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5 mr-1.5" />
            Réinitialiser ({activeFilters})
          </Button>
        )}
      </div>

      {/* Hint CSV format */}
      <div className="mb-4 p-3 rounded-lg bg-muted/20 border border-border/30 text-xs text-muted-foreground flex items-start gap-2">
        <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
        <span>
          <strong className="text-foreground">Format CSV d'import</strong> (séparateur <code className="bg-muted px-1 rounded">;</code>) :{" "}
          <code className="bg-muted px-1 rounded">nom;type;ip;fabricant;modele;os;statut;ssh_user;ssh_password;ssh_port</code>
        </span>
      </div>

      {/* Tableau */}
      <Card className="glass-panel border-border/50">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/30 border-b border-border/50">
                <tr>
                  <th className="px-6 py-4">Équipement</th>
                  <th className="px-6 py-4">Adresse IP</th>
                  <th className="px-6 py-4">Matériel / OS</th>
                  <th className="px-6 py-4">Statut</th>
                  <th className="px-6 py-4">SSH</th>
                  <th className="px-6 py-4">Dernier audit</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      Chargement de l'inventaire...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-16 text-center">
                      <div className="flex flex-col items-center">
                        <Server className="w-12 h-12 text-muted-foreground mb-4 opacity-30" />
                        <p className="text-lg font-medium text-foreground">Aucun équipement trouvé</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {search || activeFilters > 0
                            ? "Modifiez vos filtres ou ajoutez un équipement."
                            : "Ajoutez un équipement pour commencer."}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((device) => (
                    <tr key={device.id} className="hover:bg-muted/20 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center border border-border">
                            {device.type === "firewall" ? (
                              <Shield className="w-5 h-5 text-accent" />
                            ) : (
                              <Server className="w-5 h-5 text-primary" />
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">{device.name}</p>
                            <p className="text-xs text-muted-foreground uppercase">
                              {TYPE_FR[device.type] || device.type}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-muted-foreground">{device.ipAddress}</td>
                      <td className="px-6 py-4">
                        <p className="text-foreground">
                          {device.vendor} {device.model}
                        </p>
                        <p className="text-xs text-muted-foreground">OS: {device.osVersion}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusColor(
                            device.status
                          )}`}
                        >
                          {STATUS_FR[device.status] || device.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {device.sshUsername ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-primary/40 text-primary font-mono"
                          >
                            <Wifi className="w-2.5 h-2.5 mr-1" />
                            {device.sshUsername}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {device.lastAuditAt ? formatDate(device.lastAuditAt) : "Jamais"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <DeviceActions
                          deviceId={device.id}
                          device={device}
                          onEdit={() => setEditDevice(device)}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog édition */}
      {editDevice && (
        <Dialog open={!!editDevice} onOpenChange={() => setEditDevice(null)}>
          <DialogContent className="glass-panel sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="font-display text-xl">
                Modifier — {editDevice.name}
              </DialogTitle>
            </DialogHeader>
            <DeviceForm
              onSuccess={() => setEditDevice(null)}
              initialData={editDevice}
              deviceId={editDevice.id}
            />
          </DialogContent>
        </Dialog>
      )}
    </AppLayout>
  )
}

function DeviceActions({
  deviceId,
  device,
  onEdit,
}: {
  deviceId: number
  device: any
  onEdit: () => void
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [testing, setTesting] = useState(false)
  const { isAdmin } = useAuth()

  const deleteMutation = useDeleteDevice({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/devices"] })
        toast({
          title: "Équipement supprimé",
          description: "L'équipement a été retiré de l'inventaire.",
        })
      },
      onError: () => {
        toast({
          title: "Erreur",
          description: "Impossible de supprimer l'équipement.",
          variant: "destructive",
        })
      },
    },
  })

  const testConnection = async () => {
    setTesting(true)
    try {
      const resp = await fetch(`/api/devices/${deviceId}/test-connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("netguard_token") || ""}` },
        body: JSON.stringify({
          username: device.sshUsername,
          password: device.sshPassword,
          port: device.sshPort || 22,
        }),
      })
      const data = await resp.json()
      if (resp.ok && data.success) {
        toast({ title: "✅ Connexion SSH réussie", description: data.message })
      } else {
        toast({
          title: "❌ Connexion échouée",
          description: data.error || "Connexion impossible.",
          variant: "destructive",
        })
      }
    } catch {
      toast({
        title: "Erreur réseau",
        description: "Impossible de joindre le serveur.",
        variant: "destructive",
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 hover:text-primary"
        title="Tester la connexion SSH"
        onClick={testConnection}
        disabled={testing || !device.sshUsername}
      >
        <Wifi className={`w-4 h-4 ${testing ? "animate-pulse" : ""}`} />
      </Button>
      {isAdmin && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:text-primary"
            title="Modifier"
            onClick={onEdit}
          >
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:text-destructive hover:bg-destructive/10"
            onClick={() => {
              if (confirm("Êtes-vous sûr de vouloir supprimer cet équipement ?")) {
                deleteMutation.mutate({ id: deviceId })
              }
            }}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </>
      )}
    </div>
  )
}


function DeviceForm({
  onSuccess,
  initialData,
  deviceId,
}: {
  onSuccess: () => void
  initialData?: any
  deviceId?: number
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const isEdit = !!deviceId

  const createMutation = useCreateDevice({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/devices"] })
        toast({
          title: "Équipement créé",
          description: "Équipement ajouté avec succès à l'inventaire.",
        })
        onSuccess()
      },
      onError: (err: any) => {
        toast({
          title: "Erreur",
          description: err.message || "Impossible de créer l'équipement.",
          variant: "destructive",
        })
      },
    },
  })

  const updateMutation = useUpdateDevice({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/devices"] })
        toast({ title: "Équipement mis à jour", description: "Modifications enregistrées." })
        onSuccess()
      },
      onError: (err: any) => {
        toast({
          title: "Erreur",
          description: err.message || "Impossible de mettre à jour l'équipement.",
          variant: "destructive",
        })
      },
    },
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const sshPort = formData.get("sshPort") as string
    const enablePassword = formData.get("enablePassword") as string
    const payload = {
      name: formData.get("name") as string,
      type: formData.get("type") as any,
      ipAddress: formData.get("ipAddress") as string,
      vendor: formData.get("vendor") as string,
      model: formData.get("model") as string,
      osVersion: formData.get("osVersion") as string,
      status: formData.get("status") as any,
      sshUsername: (formData.get("sshUsername") as string) || undefined,
      sshPassword: (formData.get("sshPassword") as string) || undefined,
      sshPort: sshPort ? parseInt(sshPort) : 22,
      enablePassword: enablePassword || undefined,
    }

    if (isEdit && deviceId) {
      updateMutation.mutate({ id: deviceId, data: payload })
    } else {
      createMutation.mutate({ data: payload })
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Nom de l'équipement</Label>
          <Input
            id="name"
            name="name"
            required
            defaultValue={initialData?.name}
            placeholder="ex. CORE-SW-01"
            className="bg-background"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ipAddress">Adresse IP</Label>
          <Input
            id="ipAddress"
            name="ipAddress"
            required
            defaultValue={initialData?.ipAddress}
            placeholder="192.168.1.1"
            className="bg-background font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="type">Type d'équipement</Label>
          <Select name="type" defaultValue={initialData?.type || "switch"} required>
            <SelectTrigger className="bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="switch">Commutateur (Switch)</SelectItem>
              <SelectItem value="firewall">Pare-feu (Firewall)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="vendor">Fabricant</Label>
          <Select name="vendor" defaultValue={initialData?.vendor || "Cisco"} required>
            <SelectTrigger className="bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Cisco">Cisco</SelectItem>
              <SelectItem value="Fortinet">Fortinet (FortiGate)</SelectItem>
              <SelectItem value="Juniper">Juniper</SelectItem>
              <SelectItem value="Palo Alto">Palo Alto</SelectItem>
              <SelectItem value="Autre">Autre</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="model">Modèle</Label>
          <Input
            id="model"
            name="model"
            required
            defaultValue={initialData?.model}
            placeholder="ex. Catalyst 9300 / FortiGate 60F"
            className="bg-background"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="osVersion">Version OS</Label>
          <Input
            id="osVersion"
            name="osVersion"
            required
            defaultValue={initialData?.osVersion}
            placeholder="ex. IOS XE 17.3 / FortiOS 7.4"
            className="bg-background"
          />
        </div>
        <div className="space-y-2 col-span-2">
          <Label htmlFor="status">Statut</Label>
          <Select name="status" defaultValue={initialData?.status || "online"} required>
            <SelectTrigger className="bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="online">En ligne</SelectItem>
              <SelectItem value="offline">Hors ligne</SelectItem>
              <SelectItem value="unknown">Inconnu</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border-t border-border/50 pt-4">
        <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-3 flex items-center gap-2">
          <Wifi className="w-3.5 h-3.5" /> Connexion SSH (optionnel)
        </p>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="sshUsername">Utilisateur SSH</Label>
            <Input
              id="sshUsername"
              name="sshUsername"
              defaultValue={initialData?.sshUsername}
              placeholder="admin"
              className="bg-background"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sshPassword">Mot de passe SSH</Label>
            <Input
              id="sshPassword"
              name="sshPassword"
              type="password"
              defaultValue={initialData?.sshPassword}
              placeholder="••••••••"
              className="bg-background"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sshPort">Port SSH</Label>
            <Input
              id="sshPort"
              name="sshPort"
              type="number"
              defaultValue={initialData?.sshPort || 22}
              placeholder="22"
              className="bg-background"
            />
          </div>
        </div>
        <div className="space-y-2 mt-2">
          <Label htmlFor="enablePassword" className="flex items-center gap-2">
            Mot de passe Enable
            <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              Cisco uniquement
            </span>
          </Label>
          <Input
            id="enablePassword"
            name="enablePassword"
            type="password"
            defaultValue={initialData?.enablePassword}
            placeholder="Mot de passe mode privilégié (#)"
            className="bg-background"
          />
        </div>
      </div>

      <div className="pt-4 flex justify-end gap-2 border-t border-border/50">
        <Button type="button" variant="outline" onClick={onSuccess}>
          Annuler
        </Button>
        <Button
          type="submit"
          disabled={isPending}
          className="bg-primary text-primary-foreground"
        >
          {isPending ? "Enregistrement..." : isEdit ? "Mettre à jour" : "Enregistrer"}
        </Button>
      </div>
    </form>
  )
}
