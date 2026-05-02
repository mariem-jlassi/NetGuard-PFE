import { useState } from "react"
import { AppLayout } from "@/components/layout/AppLayout"
import { useAuth } from "@/hooks/use-auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Shield, User, KeyRound, CheckCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

const ROLE_LABEL: Record<string, string> = { admin: "Administrateur", operator: "Opérateur" }
const ROLE_COLOR: Record<string, string> = {
  admin: "text-amber-400 bg-amber-400/10 border-amber-400/30",
  operator: "text-cyan-400 bg-cyan-400/10 border-cyan-400/30",
}

export default function Profile() {
  const { username, role, displayName, token } = useAuth()
  const { toast } = useToast()

  const [currentPwd, setCurrentPwd] = useState("")
  const [newPwd,     setNewPwd]     = useState("")
  const [confirmPwd, setConfirmPwd] = useState("")
  const [loading,    setLoading]    = useState(false)
  const [success,    setSuccess]    = useState(false)

  const handleChangePassword = async () => {
    if (!currentPwd || !newPwd || !confirmPwd) {
      toast({ title: "Champs requis", description: "Remplissez tous les champs.", variant: "destructive" })
      return
    }
    if (newPwd !== confirmPwd) {
      toast({ title: "Erreur", description: "Les nouveaux mots de passe ne correspondent pas.", variant: "destructive" })
      return
    }
    if (newPwd.length < 6) {
      toast({ title: "Erreur", description: "Le mot de passe doit contenir au moins 6 caractères.", variant: "destructive" })
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: "Erreur", description: data.error, variant: "destructive" })
        return
      }
      setSuccess(true)
      setCurrentPwd("")
      setNewPwd("")
      setConfirmPwd("")
      toast({ title: "✅ Mot de passe modifié", description: "Votre mot de passe a été mis à jour." })
      setTimeout(() => setSuccess(false), 3000)
    } catch {
      toast({ title: "Erreur réseau", description: "Impossible de contacter le serveur.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-[22px] font-display font-bold text-foreground">Mon Profil</h1>
        <p className="text-muted-foreground mt-1">Gérez vos informations et votre mot de passe</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-4xl">
        {/* Carte profil */}
        <Card className="glass-panel border-border/50">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="w-4 h-4 text-primary" /> Informations du compte
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 flex flex-col items-center text-center gap-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${role === "admin" ? "bg-amber-500/20" : "bg-cyan-500/20"}`}>
              {role === "admin"
                ? <Shield className="w-8 h-8 text-amber-400" />
                : <User className="w-8 h-8 text-cyan-400" />}
            </div>
            <div>
              <p className="font-bold text-lg">{displayName || username}</p>
              <p className="text-sm text-muted-foreground font-mono">@{username}</p>
            </div>
            {role && (
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${ROLE_COLOR[role]}`}>
                {ROLE_LABEL[role] || role}
              </span>
            )}
          </CardContent>
        </Card>

        {/* Changement de mot de passe */}
        <div className="lg:col-span-2">
          <Card className="glass-panel border-primary/20">
            <CardHeader className="border-b border-border/50 bg-muted/20">
              <CardTitle className="text-sm flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-primary" /> Changer le mot de passe
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-1.5">
                <Label>Mot de passe actuel</Label>
                <Input
                  type="password"
                  value={currentPwd}
                  onChange={e => setCurrentPwd(e.target.value)}
                  placeholder="Votre mot de passe actuel"
                  className="bg-background"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Nouveau mot de passe</Label>
                <Input
                  type="password"
                  value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  placeholder="Minimum 6 caractères"
                  className="bg-background"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Confirmer le nouveau mot de passe</Label>
                <Input
                  type="password"
                  value={confirmPwd}
                  onChange={e => setConfirmPwd(e.target.value)}
                  placeholder="Répétez le nouveau mot de passe"
                  className="bg-background"
                />
              </div>
              <Button
                className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90 shadow-lg shadow-primary/25"
                onClick={handleChangePassword}
                disabled={loading}
              >
                {success
                  ? <><CheckCircle className="w-4 h-4 mr-2" /> Mot de passe modifié</>
                  : loading ? "Enregistrement..." : <><KeyRound className="w-4 h-4 mr-2" /> Changer le mot de passe</>}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  )
}
