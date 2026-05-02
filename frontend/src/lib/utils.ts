import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, parseISO } from "date-fns"
import { fr } from "date-fns/locale"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "N/A"
  try {
    return format(parseISO(dateString), "d MMM yyyy HH:mm", { locale: fr })
  } catch (e) {
    return dateString
  }
}

export function getSeverityColor(severity: string) {
  switch (severity?.toLowerCase()) {
    case 'critical': return 'text-destructive bg-destructive/10 border-destructive/20'
    case 'high': return 'text-orange-500 bg-orange-500/10 border-orange-500/20'
    case 'medium': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20'
    case 'low': return 'text-blue-400 bg-blue-400/10 border-blue-400/20'
    default: return 'text-muted-foreground bg-muted border-border'
  }
}

export function getStatusColor(status: string) {
  switch (status?.toLowerCase()) {
    case 'online':
    case 'completed':
    case 'applied':
    case 'corrected':
      return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
    case 'offline':
    case 'failed':
      return 'text-destructive bg-destructive/10 border-destructive/20'
    case 'running':
    case 'pending':
    case 'open':
      return 'text-primary bg-primary/10 border-primary/20'
    case 'ignored':
      return 'text-muted-foreground bg-muted border-border'
    default: return 'text-muted-foreground bg-muted border-border'
  }
}

export const ANOMALY_TYPE_FR: Record<string, string> = {
  "Insecure Protocol": "Protocole non sécurisé",
  "Weak Authentication": "Authentification faible",
  "Missing Security Banner": "Bannière de sécurité manquante",
  "Permissive ACL Rule": "Règle ACL permissive",
  "VLAN Misconfiguration": "Mauvaise configuration VLAN",
  "Insecure HTTP Service": "Service HTTP non sécurisé",
  "Weak SNMP Community String": "Communauté SNMP faible",
  "Missing Logging Configuration": "Journalisation manquante",
  "Minor Configuration Gap": "Écart de configuration mineur",
  "stp_misconfiguration":     "Mauvaise configuration STP",
  "stp_no_rapid_pvst":        "Rapid-PVST+ non activé",
  "stp_no_bpduguard":         "BPDU Guard non activé",
}

export function translateAnomalyType(type: string): string {
  return ANOMALY_TYPE_FR[type] || type
}
