import { useEffect, useMemo } from 'react'
import dagre from '@dagrejs/dagre'
import type { ComponentKind, Device, Id } from '@/models'
import { formatSpeed } from '@/models'
import { useProjectStore } from '@/store/projectStore'
import { useUiStore } from '@/store/uiStore'
import { COMPONENT_ICONS } from '@/components/icons'
import { storageControllers } from '@/utils/compatibility'
import { connectionOfPort, otherEnd, findPort } from '@/utils/device'
import { formatCapacity } from '@/utils/buildSummary'
import { showConnection } from '@/store/navigation'
import { useViewport } from '../useViewport'

interface BNode {
  id: string
  label: string
  sub?: string
  kind: ComponentKind | 'chassis' | 'port' | 'controller'
  componentId?: Id
  connectionId?: Id
  color: string
  w: number
  h: number
}

const COLORS: Record<string, string> = {
  chassis: '#64748b',
  mainboard: '#0f766e',
  cpu: '#2563eb',
  ram: '#16a34a',
  storage: '#ca8a04',
  nic: '#7c3aed',
  gpu: '#dc2626',
  hba: '#c2410c',
  raid: '#c2410c',
  controller: '#b45309',
  psu: '#be123c',
  fan: '#475569',
  pcie: '#0891b2',
  port: '#6d28d9',
  bbu: '#475569',
  custom: '#475569',
}

