import { useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { Lock, User, Shield, Eye, EyeOff, Activity, Brain, Zap, BadgeCheck } from "lucide-react"

interface LoginProps {
  onLogin: () => void
}

const FEATURES = [
  {
    icon: Brain,
    title: "Analyse NLP Avancée",
    desc: "Moteur de parsing intelligent pour configurations multi-constructeurs (Cisco, Fortinet, Juniper).",
  },
  {
    icon: Zap,
    title: "Remédiation Zero-Touch",
    desc: "Déploiement automatisé des correctifs de sécurité sans intervention manuelle (SSH/Paramiko).",
  },
  {
    icon: BadgeCheck,
    title: "Conformité Standards",
    desc: "Vérification en temps réel basée sur les référentiels mondiaux (CIS Benchmarks & NIST).",
  },
]

export default function Login({ onLogin }: LoginProps) {
  const { login, isLoading, error } = useAuth()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPass, setShowPass] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = await login(username, password)
    if (ok) onLogin()
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* ── Panneau gauche : branding ── */}
      <div className="hidden lg:flex lg:w-[52%] flex-col justify-between p-12 relative overflow-hidden border-r border-border/30">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-background to-accent/6 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-2/3 h-1/2 bg-primary/4 blur-[100px] rounded-full pointer-events-none" />

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg">
            <Activity className="w-[18px] h-[18px] text-black" />
          </div>
          <div>
            <span className="text-[15px] font-display font-bold text-foreground">
              Net<span className="text-primary">Guard</span>
            </span>
            <span className="ml-2 text-[9px] uppercase tracking-[0.15em] text-muted-foreground/60 font-semibold">
              v2.1.0 · PFE
            </span>
          </div>
        </div>

        {/* Hero text */}
        <div className="relative space-y-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-semibold mb-3">
              Système de Sécurité Réseau Autonome
            </p>
            <h2 className="text-4xl font-display font-bold text-foreground leading-tight">
              Détection &amp; Correction<br />
              d'Anomalies{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
                Zero-Touch
              </span>
            </h2>
            <p className="text-muted-foreground text-[15px] mt-4 leading-relaxed max-w-md">
              Plateforme d'audit automatisé des configurations réseau — Cisco IOS,
              FortiGate et Juniper — avec remédiation SSH immédiate.
            </p>
          </div>

          {/* Features list */}
          <div className="space-y-4">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-4 h-4 text-primary" strokeWidth={1.8} />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-foreground">{title}</p>
                  <p className="text-[12px] text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground/50">
            NetGuard PFE — Génie Informatique &nbsp;·&nbsp; Sécurité des Réseaux
          </p>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
            </span>
            <span className="text-[10px] text-emerald-400 font-medium">Système prêt pour l'audit</span>
          </div>
        </div>
      </div>

      {/* ── Panneau droit : formulaire ── */}
      <div className="flex-1 flex items-center justify-center px-8 py-12">
        <div className="w-full max-w-[380px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Activity className="w-4 h-4 text-black" />
            </div>
            <span className="text-[15px] font-display font-bold">
              Net<span className="text-primary">Guard</span>
            </span>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-[22px] font-display font-bold text-foreground">
              Connexion
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Accédez au centre de contrôle de l'infrastructure réseau intelligente.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[12px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                Identifiant
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-muted-foreground/60" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  required
                  autoComplete="username"
                  className="w-full pl-9 pr-4 py-2.5 bg-card/80 border border-border/60 rounded-lg text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                Mot de passe
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-muted-foreground/60" />
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full pl-9 pr-10 py-2.5 bg-card/80 border border-border/60 rounded-lg text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-500/8 border border-red-500/20 rounded-lg px-3 py-2.5 text-[12px] text-red-400">
                <Shield className="w-3.5 h-3.5 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !username || !password}
              className="w-full py-2.5 mt-2 bg-primary text-primary-foreground text-[13px] font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-primary/20 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                  Vérification...
                </span>
              ) : (
                <>
                  <Shield className="w-[14px] h-[14px]" />
                  Accéder au Dashboard
                </>
              )}
            </button>
          </form>

          {/* Hint */}
          <div className="mt-6 p-3 rounded-lg border border-border/40 bg-card/40">
            <p className="text-[11px] text-muted-foreground/70 font-mono">
              <span className="text-muted-foreground font-semibold">admin</span>
              {" / "}
              <span className="text-muted-foreground font-semibold">netguard123</span>
              <span className="ml-2 text-muted-foreground/40">— compte démonstration</span>
            </p>
          </div>

          <p className="text-center text-[11px] text-muted-foreground/40 mt-8">
            NetGuard v2.1.0 · Powered by Python Flask &amp; React · PFE 2025–2026
          </p>
        </div>
      </div>
    </div>
  )
}
