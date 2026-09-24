import dagre from '@dagrejs/dagre'
import type { Id, Point } from '@/models'

export interface LayoutNode {
  id: Id
  width: number
  height: number
  rank?: number
}

export interface LayoutEdge {
  source: Id
  target: Id
}

/** layered top-down layout (dagre); returns top-left positions */
export function layeredLayout(nodes: LayoutNode[], edges: LayoutEdge[], opts: { rankdir?: 'TB' | 'LR'; nodesep?: number; ranksep?: number } = {}): Map<Id, Point> {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: opts.rankdir ?? 'TB', nodesep: opts.nodesep ?? 50, ranksep: opts.ranksep ?? 90, marginx: 20, marginy: 20 })
  g.setDefaultEdgeLabel(() => ({}))
  const ids = new Set(nodes.map((n) => n.id))
  for (const n of nodes) g.setNode(n.id, { width: n.width, height: n.height })
  for (const e of edges) if (ids.has(e.source) && ids.has(e.target) && e.source !== e.target) g.setEdge(e.source, e.target)
  dagre.layout(g)
  const out = new Map<Id, Point>()
  for (const n of nodes) {
    const p = g.node(n.id) as unknown as { x: number; y: number } | undefined
    if (p) out.set(n.id, { x: Math.round(p.x - n.width / 2), y: Math.round(p.y - n.height / 2) })
  }
  return out
}
