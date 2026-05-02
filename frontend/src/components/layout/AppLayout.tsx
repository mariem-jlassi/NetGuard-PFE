import { ReactNode } from "react"
import { useLocation } from "wouter"
import { Sidebar } from "./Sidebar"
import { motion } from "framer-motion"
import { ChevronRight, Wifi, WifiOff } from "lucide-react"
import { useGetDashboardStats } from "@workspace/api-client-react"

const BREADCRUMBS: Record<string, string> = {
  "/":            "Tableau de bord",
  "/devices":     "Équipements",
  "/topology":    "Topologie Réseau",
  "/audits":      "Lancer un Audit",
  "/anomalies":   "Gestion des Anomalies",
  "/results":     "Résultats",
  "/scheduler":   "Planification des Scans",
  "/terminal":    "Configuration & Automatisation",
  "/users":       "Utilisateurs",
  "/profile":     "Profil",
}

function Topbar() {
  const [location] = useLocation()
  const { data: stats } = useGetDashboardStats()
  const pageName = BREADCRUMBS[location] || "..."
  const isOnline = stats !== undefined

  return (
    <header className="h-12 px-6 flex items-center justify-between border-b border-border/30 bg-background/50 backdrop-blur-sm sticky top-0 z-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12px]">
        <span className="text-muted-foreground/50 font-medium uppercase tracking-wider text-[10px]">NETGUARD</span>
        <ChevronRight className="w-3 h-3 text-muted-foreground/30" />
        <span className="text-foreground font-semibold">{pageName}</span>
      </nav>

      {/* Status */}
      <div className="flex items-center gap-2">
        {isOnline ? (
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
            </span>
            <Wifi className="w-3 h-3" />
            <span className="uppercase tracking-wider text-[10px]">Système en ligne</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] text-red-400 font-medium">
            <WifiOff className="w-3 h-3" />
            <span className="uppercase tracking-wider text-[10px]">Hors ligne</span>
          </div>
        )}
      </div>
    </header>
  )
}

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="p-6 max-w-[1400px] mx-auto w-full"
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  )
}
