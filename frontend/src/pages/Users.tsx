import { useState } from "react"
import { AppLayout } from "@/components/layout/AppLayout"
import { useAuth } from "@/hooks/use-auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
} from "@/components/ui/dialog"
import {
  Users as UsersIcon, Plus, Pencil, Trash2, Shield, User, CheckCircle, XCircle, KeyRound
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

interface UserRecord {
  id: number
  username: string
  role: string
  displayName: string | null
  active: boolean
  createdAt: string
}

function authHeader() {
  const t = localStorage.getItem("netguard_token")
  return t ? { Authorization: `Bearer ${t}` } : {}
}

async function fetchUsers(): Promise<UserRecord[]> {
  const res = await fetch("/api/users", { headers: authHeader() })
  if (!res.ok) throw new Error("Accès refusé")
  return res.json()
}

const ROLE_LABEL: Record<string, string> = { admin: "Administrateur", operator: "Opérateur" }
const ROLE_COLOR: Record<string, string> = {
  admin: "text-amber-400 bg-amber-400/10 border-amber-400/30",
  operator: "text-cyan-400 bg-cyan-400/10 border-cyan-400/30",
}

export default function Users() {
  const { isAdmin } = useAuth()
  const { toast } = useToast()
  const qc = useQueryClient()

  const { data: users = [], isLoading } = useQuery({ queryKey: ["/api/users"], queryFn: fetchUsers })

  const [createOpen, setCreateOpen] = useState(false)
  const [editUser, setEditUser] = useState<UserRecord | null>(null)
  const [form, setForm] = useState({ username: "", password: "", role: "operator", displayName: "" })
  const [editForm, setEditForm] = useState({ displayName: "", role: "operator", password: "", active: true })

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ username: form.username, password: form.password, role: form.role, displayName: form.displayName || undefined }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/users"] })
      setCreateOpen(false)
      setForm({ username: "", password: "", role: "operator", displayName: "" })
      toast({ title: "Utilisateur créé avec succès" })
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  })

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editUser) return
      const body: any = { displayName: editForm.displayName, role: editForm.role, active: editForm.active }
      if (editForm.password) body.password = editForm.password
      const res = await fetch(`/api/users/${editUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/users"] })
      setEditUser(null)
      toast({ title: "Utilisateur mis à jour" })
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE", headers: authHeader() })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/users"] })
      toast({ title: "Utilisateur supprimé" })
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  })

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Card className="glass-panel border-destructive/30 p-8 text-center">
            <Shield className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold">Accès refusé</h2>
            <p className="text-muted-foreground mt-2">Cette page est réservée aux administrateurs.</p>
          </Card>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-display font-bold text-foreground">Gestion des Utilisateurs</h1>
          <p className="text-muted-foreground mt-1">Créez, modifiez et gérez les accès à NetGuard</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-primary to-accent text-primary-foreground">
              <Plus className="w-4 h-4 mr-2" /> Nouvel utilisateur
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-panel max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="w-4 h-4" /> Créer un utilisateur
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Nom d'utilisateur *</Label>
                  <Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="jdupont" className="bg-background" />
                </div>
                <div className="space-y-1.5">
                  <Label>Mot de passe *</Label>
                  <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min. 6 caractères" className="bg-background" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Nom complet (optionnel)</Label>
                <Input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} placeholder="Jean Dupont" className="bg-background" />
              </div>
              <div className="space-y-1.5">
                <Label>Rôle</Label>
                <div className="grid grid-cols-2 gap-2">
                  {["operator", "admin"].map(r => (
                    <button key={r} onClick={() => setForm(f => ({ ...f, role: r }))}
                      className={`p-3 rounded-lg border text-sm font-medium transition-all ${form.role === r ? "border-primary/50 bg-primary/10 text-primary" : "border-border/30 text-muted-foreground hover:bg-muted/30"}`}>
                      {r === "admin" ? <Shield className="w-4 h-4 mx-auto mb-1 text-amber-400" /> : <User className="w-4 h-4 mx-auto mb-1 text-cyan-400" />}
                      {ROLE_LABEL[r]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button>
              <Button onClick={() => createMutation.mutate()} disabled={!form.username || !form.password || createMutation.isPending} className="bg-primary text-primary-foreground">
                {createMutation.isPending ? "Création..." : "Créer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {[1,2,3].map(i => <Card key={i} className="h-40 animate-pulse bg-muted/20 border-border/50" />)}
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {users.map(user => (
            <Card key={user.id} className={`glass-panel border-border/50 ${!user.active ? "opacity-50" : ""}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${user.role === "admin" ? "bg-amber-500/20" : "bg-cyan-500/20"}`}>
                      {user.role === "admin" ? <Shield className="w-5 h-5 text-amber-400" /> : <User className="w-5 h-5 text-cyan-400" />}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{user.displayName || user.username}</p>
                      <p className="text-xs text-muted-foreground font-mono">@{user.username}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${ROLE_COLOR[user.role]}`}>
                    {ROLE_LABEL[user.role]}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {user.active
                    ? <><CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> Compte actif</>
                    : <><XCircle className="w-3.5 h-3.5 text-red-400" /> Compte désactivé</>}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 text-xs"
                    onClick={() => { setEditUser(user); setEditForm({ displayName: user.displayName ?? "", role: user.role, password: "", active: user.active }) }}>
                    <Pencil className="w-3 h-3 mr-1" /> Modifier
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs text-destructive hover:bg-destructive/10 hover:border-destructive/30"
                    onClick={() => { if (confirm(`Supprimer @${user.username} ?`)) deleteMutation.mutate(user.id) }}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialogue de modification */}
      <Dialog open={!!editUser} onOpenChange={open => { if (!open) setEditUser(null) }}>
        <DialogContent className="glass-panel max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4" /> Modifier @{editUser?.username}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nom complet</Label>
              <Input value={editForm.displayName} onChange={e => setEditForm(f => ({ ...f, displayName: e.target.value }))} placeholder="Jean Dupont" className="bg-background" />
            </div>
            <div className="space-y-1.5">
              <Label>Nouveau mot de passe (laisser vide pour ne pas changer)</Label>
              <Input type="password" value={editForm.password} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} placeholder="Min. 6 caractères" className="bg-background" />
            </div>
            <div className="space-y-1.5">
              <Label>Rôle</Label>
              <div className="grid grid-cols-2 gap-2">
                {["operator","admin"].map(r => (
                  <button key={r} onClick={() => setEditForm(f => ({ ...f, role: r }))}
                    className={`p-3 rounded-lg border text-sm font-medium transition-all ${editForm.role === r ? "border-primary/50 bg-primary/10 text-primary" : "border-border/30 text-muted-foreground hover:bg-muted/30"}`}>
                    {r === "admin" ? <Shield className="w-4 h-4 mx-auto mb-1 text-amber-400" /> : <User className="w-4 h-4 mx-auto mb-1 text-cyan-400" />}
                    {ROLE_LABEL[r]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-muted/10">
              <input type="checkbox" id="active-toggle" checked={editForm.active} onChange={e => setEditForm(f => ({ ...f, active: e.target.checked }))} className="w-4 h-4 accent-primary" />
              <Label htmlFor="active-toggle" className="cursor-pointer">Compte actif</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Annuler</Button>
            <Button onClick={() => editMutation.mutate()} disabled={editMutation.isPending} className="bg-primary text-primary-foreground">
              {editMutation.isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}
