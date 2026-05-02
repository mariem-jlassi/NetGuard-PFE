import { Link, useLocation } from "wouter"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/use-auth"
import {
  LayoutDashboard, Server, Network,
  ShieldCheck, AlertTriangle, CalendarDays,
  SlidersHorizontal, Users, Shield, ListChecks, Activity, LogOut
} from "lucide-react"

const NAV_GROUPS = [
  {
    label: "Principal",
    items: [
      { href: "/",         label: "Tableau de bord",     icon: LayoutDashboard },
      { href: "/devices",  label: "Équipements",          icon: Server },
      { href: "/topology", label: "Topologie Réseau",     icon: Network },
    ],
  },
  {
    label: "Sécurité",
    items: [
      { href: "/audits",     label: "Lancer un Audit",         icon: ShieldCheck },
      { href: "/anomalies",  label: "Gestion des Anomalies",   icon: AlertTriangle },
      { href: "/policies",   label: "Politiques de Sécurité",  icon: ListChecks, adminOnly: true },
      { href: "/scheduler",  label: "Planification des Scans", icon: CalendarDays, adminOnly: true },
    ],
  },
    {
    label: "Système",
    adminOnly: true,
    items: [
      { href: "/terminal", label: "Configuration & Automatisation", icon: SlidersHorizontal, adminOnly: true },
    ],
  },
]

const ADMIN_ITEMS = [{ href: "/users", label: "Utilisateurs", icon: Users }]

export function Sidebar() {
  const [location] = useLocation()
  const { logout, username, displayName, role, isAdmin } = useAuth()

  const handleLogout = async () => {
    await logout()
    window.location.reload()
  }

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href)

  const NavLink = ({
    href,
    label,
    icon: Icon,
  }: {
    href: string
    label: string
    icon: any
  }) => {
    const active = isActive(href)
    return (
      <Link
        href={href}
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-md transition-all duration-150 text-[13px] relative group",
          active
            ? "bg-primary/10 text-primary font-semibold"
            : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground font-medium"
        )}
      >
        {active && (
          <span className="absolute left-0 inset-y-1.5 w-[3px] bg-primary rounded-r-full" />
        )}
        <Icon
          className={cn(
            "w-[15px] h-[15px] shrink-0",
            active
              ? "text-primary"
              : "text-muted-foreground/60 group-hover:text-foreground"
          )}
          strokeWidth={1.8}
        />
        <span className="truncate leading-snug">{label}</span>
      </Link>
    )
  }

  const initials = (displayName || username || "A")[0].toUpperCase()

  return (
    <aside className="w-[230px] shrink-0 h-screen sticky top-0 flex flex-col border-r border-border/30 bg-[hsl(240,12%,4%)]">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-[18px] border-b border-border/30">
        <div className="w-[30px] h-[30px] rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(0,240,255,0.25)]">
          <Activity className="w-[14px] h-[14px] text-black" strokeWidth={2.5} />
        </div>
        <div>
          <p className="font-display font-bold text-[13px] leading-none text-foreground">
            Net<span className="text-primary">Guard</span>
          </p>
          <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest mt-0.5">
            Zero-Touch Security
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 overflow-y-auto space-y-5">
        {NAV_GROUPS.filter(group => !(group as any).adminOnly || isAdmin).map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-1.5 text-[9px] uppercase tracking-[0.1em] text-muted-foreground/40 font-bold select-none">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.filter(item => !(item as any).adminOnly || isAdmin).map((item) => (
                <NavLink key={item.href} {...item} />
              ))}
            </div>
          </div>
        ))}

        {isAdmin && (
          <div>
            <p className="px-3 mb-1.5 text-[9px] uppercase tracking-[0.1em] text-muted-foreground/40 font-bold select-none">
              Administration
            </p>
            <div className="space-y-0.5">
              {ADMIN_ITEMS.map((item) => (
                <NavLink key={item.href} {...item} />
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* User */}
      <div className="border-t border-border/30 p-2 space-y-0.5">
        <Link
          href="/profile"
          className={cn(
            "flex items-center gap-2.5 px-3 py-2 rounded-md transition-all text-[13px] w-full",
            isActive("/profile")
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
          )}
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary/20 to-accent/10 border border-primary/20 flex items-center justify-center shrink-0">
            <span className="text-[11px] font-bold text-primary">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold truncate text-foreground leading-none mb-0.5">
              {displayName || username}
            </p>
            <p className="text-[10px] text-muted-foreground leading-none">
              {role === "admin" ? "Administrateur" : "Opérateur"}
            </p>
          </div>
        </Link>

        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 px-3 py-2 w-full rounded-md transition-all text-[13px] text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
        >
          <LogOut className="w-[15px] h-[15px] shrink-0" strokeWidth={1.8} />
          Déconnexion
        </button>
      </div>
    </aside>
  )
}