export function BlockDiagram({ device }: { device: Device }) {
  const build = device.build!
  const project = useProjectStore((s) => s.project)
  const select = useUiStore((s) => s.select)
  const selection = useUiStore((s) => s.selection)
  const { vp, ref, fit } = useViewport({ minZoom: 0.15, maxZoom: 4 })

  const graph = useMemo(() => {
    const nodes: BNode[] = []
    const edges: { from: string; to: string; label?: string; dashed?: boolean }[] = []
    const add = (n: Omit<BNode, 'w' | 'h' | 'color'> & { color?: string }) => {
      nodes.push({ ...n, color: n.color ?? COLORS[n.kind] ?? '#475569', w: 190, h: n.sub ? 46 : 34 })
    }
    add({ id: 'chassis', label: build.chassis.name, sub: device.name, kind: 'chassis' })
    const installed = build.components.filter((c) => c.mount)
    const board = installed.find((c) => c.kind === 'mainboard')
    if (board) {
      add({ id: board.id, label: board.name, sub: board.kind === 'mainboard' ? `${board.specs.formFactor} · ${board.specs.socket}` : '', kind: 'mainboard', componentId: board.id })
      edges.push({ from: 'chassis', to: board.id })
    }
    const slotOf = (id: Id) => {
      const c = build.components.find((x) => x.id === id)
      if (!c?.mount || c.mount.parentId === 'chassis') return undefined
      return build.components.find((x) => x.id === c.mount!.parentId)?.slots?.find((s) => s.id === c.mount!.slotId)
    }
    const cpuNodes = new Map<number, string>()
    for (const c of installed.filter((x) => x.kind === 'cpu')) {
      const s = slotOf(c.id)
      add({ id: c.id, label: c.name, sub: c.kind === 'cpu' ? `${c.specs.cores} Kerne · ${c.specs.tdpW} W · ${s?.label ?? ''}` : '', kind: 'cpu', componentId: c.id })
      cpuNodes.set(s?.meta.cpuIndex ?? 0, c.id)
      if (board) edges.push({ from: board.id, to: c.id, label: 'Sockel' })
    }
    // RAM grouped per CPU
    const ramByCpu = new Map<number, typeof installed>()
    for (const r of installed.filter((x) => x.kind === 'ram')) {
      const idx = slotOf(r.id)?.meta.cpuIndex ?? 0
      ramByCpu.set(idx, [...(ramByCpu.get(idx) ?? []), r])
    }
    for (const [idx, rams] of ramByCpu) {
      for (const r of rams) {
        if (r.kind !== 'ram') continue
        add({ id: r.id, label: `${r.specs.capacityGB} GB ${r.specs.memoryType}${r.specs.ecc ? ' ECC' : ''}`, sub: slotOf(r.id)?.label, kind: 'ram', componentId: r.id })
        edges.push({ from: cpuNodes.get(idx) ?? board?.id ?? 'chassis', to: r.id })
      }
    }
    // cards and m.2
    for (const c of installed) {
      const s = slotOf(c.id)
      if (!s) continue
      if (s.kind === 'pcie') {
        const sub = c.kind === 'nic' ? `${c.specs.portCount}× ${formatSpeed(c.specs.speed)} ${c.specs.connector} · ${s.label}` : s.label
        add({ id: c.id, label: c.name, sub, kind: c.kind, componentId: c.id })
        edges.push({ from: cpuNodes.get(s.meta.cpuIndex ?? 0) ?? board?.id ?? 'chassis', to: c.id, label: `PCIe x${'pcieLanes' in c.specs ? (c.specs as { pcieLanes: number }).pcieLanes : ''}` })
      } else if (s.kind === 'm2' && c.kind === 'storage') {
        add({ id: c.id, label: `${formatCapacity(c.specs.capacityGB)} ${c.specs.formFactor}`, sub: `${c.name} · ${s.label}`, kind: 'storage', componentId: c.id })
        edges.push({ from: board?.id ?? 'chassis', to: c.id, label: 'M.2' })
      }
    }
    // storage controllers
    const ctrls = storageControllers(build)
    for (const ctrl of ctrls) {
      const linked = build.links.filter((l) => l.toId === ctrl.id)
      if (!linked.length) continue
      if (ctrl.kind === 'mainboard-sata' || ctrl.kind === 'mainboard-nvme') {
        add({ id: ctrl.id, label: ctrl.kind === 'mainboard-sata' ? 'Onboard SATA' : 'Onboard NVMe', sub: `${ctrl.used}/${ctrl.capacity} Anschlüsse`, kind: 'controller' })
        if (board) edges.push({ from: board.id, to: ctrl.id })
      }
      for (const l of linked) {
        const d = build.components.find((x) => x.id === l.fromId)
        if (!d || d.kind !== 'storage') continue
        const bay = d.mount?.parentId === 'chassis' ? build.chassis.slots.find((s) => s.id === d.mount!.slotId)?.label : 'lose'
        add({ id: d.id, label: `${formatCapacity(d.specs.capacityGB)} ${d.specs.storageType.toUpperCase()}`, sub: `${d.specs.interface} · ${bay}`, kind: 'storage', componentId: d.id })
        edges.push({ from: ctrl.id, to: d.id, label: l.kind.toUpperCase(), dashed: true })
      }
    }
    // unlinked drives in bays
    for (const d of installed.filter((x) => x.kind === 'storage' && x.mount?.parentId === 'chassis')) {
      if (nodes.some((n) => n.id === d.id) || d.kind !== 'storage') continue
      add({ id: d.id, label: `${formatCapacity(d.specs.capacityGB)} ${d.specs.storageType.toUpperCase()}`, sub: 'nicht angeschlossen', kind: 'storage', componentId: d.id })
      edges.push({ from: 'chassis', to: d.id, dashed: true })
    }
    // psus and fans
    const psus = installed.filter((x) => x.kind === 'psu')
    for (const p of psus) {
      add({ id: p.id, label: p.name, sub: p.kind === 'psu' ? `${p.specs.watts} W · ${p.specs.efficiency}` : '', kind: 'psu', componentId: p.id })
      edges.push({ from: 'chassis', to: p.id })
    }
    const fans = installed.filter((x) => x.kind === 'fan')
    if (fans.length) {
      add({ id: 'fans', label: `${fans.length}× ${fans[0].name}`, kind: 'fan', componentId: fans[0].id })
      edges.push({ from: 'chassis', to: 'fans' })
    }
    // ports → network
    for (const c of installed) {
      for (const p of c.ports ?? []) {
        const conn = connectionOfPort(project, device.id, p.id)
        let sub = `${formatSpeed(p.speed)} ${p.connector}`
        if (conn) {
          const o = otherEnd(conn, device.id, p.id)
          const od = project.devices[o.deviceId]
          sub += ` → ${od?.name ?? '?'}${o.portId && od ? ` ${findPort(od, o.portId)?.port.name ?? ''}` : ''}`
        } else sub += ' · frei'
        add({ id: p.id, label: p.name, sub, kind: 'port', connectionId: conn?.id, color: conn ? '#16a34a' : '#6b7280' })
        edges.push({ from: c.id, to: p.id })
      }
    }
    // layout
    const g = new dagre.graphlib.Graph()
    g.setGraph({ rankdir: 'LR', nodesep: 14, ranksep: 70, marginx: 20, marginy: 20 })
    g.setDefaultEdgeLabel(() => ({}))
    for (const n of nodes) g.setNode(n.id, { width: n.w, height: n.h })
    for (const e of edges) if (g.hasNode(e.from) && g.hasNode(e.to)) g.setEdge(e.from, e.to)
    dagre.layout(g)
    const pos = new Map(nodes.map((n) => [n.id, g.node(n.id) as unknown as { x: number; y: number }]))
    const gg = g.graph() as { width?: number; height?: number }
    return { nodes, edges, pos, width: gg.width ?? 800, height: gg.height ?? 600 }
  }, [build, device, project])

  useEffect(() => {
    const t = requestAnimationFrame(() => fit({ x: 0, y: 0, w: graph.width, h: graph.height }, 30))
    return () => cancelAnimationFrame(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.id, graph.nodes.length])

  const selected = new Set(selection?.type === 'component' ? selection.ids : [])

  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden bg-canvas">
      <svg className="absolute inset-0 h-full w-full">
        <g transform={`translate(${vp.x} ${vp.y}) scale(${vp.zoom})`}>
          {graph.edges.map((e, i) => {
            const a = graph.pos.get(e.from)
            const b = graph.pos.get(e.to)
            const na = graph.nodes.find((n) => n.id === e.from)
            const nb = graph.nodes.find((n) => n.id === e.to)
            if (!a || !b || !na || !nb) return null
            const x1 = a.x + na.w / 2
            const x2 = b.x - nb.w / 2
            const mx = (x1 + x2) / 2
            return (
              <g key={i}>
                <path d={`M${x1} ${a.y} C${mx} ${a.y} ${mx} ${b.y} ${x2} ${b.y}`} fill="none" stroke="var(--chassis-stroke)" strokeWidth={1.3} strokeDasharray={e.dashed ? '5 4' : undefined} opacity={0.7} />
                {e.label && (
                  <text x={mx} y={(a.y + b.y) / 2 - 4} fontSize={9} fill="var(--label-muted)" textAnchor="middle">
                    {e.label}
                  </text>
                )}
              </g>
            )
          })}
          {graph.nodes.map((n) => {
            const p = graph.pos.get(n.id)!
            const Icon = n.kind in COMPONENT_ICONS ? COMPONENT_ICONS[n.kind as ComponentKind] : null
            const isSel = n.componentId && selected.has(n.componentId)
            return (
              <g
                key={n.id}
                transform={`translate(${p.x - n.w / 2} ${p.y - n.h / 2})`}
                style={{ cursor: n.componentId || n.connectionId ? 'pointer' : 'default' }}
                onClick={() => {
                  if (n.componentId) select({ type: 'component', deviceId: device.id, ids: [n.componentId] })
                  else if (n.connectionId) showConnection(n.connectionId)
                }}
              >
                <rect width={n.w} height={n.h} rx={8} fill="var(--card)" stroke={isSel ? 'var(--selection)' : n.color} strokeWidth={isSel ? 2.5 : 1.2} />
                <rect width={5} height={n.h} rx={2} fill={n.color} />
                {Icon && (
                  <foreignObject x={10} y={n.h / 2 - 8} width={16} height={16}>
                    <Icon style={{ width: 16, height: 16, color: n.color }} />
                  </foreignObject>
                )}
                <text x={Icon ? 32 : 14} y={n.sub ? 17 : n.h / 2} dominantBaseline="central" fontSize={11} fontWeight={600} fill="var(--label)">
                  {n.label.length > 26 ? `${n.label.slice(0, 25)}…` : n.label}
                </text>
                {n.sub && (
                  <text x={Icon ? 32 : 14} y={33} dominantBaseline="central" fontSize={9} fill="var(--label-muted)">
                    {n.sub.length > 34 ? `${n.sub.slice(0, 33)}…` : n.sub}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
