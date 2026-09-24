import type { Edge, Node } from '@xyflow/react'
import type { Connection, Device, Id, NetworkGroup, Point, Project, Vlan } from '@/models'
import { DEVICE_KINDS, isInfrastructureKind, isServiceKind } from '@/data/deviceKinds'
import { connectionVlans, effectiveSpeed, findPort, getDevicePorts } from '@/utils/device'
import type { NetworkOverlays, NetworkView } from '@/store/uiStore'

export type DeviceNodeData = {
  device: Device
  connected: Record<Id, number>
  vlans: Record<Id, Vlan>
  overlays: NetworkOverlays
  view: NetworkView
  hostName?: string
  vlanColor?: string
  /** which edge of the node a port's handle should face (towards its peer) */
  portSide: Record<Id, 'top' | 'bottom'>
  /** hide hardware ports (service view) */
  compact?: boolean
}

export type GroupNodeData = { group: NetworkGroup; memberIds: Id[] }
export type ZoneNodeData = { vlan: Vlan; count: number; memberIds: Id[] }

export type ConnEdgeData = {
  connection?: Connection
  color: string
  medium: Connection['medium'] | 'hosted'
  speedLabel?: string
  vlanTags: { tag: number; color: string }[]
  portA?: string
  portB?: string
  overlays: NetworkOverlays
  hosted?: boolean
  label?: string
  warn?: boolean
}

export type DeviceNode = Node<DeviceNodeData, 'device'>
export type GroupNode = Node<GroupNodeData, 'devgroup'>
export type ZoneNode = Node<ZoneNodeData, 'zone'>
export type AnyNode = DeviceNode | GroupNode | ZoneNode
export type ConnEdge = Edge<ConnEdgeData, 'conn'>

export const ANY_HANDLE = '__any'

export function positionKey(view: NetworkView): 'network' | 'service' {
  return view === 'service' ? 'service' : 'network'
}

export function visibleDevices(project: Project, view: NetworkView): Device[] {
  const all = Object.values(project.devices)
  if (view !== 'service') {
    return all.filter((d) => !d.hiddenInNetwork && (!isServiceKind(d.kind) || d.kind === 'internet' || d.kind === 'cloud'))
  }
  const services = all.filter((d) => isServiceKind(d.kind) && !d.hiddenInNetwork)
  const ids = new Set(services.map((s) => s.id))
  // hosts of services
  for (const s of services) if (s.hostDeviceId && project.devices[s.hostDeviceId]) ids.add(s.hostDeviceId)
  // everything connected via logical/service links
  for (const c of Object.values(project.connections)) {
    if (c.type !== 'service' && c.type !== 'virtual') continue
    ids.add(c.a.deviceId)
    ids.add(c.b.deviceId)
  }
  return [...ids].map((id) => project.devices[id]).filter((d): d is Device => !!d)
}

/** deterministic positions for devices that have never been placed on the canvas */
function fallbackPositions(devices: Device[], key: 'network' | 'service'): Map<Id, Point> {
  const placed = devices.map((d) => d.layout[key] ?? (key === 'service' ? d.layout.network : undefined)).filter((p): p is Point => !!p)
  const baseY = placed.length ? Math.max(...placed.map((p) => p.y)) + 260 : 0
  const minX = placed.length ? Math.min(...placed.map((p) => p.x)) : 0
  const out = new Map<Id, Point>()
  let i = 0
  for (const d of devices) {
    if (d.layout[key] || (key === 'service' && d.layout.network)) continue
    out.set(d.id, { x: minX + (i % 5) * 300, y: baseY + Math.floor(i / 5) * 200 })
    i++
  }
  return out
}

export function edgeColor(c: Connection, vlans: Vlan[], view: NetworkView): string {
  if (view === 'logical' && vlans.length) return vlans[0].color
  switch (c.medium) {
    case 'fiber':
      return '#f59e0b'
    case 'wireless':
      return '#14b8a6'
    case 'virtual':
      return '#a855f7'
    default:
      return c.type === 'dac' ? '#64748b' : '#3b82f6'
  }
}

