// ============================================================
//  Topology.tsx — Page Topologie Réseau
//  Règle : 1 lien maximum par port (top/bottom/left/right)
//  Couleur : CDP=bleu | LLDP=vert | ARP=orange
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react"
import { AppLayout } from "@/components/layout/AppLayout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  ReactFlow, Background, Controls,
  useNodesState, useEdgesState,
  type Node, type Edge,
  Position, Handle, MarkerType, BackgroundVariant,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import {
  Network, RefreshCw, Wifi, Shield, Server, AlertCircle,
  CheckCircle2, XCircle, ArrowRight, Cable, Info,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"


// ════════════════════════════════════════════════════════════
//  TYPES
// ════════════════════════════════════════════════════════════

interface Neighbor {
  deviceId:        string
  localInterface:  string
  remoteInterface: string
  platform:        string
  ipAddress:       string
  capabilities?:   string
}

interface TopoNode {
  id:             string
  name:           string
  type:           string
  vendor:         string
  ipAddress:      string
  status:         string
  hasCredentials: boolean
  neighbors:      Neighbor[]
  isExternal?:    boolean
}

interface SSHResult {
  deviceId:       number
  deviceName:     string
  ipAddress:      string
  success:        boolean
  error?:         string
  neighbors:      Neighbor[]
  neighborsFound: number
  rawOutput?:     string
}

interface DeviceNodeData {
  label:          string
  type:           string
  vendor?:        string
  ipAddress?:     string
  hasCredentials: boolean
  neighbors?:     Neighbor[]
  isSelected?:    boolean
  isExternal?:    boolean
}


// ════════════════════════════════════════════════════════════
//  COULEURS PAR PROTOCOLE
// ════════════════════════════════════════════════════════════

const PROTO_COLOR: Record<string, string> = {
  CDP:              "#06b6d4",
  LLDP:             "#22c55e",
  "FortiGate-LLDP": "#22c55e",
  ARP:              "#f59e0b",
}

function getProtoColor(protocol?: string): string {
  return PROTO_COLOR[protocol ?? "CDP"] ?? "#06b6d4"
}


// ════════════════════════════════════════════════════════════
//  BADGE PROTOCOLE
// ════════════════════════════════════════════════════════════

function ProtoBadge({ capabilities }: { capabilities?: string }) {
  const proto = capabilities || "CDP"
  const color = getProtoColor(proto)
  return (
    <span style={{
      fontSize: 9, padding: "1px 6px", borderRadius: 8,
      background: `${color}22`, color,
      border: `1px solid ${color}44`,
    }}>
      {proto}
    </span>
  )
}


// ════════════════════════════════════════════════════════════
//  NŒUD RÉSEAU
//
//  8 handles invisibles — 4 source + 4 target.
//  Un seul lien autorisé par port (enforced dans buildEdges).
//
//  Ports source : top-s | bottom-s | left-s | right-s
//  Ports target : top-t | bottom-t | left-t | right-t
// ════════════════════════════════════════════════════════════

const HANDLE_HIDDEN = { opacity: 0, pointerEvents: "none" as const }

function DeviceNode({ data }: { data: DeviceNodeData }) {
  const isFirewall = data.type === "firewall"
  const isSwitch   = data.type === "switch"
  const nbCount    = data.neighbors?.length ?? 0

  const border =
    data.isSelected  ? "border-white/80 shadow-[0_0_20px_rgba(255,255,255,0.3)]"
    : isFirewall     ? "border-orange-500/50 hover:border-orange-400"
    : isSwitch       ? "border-cyan-500/50 hover:border-cyan-400"
                     : "border-gray-500/40 hover:border-gray-400"

  const bg =
    isFirewall ? "from-orange-500/15 to-orange-900/10"
    : isSwitch ? "from-cyan-500/15 to-cyan-900/10"
               : "from-gray-500/10 to-gray-900/10"

  const Icon      = isFirewall ? Shield : isSwitch ? Server : AlertCircle
  const iconColor = isFirewall ? "text-orange-400" : isSwitch ? "text-cyan-400" : "text-gray-400"
  const iconBg    = isFirewall ? "bg-orange-500/20" : isSwitch ? "bg-cyan-500/20" : "bg-gray-500/20"

  return (
    <div className={`relative px-4 py-3 rounded-xl border-2 bg-gradient-to-br backdrop-blur-sm
      shadow-lg min-w-[170px] text-center cursor-pointer select-none transition-all duration-200
      ${bg} ${border}`}
    >
      {/* ── 4 ports SOURCE (départ) ── */}
      <Handle type="source" position={Position.Top}    id="top-s"    style={HANDLE_HIDDEN} />
      <Handle type="source" position={Position.Bottom} id="bottom-s" style={HANDLE_HIDDEN} />
      <Handle type="source" position={Position.Left}   id="left-s"   style={HANDLE_HIDDEN} />
      <Handle type="source" position={Position.Right}  id="right-s"  style={HANDLE_HIDDEN} />

      {/* ── 4 ports TARGET (arrivée) ── */}
      <Handle type="target" position={Position.Top}    id="top-t"    style={HANDLE_HIDDEN} />
      <Handle type="target" position={Position.Bottom} id="bottom-t" style={HANDLE_HIDDEN} />
      <Handle type="target" position={Position.Left}   id="left-t"   style={HANDLE_HIDDEN} />
      <Handle type="target" position={Position.Right}  id="right-t"  style={HANDLE_HIDDEN} />

      {nbCount > 0 && (
        <div className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-emerald-500
          flex items-center justify-center text-[9px] font-bold text-white shadow-lg shadow-emerald-500/40">
          {nbCount}
        </div>
      )}

      {data.isExternal && (
        <div className="absolute -top-2.5 -left-2.5 text-[9px] font-bold text-yellow-400
          bg-yellow-500/10 border border-yellow-500/30 px-1.5 py-0.5 rounded-full">
          EXT
        </div>
      )}

      <div className="flex flex-col items-center gap-1.5">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <div>
          <p className="text-[11px] font-bold text-white leading-tight">{data.label}</p>
          <p className="text-[10px] text-gray-400 font-mono">{data.ipAddress}</p>
          <p className="text-[9px] text-gray-500 mt-0.5">{data.vendor?.split(" ")[0]}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${
            data.hasCredentials ? "bg-emerald-400 animate-pulse" : "bg-gray-500"
          }`} />
          <span className="text-[9px] text-gray-400">
            {data.hasCredentials ? "SSH actif" : "SSH inactif"}
          </span>
        </div>
      </div>
    </div>
  )
}

const nodeTypes = { deviceNode: DeviceNode }


// ════════════════════════════════════════════════════════════
//  LAYOUT : FIREWALLS → L1 | SWITCHES → L2 | AUTRES → L3
// ════════════════════════════════════════════════════════════

function buildLayout(rawNodes: TopoNode[]): Node[] {
  const CANVAS_W = 900
  const placed: Node[] = []

  const firewalls = rawNodes.filter(n => n.type === "firewall")
  const switches  = rawNodes.filter(n => n.type === "switch")
  const others    = rawNodes.filter(n => n.type !== "firewall" && n.type !== "switch" && !n.isExternal)
  const externals = rawNodes.filter(n => n.isExternal)

  const hasFW = firewalls.length > 0
  const rowY  = hasFW ? [80, 260, 440, 600] : [80, 260, 440]

  const placeRow = (items: TopoNode[], rowIndex: number) => {
    const gap    = Math.min(240, CANVAS_W / Math.max(items.length, 1))
    const totalW = (items.length - 1) * gap
    items.forEach((n, i) => {
      placed.push({
        id:   n.id,
        type: "deviceNode",
        position: {
          x: CANVAS_W / 2 - totalW / 2 + i * gap,
          y: rowY[rowIndex],
        },
        data: { label: n.name, ...n, isSelected: false },
      })
    })
  }

  if (hasFW) {
    placeRow(firewalls, 0)
    placeRow(switches,  1)
    placeRow(others,    2)
    placeRow(externals, 3)
  } else {
    placeRow(switches,  0)
    placeRow(others,    1)
    placeRow(externals, 2)
  }

  return placed
}


// ════════════════════════════════════════════════════════════
//  DIRECTION PRÉFÉRÉE
// ════════════════════════════════════════════════════════════

function preferredHandles(
  src: { x: number; y: number },
  tgt: { x: number; y: number }
): { sourceHandle: string; targetHandle: string } {
  const dx    = tgt.x - src.x
  const dy    = tgt.y - src.y
  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)

  // ── Surtout vertical ──────────────────────────────────────
  if (absDy > absDx * 1.5) {
    return dy > 0
      ? { sourceHandle: "bottom-s", targetHandle: "top-t" }
      : { sourceHandle: "top-s",    targetHandle: "bottom-t" }
  }

  // ── Surtout horizontal ────────────────────────────────────
  if (absDx > absDy * 1.5) {
    return dx > 0
      ? { sourceHandle: "right-s", targetHandle: "left-t" }
      : { sourceHandle: "left-s",  targetHandle: "right-t" }
  }

  // ── Diagonal : 4 quadrants ────────────────────────────────
  // Bas-droite  (+dx, +dy) → sort par la droite, entre par le haut
  if (dx >= 0 && dy >= 0) return { sourceHandle: "right-s",  targetHandle: "top-t"    }
  // Bas-gauche  (-dx, +dy) → sort par le bas,    entre par le haut
  if (dx <  0 && dy >= 0) return { sourceHandle: "bottom-s", targetHandle: "top-t"    }
  // Haut-droite (+dx, -dy) → sort par la droite, entre par le bas
  if (dx >= 0 && dy <  0) return { sourceHandle: "right-s",  targetHandle: "bottom-t" }
  // Haut-gauche (-dx, -dy) → sort par le haut,   entre par la droite
  return                          { sourceHandle: "top-s",    targetHandle: "right-t"  }
}


// ════════════════════════════════════════════════════════════
//  ARÊTES — RÈGLE : 1 SEUL LIEN PAR PORT
//
//  Chaque nœud a 4 ports source et 4 ports target.
//  On mémorise les ports déjà pris pour chaque nœud.
//  Si le port préféré est occupé → port suivant disponible.
//  Un lien est ignoré si tous les ports sont épuisés.
// ════════════════════════════════════════════════════════════

const ALL_SOURCE = ["bottom-s", "top-s", "right-s", "left-s"] as const
const ALL_TARGET = ["top-t",    "bottom-t", "left-t", "right-t"] as const

function buildEdges(
  rawEdges: any[],
  nodeMap: Map<string, { x: number; y: number }>
): Edge[] {
  // Un Set par nœud → ports déjà assignés
  const usedSrc = new Map<string, Set<string>>()
  const usedTgt = new Map<string, Set<string>>()

  const getSet = (map: Map<string, Set<string>>, id: string): Set<string> => {
    if (!map.has(id)) map.set(id, new Set())
    return map.get(id)!
  }

  // Retourne le premier port libre en partant du port préféré
  const claimPort = (
    preferred: string,
    used: Set<string>,
    pool: readonly string[]
  ): string | null => {
    // Reorder pool : préféré d'abord, puis les autres
    const ordered = [preferred, ...pool.filter(p => p !== preferred)]
    const free    = ordered.find(p => !used.has(p))
    if (!free) return null   // tous les ports sont pris → lien ignoré
    used.add(free)
    return free
  }

  const edges: Edge[] = []

  for (let idx = 0; idx < rawEdges.length; idx++) {
    const e      = rawEdges[idx]
    const color  = getProtoColor(e.protocol)
    const srcPos = nodeMap.get(e.source)
    const tgtPos = nodeMap.get(e.target)

    const pref = srcPos && tgtPos
      ? preferredHandles(srcPos, tgtPos)
      : { sourceHandle: "bottom-s", targetHandle: "top-t" }

    const setSrc = getSet(usedSrc, e.source)
    const setTgt = getSet(usedTgt, e.target)

    const sourceHandle = claimPort(pref.sourceHandle, setSrc, ALL_SOURCE)
    const targetHandle = claimPort(pref.targetHandle, setTgt, ALL_TARGET)

    // Si un des deux nœuds n'a plus de port libre → on skip
    if (!sourceHandle || !targetHandle) continue

    edges.push({
      id:           `edge-${idx}`,
      source:        e.source,
      target:        e.target,
      sourceHandle,
      targetHandle,
      type:         "smoothstep",
      style:        { stroke: color, strokeWidth: 2 },
      markerEnd:    { type: MarkerType.ArrowClosed, color },
      animated:      false,
    })
  }

  return edges
}


// ════════════════════════════════════════════════════════════
//  PAGE PRINCIPALE
// ════════════════════════════════════════════════════════════

export default function Topology() {
  const { toast } = useToast()

  const [loading,      setLoading]      = useState(false)
  const [sshResults,   setSshResults]   = useState<SSHResult[]>([])
  const [stats,        setStats]        = useState({ total: 0, reachable: 0, links: 0 })
  const [selectedNode, setSelectedNode] = useState<TopoNode | null>(null)
  const [showRaw,      setShowRaw]      = useState(false)
  const [topoNodes,    setTopoNodes]    = useState<TopoNode[]>([])

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const STORAGE_KEY = "netguard-topology-positions"
  const saveTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onNodesChangeWithSave = useCallback((changes: any) => {
    onNodesChange(changes)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setNodes(ns => {
        const saved: Record<string, { x: number; y: number }> = {}
        ns.forEach(n => { saved[n.id] = n.position })
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
        return ns
      })
    }, 500)
  }, [onNodesChange, setNodes])

  const fetchTopology = async () => {
    setLoading(true)
    setSelectedNode(null)
    try {
      const resp = await fetch("/api/topology")
      const data = await resp.json()

      if (!resp.ok) {
        toast({ title: "Erreur", description: data.error, variant: "destructive" })
        return
      }

      const layoutNodes = buildLayout(data.nodes ?? [])

      // Restaurer les positions sauvegardées
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
      if (Object.keys(saved).length > 0) {
        layoutNodes.forEach(n => {
          if (saved[n.id]) n.position = saved[n.id]
        })
      }

      const nodeMap = new Map(layoutNodes.map(n => [n.id, n.position]))

      setTopoNodes(data.nodes ?? [])
      setNodes(layoutNodes)
      setEdges(buildEdges(data.edges ?? [], nodeMap))
      setSshResults(data.sshResults ?? [])
      setStats({
        total:     data.totalDevices   ?? 0,
        reachable: data.reachableCount ?? 0,
        links:     data.edges?.length  ?? 0,
      })

      const nbTotal = (data.sshResults ?? [])
        .reduce((s: number, r: SSHResult) => s + r.neighborsFound, 0)

      toast({
        title: data.edges?.length > 0 ? "✅ Topologie découverte" : "Topologie générée",
        description: data.edges?.length > 0
          ? `${data.edges.length} lien(s) CDP/LLDP, ${nbTotal} voisin(s) détecté(s).`
          : `${data.totalDevices} équipement(s). Aucun protocole actif détecté.`,
      })
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleNodeClick = useCallback((_: any, node: Node) => {
    const nd = node.data as unknown as TopoNode
    setSelectedNode(nd)
    setShowRaw(false)
    setNodes(ns => ns.map(n => ({
      ...n,
      data: { ...n.data, isSelected: n.id === node.id },
    })))
  }, [setNodes])

  useEffect(() => { fetchTopology() }, [])

  const selectedResult = sshResults.find(
    r => r.deviceId.toString() === selectedNode?.id
  )

  return (
    <AppLayout>

      {/* En-tête */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-display font-bold text-foreground">
            Topologie Réseau
          </h1>
          <p className="text-muted-foreground mt-1">
            Découverte automatique via CDP / LLDP — 1 lien par port
          </p>
        </div>
        <Button
          onClick={fetchTopology}
          disabled={loading}
          variant="outline"
          className="bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Découverte..." : "Rafraîchir"}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { icon: Server,       color: "text-primary",     label: "Équipements",   value: stats.total,    isText: false },
          { icon: Wifi,         color: "text-emerald-400", label: "SSH configuré", value: stats.reachable, isText: false },
          { icon: Network,      color: "text-accent",      label: "Liens actifs",  value: stats.links,    isText: false },
          { icon: CheckCircle2, color: "text-cyan-400",    label: "Protocoles",    value: "CDP/LLDP", isText: true  },
        ].map(({ icon: Icon, color, label, value, isText }) => (
          <Card key={label} className="glass-panel border-border/50 p-4">
            <div className="flex items-center gap-3">
              <Icon className={`w-5 h-5 ${color}`} />
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                {isText
                  ? <p className={`text-sm font-bold ${color}`}>{value}</p>
                  : <p className="text-xl font-bold">{value}</p>
                }
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Canvas + panneau */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">

        <Card className="glass-panel border-primary/20 lg:col-span-3" style={{ height: 580 }}>
          <CardHeader className="border-b border-border/50 bg-muted/20 py-3 px-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Network className="w-4 h-4 text-primary" />
              Architecture réseau — cliquez sur un équipement pour ses voisins
            </CardTitle>
            <div className="flex items-center gap-5 mt-1.5">
              {[
                { label: "CDP",  color: "#06b6d4" },
                { label: "LLDP", color: "#22c55e" },
                
              ].map(p => (
                <div key={p.label} className="flex items-center gap-1.5">
                  <div className="w-5 h-0.5 rounded" style={{ background: p.color }} />
                  <span className="text-[10px] font-medium" style={{ color: p.color }}>{p.label}</span>
                </div>
              ))}
            </div>
          </CardHeader>

          <div style={{ height: 505 }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChangeWithSave}
              onEdgesChange={onEdgesChange}
              onNodeClick={handleNodeClick}
              nodeTypes={nodeTypes}
              nodesConnectable={false}
              fitView
              fitViewOptions={{ padding: 0.25 }}
              colorMode="dark"
              proOptions={{ hideAttribution: true }}
              panOnDrag={true}
              panOnScroll={false}
              zoomOnScroll={true}
              zoomOnPinch={true}
              zoomOnDoubleClick={false}
              minZoom={0.2}
              maxZoom={3}
              style={{ background: "transparent", height: "100%" }}
            >
              <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1e293b" />
              <Controls className="!bg-card/80 !border-border/50 !shadow-none" showInteractive={false} />
            </ReactFlow>
          </div>
        </Card>

        {/* Panneau latéral */}
        <div className="lg:col-span-1 space-y-4">
          {selectedNode ? (

            <Card className="glass-panel border-primary/30">
              <CardHeader className="border-b border-border/50 py-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  {selectedNode.type === "firewall"
                    ? <Shield className="w-4 h-4 text-orange-400" />
                    : <Server  className="w-4 h-4 text-cyan-400" />
                  }
                  {selectedNode.name}
                </CardTitle>
                <div className="space-y-0.5 text-xs text-muted-foreground mt-1">
                  <p className="font-mono">{selectedNode.ipAddress}</p>
                  <p>{selectedNode.vendor}</p>
                  <p className="capitalize">{selectedNode.type}</p>
                </div>
              </CardHeader>

              <CardContent className="p-3 space-y-3 overflow-y-auto" style={{ maxHeight: 430 }}>

                <div className={`flex items-center gap-2 p-2 rounded-lg text-xs ${
                  selectedNode.hasCredentials
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-yellow-500/10 text-yellow-400"
                }`}>
                  {selectedNode.hasCredentials
                    ? <><CheckCircle2 className="w-3.5 h-3.5" /> SSH configuré</>
                    : <><AlertCircle  className="w-3.5 h-3.5" /> SSH non configuré</>
                  }
                </div>

                {selectedResult?.error && (
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 text-red-400 text-xs">
                    <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{selectedResult.error}</span>
                  </div>
                )}

                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Cable className="w-3.5 h-3.5" />
                    Voisins CDP / LLDP
                    {selectedNode.neighbors.length > 0 && (
                      <span className="ml-auto text-emerald-400 font-bold">
                        {selectedNode.neighbors.length}
                      </span>
                    )}
                  </p>

                  {selectedNode.neighbors.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <Network className="w-8 h-8 mx-auto mb-2 opacity-20" />
                      <p className="text-xs whitespace-pre-line">
                        {selectedNode.hasCredentials
                          ? "Aucun voisin détecté\n(CDP/LLDP inactif)"
                          : "Configurez SSH pour\ndécouvrir les voisins"}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedNode.neighbors.map((nb, i) => {
                        const nbShort = nb.deviceId.split(".")[0].toLowerCase()
                        const resolved = topoNodes.find(n =>
                          (nb.ipAddress && n.ipAddress === nb.ipAddress) ||
                          n.name.toLowerCase() === nbShort ||
                          n.name.toLowerCase().startsWith(nbShort) ||
                          nbShort.startsWith(n.name.toLowerCase())
                        )
                        const displayName = resolved?.name ?? nbShort
                        return (
                        <div key={i} className="p-2.5 rounded-lg border border-border/30 bg-muted/10 space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold text-foreground leading-tight">{displayName}</p>
                            {nb.platform && nb.platform !== "Inconnu" && (
                              <span className="text-[9px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded shrink-0">
                                {nb.platform}
                              </span>
                            )}
                          </div>
                          {nb.ipAddress && (
                            <p className="text-[10px] font-mono text-cyan-400">{nb.ipAddress}</p>
                          )}
                          {(nb.localInterface || nb.remoteInterface) && (
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <span className="font-mono text-primary/80">{nb.localInterface}</span>
                              {nb.remoteInterface && (
                                <>
                                  <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/50 shrink-0" />
                                  <span className="font-mono">{nb.remoteInterface}</span>
                                </>
                              )}
                            </div>
                          )}
                          {nb.capabilities && <ProtoBadge capabilities={nb.capabilities} />}
                        </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {selectedResult?.rawOutput && (
                  <div>
                    <button
                      onClick={() => setShowRaw(v => !v)}
                      className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      <Info className="w-3 h-3" />
                      {showRaw ? "Masquer" : "Voir"} la sortie brute
                    </button>
                    {showRaw && (
                      <pre className="mt-2 text-[9px] text-muted-foreground bg-black/40 p-2
                        rounded-lg overflow-auto max-h-36 whitespace-pre-wrap font-mono border border-border/20">
                        {selectedResult.rawOutput}
                      </pre>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

          ) : (

            <Card className="glass-panel border-border/50">
              <CardHeader className="border-b border-border/50 py-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-primary" />
                  Résultats de découverte
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2 overflow-y-auto" style={{ maxHeight: 460 }}>

                {sshResults.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Wifi className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">
                      Configurez SSH dans<br />la fiche équipement<br />puis rafraîchissez
                    </p>
                  </div>
                ) : (
                  sshResults.map(r => (
                    <div key={r.deviceId} className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                      r.success
                        ? "border-emerald-500/20 bg-emerald-500/5"
                        : "border-red-500/20 bg-red-500/5"
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">{r.deviceName}</span>
                        {r.success
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          : <XCircle      className="w-3.5 h-3.5 text-red-400 shrink-0" />
                        }
                      </div>
                      <p className="font-mono text-muted-foreground text-[10px]">{r.ipAddress}</p>
                      {r.success
                        ? <p className="text-emerald-400/80">{r.neighborsFound} voisin(s) détecté(s)</p>
                        : <p className="text-red-400/80 text-[10px]">{r.error}</p>
                      }
                    </div>
                  ))
                )}

                {stats.reachable === 0 && (
                  <div className="mt-3 p-3 rounded-lg border border-yellow-500/20
                    bg-yellow-500/5 text-xs text-yellow-400/80 space-y-1">
                    <p className="font-semibold flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Aucun équipement SSH
                    </p>
                    <p>Ajoutez des identifiants SSH dans la fiche de chaque équipement.</p>
                  </div>
                )}

                <p className="text-center text-[10px] text-muted-foreground/50 pt-2">
                  Cliquez sur un équipement pour voir ses voisins
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  )
}