export function buildGraph(
  project: Project,
  view: NetworkView,
  overlays: NetworkOverlays,
  selection: { devices: Set<Id>; connections: Set<Id>; group?: Id },
): { nodes: AnyNode[]; edges: ConnEdge[] } {
  const key = positionKey(view)
  const devices = visibleDevices(project, view)
  const visible = new Set(devices.map((d) => d.id))
  const fallback = fallbackPositions(devices, key)
  const connectedCount: Record<Id, Record<Id, number>> = {}
  for (const c of Object.values(project.connections)) {
    for (const end of [c.a, c.b]) {
      if (!end.portId) continue
      connectedCount[end.deviceId] = connectedCount[end.deviceId] ?? {}
      connectedCount[end.deviceId][end.portId] = (connectedCount[end.deviceId][end.portId] ?? 0) + 1
    }
  }

  const positions = new Map<Id, Point>()
  for (const d of devices) positions.set(d.id, d.layout[key] ?? (key === 'service' ? d.layout.network : undefined) ?? fallback.get(d.id) ?? { x: 0, y: 0 })
  const portSide: Record<Id, Record<Id, 'top' | 'bottom'>> = {}
  for (const c of Object.values(project.connections)) {
    const pa = positions.get(c.a.deviceId)
    const pb = positions.get(c.b.deviceId)
    if (!pa || !pb) continue
    if (c.a.portId) (portSide[c.a.deviceId] ??= {})[c.a.portId] = pb.y + 40 < pa.y ? 'top' : 'bottom'
    if (c.b.portId) (portSide[c.b.deviceId] ??= {})[c.b.portId] = pa.y + 40 < pb.y ? 'top' : 'bottom'
  }

  const nodes: AnyNode[] = []
  for (const d of devices) {
    const position = positions.get(d.id)!
    let vlanColor: string | undefined
    if (view === 'logical') {
      const v = getDevicePorts(d)
        .flatMap((p) => (p.port.vlanMode === 'trunk' ? [] : p.port.vlanIds ?? []))
        .map((id) => project.vlans[id])
        .find(Boolean)
      vlanColor = v?.color
    }
    nodes.push({
      id: d.id,
      type: 'device',
      position,
      selected: selection.devices.has(d.id),
      data: {
        device: d,
        connected: connectedCount[d.id] ?? {},
        vlans: project.vlans,
        overlays,
        view,
        hostName: d.hostDeviceId ? project.devices[d.hostDeviceId]?.name : undefined,
        vlanColor,
        portSide: portSide[d.id] ?? {},
        compact: view === 'service' && !isServiceKind(d.kind),
      },
      zIndex: 1,
    })
  }

  const edges: ConnEdge[] = []
  for (const c of Object.values(project.connections)) {
    if (!visible.has(c.a.deviceId) || !visible.has(c.b.deviceId)) continue
    const logicalLink = c.type === 'service' || c.type === 'virtual'
    if (view !== 'service' && c.type === 'service') continue
    if (view === 'service' && !logicalLink) continue
    const da = project.devices[c.a.deviceId]
    const db = project.devices[c.b.deviceId]
    const pa = c.a.portId ? findPort(da, c.a.portId) : undefined
    const pb = c.b.portId ? findPort(db, c.b.portId) : undefined
    const vl = connectionVlans(project, c).map((id) => project.vlans[id]).sort((x, y) => x.tag - y.tag)
    const speed = effectiveSpeed(project, c)
    edges.push({
      id: c.id,
      type: 'conn',
      source: c.a.deviceId,
      target: c.b.deviceId,
      sourceHandle: pa ? pa.port.id : ANY_HANDLE,
      targetHandle: pb ? pb.port.id : ANY_HANDLE,
      selected: selection.connections.has(c.id),
      zIndex: 0,
      data: {
        connection: c,
        color: edgeColor(c, vl, view),
        medium: c.medium,
        speedLabel: speed ? (speed >= 1000 ? `${speed / 1000}G` : `${speed}M`) : undefined,
        vlanTags: vl.map((v) => ({ tag: v.tag, color: v.color })),
        portA: pa?.port.name,
        portB: pb?.port.name,
        overlays,
        label: c.label,
        warn: (!!pa && !pa.installed) || (!!pb && !pb.installed),
      },
    })
  }

  if (view === 'service') {
    for (const d of devices) {
      if (!d.hostDeviceId || !visible.has(d.hostDeviceId)) continue
      edges.push({
        id: `hosted:${d.id}`,
        type: 'conn',
        source: d.hostDeviceId,
        target: d.id,
        sourceHandle: ANY_HANDLE,
        targetHandle: ANY_HANDLE,
        selectable: false,
        focusable: false,
        zIndex: 0,
        data: { color: '#94a3b8', medium: 'hosted', vlanTags: [], overlays, hosted: true, label: 'läuft auf' },
      })
    }
  }

  // VLAN zones (logical view): bounding boxes of endpoint devices per VLAN
  if (view === 'logical' && overlays.zones) {
    const byVlan = new Map<Id, Device[]>()
    for (const d of devices) {
      if (isInfrastructureKind(d.kind) || d.kind === 'internet' || d.kind === 'cloud') continue
      const access = getDevicePorts(d).filter((p) => p.port.vlanMode !== 'trunk' && p.port.vlanIds?.length)
      const data = access.filter((p) => p.port.role !== 'management')
      const vids = new Set((data.length ? data : access).flatMap((p) => p.port.vlanIds ?? []))
      for (const v of vids) byVlan.set(v, [...(byVlan.get(v) ?? []), d])
    }
    for (const [vid, members] of byVlan) {
      const vlan = project.vlans[vid]
      if (!vlan || !members.length) continue
      nodes.push({
        id: `zone:${vid}`,
        type: 'zone',
        position: { x: 0, y: 0 },
        data: { vlan, count: members.length, memberIds: members.map((m) => m.id) },
        selectable: false,
        draggable: false,
        focusable: false,
        zIndex: -2,
        // actual geometry is computed after measuring (see NetworkEditor)
        hidden: false,
      } as ZoneNode)
    }
  }

  // groups
  for (const g of Object.values(project.groups)) {
    if (g.view !== key) continue
    const memberIds = devices.filter((d) => d.layout.groupId === g.id).map((d) => d.id)
    if (!memberIds.length) continue
    nodes.push({
      id: `group:${g.id}`,
      type: 'devgroup',
      position: { x: 0, y: 0 },
      data: { group: g, memberIds },
      selected: selection.group === g.id,
      zIndex: -1,
    } as GroupNode)
  }

  return { nodes, edges }
}

export function deviceAccent(d: Device) {
  return DEVICE_KINDS[d.kind].color
}
