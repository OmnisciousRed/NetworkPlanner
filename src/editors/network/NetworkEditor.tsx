import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection as RFConnection,
  type EdgeChange,
  type NodeChange,
  type OnSelectionChangeParams,
} from '@xyflow/react'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ChevronDown,
  Copy,
  EyeOff,
  Group,
  LayoutTemplate,
  Magnet,
  Map as MapIcon,
  Maximize,
  Network,
  Server,
  Trash2,
  Ungroup,
  Wrench,
} from 'lucide-react'
import type { Id, Point } from '@/models'
import { findDeviceTemplate } from '@/data/deviceCatalog'
import { DEVICE_KINDS, isServiceKind } from '@/data/deviceKinds'
import { useProjectStore } from '@/store/projectStore'
import { useUiStore, type NetworkView } from '@/store/uiStore'
import { addDeviceFromTemplate, deleteDevices, duplicateDevices, setDevicePositions, setHiddenInNetwork, updateDevice } from '@/store/actions/devices'
import { connect, createGroup, deleteConnections, pickFreePort, ungroup } from '@/store/actions/network'
import { openInHardware, openVlan, showInRack } from '@/store/navigation'
import { connectionsOfPort, findPort, isSharedPort } from '@/utils/device'
import { layeredLayout } from '@/utils/autoLayout'
import { isEditableTarget, isModKey } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { DeviceNode } from './DeviceNode'
import { GroupNode, ZoneNode } from './OverlayNodes'
import { ConnectionEdge } from './ConnectionEdge'
import { NetworkLibrary } from './NetworkLibrary'
import { HelpButton } from '@/components/HelpButton'
import { ANY_HANDLE, buildGraph, positionKey, type AnyNode, type ConnEdge, type GroupNode as GroupNodeT } from './graph'

const nodeTypes = { device: DeviceNode, devgroup: GroupNode, zone: ZoneNode }
const edgeTypes = { conn: ConnectionEdge }

const VIEWS: { id: NetworkView; label: string; hint: string }[] = [
  { id: 'physical', label: 'Physisch', hint: 'Kabel, Ports, Medien' },
  { id: 'logical', label: 'Logisch (VLAN)', hint: 'VLAN-Zonen und Farben' },
  { id: 'service', label: 'Services', hint: 'Dienste, Container, Abhängigkeiten' },
]

function sizeOf(n: AnyNode) {
  return { w: n.measured?.width ?? (n.width as number | undefined) ?? 200, h: n.measured?.height ?? (n.height as number | undefined) ?? 90 }
}

/** computes group / zone geometry from their member nodes */
function withDerived(nodes: AnyNode[]): AnyNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return nodes.map((n) => {
    if (n.type !== 'devgroup' && n.type !== 'zone') return n
    const members = (n.data.memberIds as Id[]).map((id) => byId.get(id)).filter((m): m is AnyNode => !!m)
    if (!members.length) return { ...n, hidden: true }
    const pad = n.type === 'devgroup' ? 22 : 30
    const top = n.type === 'devgroup' ? 26 : 36
    const minX = Math.min(...members.map((m) => m.position.x)) - pad
    const minY = Math.min(...members.map((m) => m.position.y)) - top
    const maxX = Math.max(...members.map((m) => m.position.x + sizeOf(m).w)) + pad
    const maxY = Math.max(...members.map((m) => m.position.y + sizeOf(m).h)) + pad
    const width = maxX - minX
    const height = maxY - minY
    if (n.position.x === minX && n.position.y === minY && n.width === width && n.height === height && !n.hidden) return n
    return { ...n, position: { x: minX, y: minY }, width, height, style: { width, height }, hidden: false } as AnyNode
  })
}

function sameIds(a: Id[], b: Id[]) {
  return a.length === b.length && a.every((x) => b.includes(x))
}

function NetworkEditorInner() {
  const project = useProjectStore((s) => s.project)
  const view = useUiStore((s) => s.networkView)
  const net = useUiStore((s) => s.net)
  const setNet = useUiStore((s) => s.setNet)
  const selection = useUiStore((s) => s.selection)
  const select = useUiStore((s) => s.select)
  const set = useUiStore((s) => s.set)
  const focus = useUiStore((s) => s.focus)
  const payload = useUiStore((s) => s.drag)
  const rf = useReactFlow<AnyNode, ConnEdge>()
  const key = positionKey(view)
  const wrapper = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; nodeId?: Id; edgeId?: Id } | null>(null)

  const sel = useMemo(
    () => ({
      devices: new Set(selection?.type === 'device' ? selection.ids : []),
      connections: new Set(selection?.type === 'connection' ? selection.ids : []),
      group: selection?.type === 'group' ? selection.id : undefined,
    }),
    [selection],
  )
  const graph = useMemo(() => buildGraph(project, view, net, sel), [project, view, net, sel])
  const [nodes, setNodes] = useState<AnyNode[]>(() => withDerived(graph.nodes))
  const [edges, setEdges] = useState<ConnEdge[]>(graph.edges)

  useEffect(() => {
    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]))
      return withDerived(graph.nodes.map((n) => {
        const p = prevById.get(n.id)
        return p?.measured ? ({ ...n, measured: p.measured } as AnyNode) : n
      }))
    })
    setEdges(graph.edges)
  }, [graph])

  // initial fit when switching views
  useEffect(() => {
    const t = setTimeout(() => rf.fitView({ padding: 0.15, duration: 300 }), 60)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  // navigation focus
  useEffect(() => {
    if (!focus) return
    const t = setTimeout(() => {
      if (focus.type === 'device') rf.fitView({ nodes: [{ id: focus.id }], duration: 500, maxZoom: 1.2, padding: 0.8 })
      if (focus.type === 'connection') {
        const c = project.connections[focus.id]
        if (c) rf.fitView({ nodes: [{ id: c.a.deviceId }, { id: c.b.deviceId }], duration: 500, maxZoom: 1.2, padding: 0.4 })
      }
    }, 120)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce])

  const onNodesChange = useCallback((changes: NodeChange<AnyNode>[]) => {
    setNodes((nds) => {
      const extra: NodeChange<AnyNode>[] = []
      for (const ch of changes) {
        if (ch.type === 'position' && ch.position && ch.id.startsWith('group:')) {
          const g = nds.find((n) => n.id === ch.id) as GroupNodeT | undefined
          if (!g) continue
          const dx = ch.position.x - g.position.x
          const dy = ch.position.y - g.position.y
          for (const mid of g.data.memberIds) {
            const m = nds.find((n) => n.id === mid)
            if (m) extra.push({ type: 'position', id: mid, position: { x: m.position.x + dx, y: m.position.y + dy }, dragging: ch.dragging })
          }
        }
      }
      return withDerived(applyNodeChanges([...changes, ...extra], nds))
    })
  }, [])

  const onEdgesChange = useCallback((changes: EdgeChange<ConnEdge>[]) => {
    setEdges((eds) => applyEdgeChanges(changes.filter((c) => c.type !== 'remove'), eds))
  }, [])

  const onNodeDragStop = useCallback(
    (_: unknown, _node: AnyNode, dragged: AnyNode[]) => {
      const all = rf.getNodes()
      const byId = new Map(all.map((n) => [n.id, n]))
      const ids = new Set<Id>()
      for (const n of dragged) {
        if (n.type === 'device') ids.add(n.id)
        if (n.type === 'devgroup') (n.data.memberIds as Id[]).forEach((m) => ids.add(m))
      }
      const positions: Record<Id, Point> = {}
      for (const id of ids) {
        const n = byId.get(id)
        if (n) positions[id] = n.position
      }
      const p = useProjectStore.getState().project
      const changed = Object.entries(positions).some(([id, pos]) => {
        const cur = p.devices[id]?.layout[key]
        return !cur || Math.round(cur.x) !== Math.round(pos.x) || Math.round(cur.y) !== Math.round(pos.y)
      })
      if (changed) setDevicePositions(key, positions, ids.size > 1 ? `${ids.size} Geräte verschoben` : 'Gerät verschoben')
    },
    [rf, key],
  )

  const onSelectionChange = useCallback(
    ({ nodes: ns, edges: es }: OnSelectionChangeParams<AnyNode, ConnEdge>) => {
      const cur = useUiStore.getState().selection
      const devs = ns.filter((n) => n.type === 'device').map((n) => n.id)
      const grp = ns.find((n) => n.type === 'devgroup')
      const cons = es.filter((e) => !e.id.startsWith('hosted:')).map((e) => e.id)
      if (devs.length) {
        if (!(cur?.type === 'device' && sameIds(cur.ids, devs))) select({ type: 'device', ids: devs })
      } else if (grp) {
        const gid = grp.id.slice(6)
        if (!(cur?.type === 'group' && cur.id === gid)) select({ type: 'group', id: gid })
      } else if (cons.length) {
        if (!(cur?.type === 'connection' && sameIds(cur.ids, cons))) select({ type: 'connection', ids: cons })
      } else if (cur && (cur.type === 'device' || cur.type === 'connection' || cur.type === 'group')) {
        select(null)
      }
    },
    [select],
  )

  /* ---------------- connections ---------------- */

  const isValidConnection = useCallback(
    (c: RFConnection | ConnEdge) => {
      if (!c.source || !c.target || c.source === c.target) return false
      const p = useProjectStore.getState().project
      for (const [dev, handle] of [
        [c.source, c.sourceHandle],
        [c.target, c.targetHandle],
      ] as const) {
        if (!handle || handle === ANY_HANDLE) continue
        const d = p.devices[dev]
        const port = d && findPort(d, handle)
        if (!port) return false
        if (!isSharedPort(port.port) && connectionsOfPort(p, dev, handle).length) return false
      }
      return true
    },
    [],
  )

  const onConnect = useCallback(
    (c: RFConnection) => {
      const p = useProjectStore.getState().project
      if (!c.source || !c.target) return
      let a = { deviceId: c.source, portId: c.sourceHandle && c.sourceHandle !== ANY_HANDLE ? c.sourceHandle : undefined }
      let b = { deviceId: c.target, portId: c.targetHandle && c.targetHandle !== ANY_HANDLE ? c.targetHandle : undefined }
      if (view === 'service') {
        connect({ deviceId: a.deviceId }, { deviceId: b.deviceId }, { type: 'service', medium: 'virtual' })
        return
      }
      const pa = a.portId ? findPort(p.devices[a.deviceId], a.portId)?.port : undefined
      const pb = b.portId ? findPort(p.devices[b.deviceId], b.portId)?.port : undefined
      if (!a.portId && !isServiceKind(p.devices[a.deviceId].kind)) a = { ...a, portId: pickFreePort(p, a.deviceId, pb?.connector) }
      if (!b.portId && !isServiceKind(p.devices[b.deviceId].kind)) b = { ...b, portId: pickFreePort(p, b.deviceId, pa?.connector) }
      const res = connect(a, b)
      if (res.id) select({ type: 'connection', ids: [res.id] })
    },
    [view, select],
  )

  /* ---------------- drop from library ---------------- */

  const onDragOver = (e: React.DragEvent) => {
    if (!payload || payload.source === 'component-template') return
    e.preventDefault()
    e.dataTransfer.dropEffect = payload.source === 'device' ? 'move' : 'copy'
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const p = payload
    set({ drag: null })
    if (!p) return
    const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const position = { x: Math.round(pos.x - 90), y: Math.round(pos.y - 40) }
    if (p.source === 'device') {
      updateDevice(p.deviceId, (d) => {
        d.hiddenInNetwork = false
        d.layout[key] = position
      }, 'In Netzwerkansicht eingeblendet')
      select({ type: 'device', ids: [p.deviceId] })
      return
    }
    if (p.source !== 'device-template') return
    const t = findDeviceTemplate(p.templateId, project.customTemplates.devices)
    if (!t) return
    // a service dropped onto a host node runs on that host
    let hostDeviceId: Id | undefined
    if (isServiceKind(t.kind) && t.kind !== 'internet' && t.kind !== 'cloud') {
      const hit = rf.getIntersectingNodes({ x: pos.x - 5, y: pos.y - 5, width: 10, height: 10 }).find((n) => n.type === 'device')
      if (hit) hostDeviceId = hit.id
    }
    const id = addDeviceFromTemplate(p.templateId, { position: hostDeviceId ? { x: position.x, y: position.y + 160 } : position, view: key, hostDeviceId })
    if (id) {
      if (view !== 'service' && isServiceKind(t.kind) && t.kind !== 'internet' && t.kind !== 'cloud') set({ networkView: 'service' })
      select({ type: 'device', ids: [id] })
    }
  }

  /* ---------------- commands ---------------- */

  const selectedDevices = selection?.type === 'device' ? selection.ids : []

  const autoLayout = () => {
    const devNodes = rf.getNodes().filter((n) => n.type === 'device' && !n.hidden)
    const layout = layeredLayout(
      devNodes.map((n) => ({ id: n.id, width: n.measured?.width ?? 200, height: n.measured?.height ?? 90 })),
      edges.map((e) => ({ source: e.source, target: e.target })),
      { nodesep: 40, ranksep: 110 },
    )
    setDevicePositions(key, Object.fromEntries(layout), 'Auto-Layout')
    setTimeout(() => rf.fitView({ padding: 0.12, duration: 400 }), 80)
  }

  type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' | 'distribute-h' | 'distribute-v'
  const align = (mode: AlignMode) => {
    const items = rf.getNodes().filter((n) => n.type === 'device' && selectedDevices.includes(n.id))
    if (items.length < 2) return
    const box = (n: AnyNode) => ({ x: n.position.x, y: n.position.y, w: n.measured?.width ?? 200, h: n.measured?.height ?? 90 })
    const bs = items.map((n) => ({ id: n.id, ...box(n) }))
    const minX = Math.min(...bs.map((b) => b.x))
    const maxX = Math.max(...bs.map((b) => b.x + b.w))
    const minY = Math.min(...bs.map((b) => b.y))
    const maxY = Math.max(...bs.map((b) => b.y + b.h))
    const out: Record<Id, Point> = {}
    const put = (b: (typeof bs)[number], x: number, y: number) => (out[b.id] = { x, y })
    if (mode === 'left') bs.forEach((b) => put(b, minX, b.y))
    if (mode === 'right') bs.forEach((b) => put(b, maxX - b.w, b.y))
    if (mode === 'hcenter') bs.forEach((b) => put(b, (minX + maxX) / 2 - b.w / 2, b.y))
    if (mode === 'top') bs.forEach((b) => put(b, b.x, minY))
    if (mode === 'bottom') bs.forEach((b) => put(b, b.x, maxY - b.h))
    if (mode === 'vcenter') bs.forEach((b) => put(b, b.x, (minY + maxY) / 2 - b.h / 2))
    if (mode === 'distribute-h') {
      const sorted = [...bs].sort((a, b) => a.x - b.x)
      const gap = (maxX - minX - sorted.reduce((s, b) => s + b.w, 0)) / Math.max(1, sorted.length - 1)
      let x = minX
      for (const b of sorted) {
        put(b, x, b.y)
        x += b.w + gap
      }
    }
    if (mode === 'distribute-v') {
      const sorted = [...bs].sort((a, b) => a.y - b.y)
      const gap = (maxY - minY - sorted.reduce((s, b) => s + b.h, 0)) / Math.max(1, sorted.length - 1)
      let y = minY
      for (const b of sorted) {
        put(b, b.x, y)
        y += b.h + gap
      }
    }
    setDevicePositions(key, out, 'Geräte ausgerichtet')
  }

  const groupSelected = () => {
    if (!selectedDevices.length) return
    const gid = createGroup(selectedDevices, key)
    if (gid) select({ type: 'group', id: gid })
  }

  const ungroupSelected = () => {
    const p = useProjectStore.getState().project
    if (selection?.type === 'group') ungroup(selection.id)
    else for (const gid of new Set(selectedDevices.map((id) => p.devices[id]?.layout.groupId).filter(Boolean) as Id[])) ungroup(gid)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target) || document.querySelector('[role="dialog"]')) return
      const s = useUiStore.getState().selection
      const mod = isModKey(e)
      const k = e.key.toLowerCase()
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (s?.type === 'device') deleteDevices(s.ids)
        else if (s?.type === 'connection') deleteConnections(s.ids)
        else if (s?.type === 'group') ungroup(s.id)
        else return
        e.preventDefault()
        select(null)
      } else if (mod && k === 'c' && s?.type === 'device') {
        const p = useProjectStore.getState().project
        const items = s.ids.map((id) => p.devices[id]).filter(Boolean)
        const connections = Object.values(p.connections).filter((c) => s.ids.includes(c.a.deviceId) && s.ids.includes(c.b.deviceId))
        set({ clipboard: { kind: 'devices', items, connections } })
      } else if (mod && k === 'v') {
        const cb = useUiStore.getState().clipboard
        if (cb?.kind !== 'devices') return
        e.preventDefault()
        const ids = duplicateDevices([], { x: 60, y: 60 }, { devices: cb.items, connections: cb.connections })
        select({ type: 'device', ids })
      } else if (mod && k === 'd' && s?.type === 'device') {
        e.preventDefault()
        select({ type: 'device', ids: duplicateDevices(s.ids) })
      } else if (mod && k === 'a') {
        e.preventDefault()
        select({ type: 'device', ids: rf.getNodes().filter((n) => n.type === 'device').map((n) => n.id) })
      } else if (mod && k === 'g') {
        e.preventDefault()
        if (e.shiftKey) ungroupSelected()
        else groupSelected()
      } else if (e.key === 'Escape') {
        select(null)
        setMenu(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const vlans = Object.values(project.vlans).sort((a, b) => a.tag - b.tag)
  const menuDevice = menu?.nodeId ? project.devices[menu.nodeId] : undefined

  const Toggle = ({ k, label }: { k: keyof typeof net; label: string }) => (
    <button
      type="button"
      onClick={() => setNet({ [k]: !net[k] })}
      className={cn('cursor-pointer rounded px-2 py-1 text-xs font-medium', net[k] ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent')}
      data-testid={`net-toggle-${k}`}
    >
      {label}
    </button>
  )

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <NetworkLibrary />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-1 border-b bg-card px-2 py-1.5">
          <div className="flex rounded-md bg-muted p-0.5">
            {VIEWS.map((v) => (
              <Tooltip key={v.id} content={v.hint}>
                <button
                  type="button"
                  onClick={() => set({ networkView: v.id, selection: null })}
                  className={cn('cursor-pointer rounded px-2.5 py-1 text-xs font-medium text-muted-foreground', view === v.id && 'bg-card text-foreground shadow-sm')}
                  data-testid={`net-view-${v.id}`}
                >
                  {v.label}
                </button>
              </Tooltip>
            ))}
          </div>
          <Separator orientation="vertical" className="mx-1" />
          <Toggle k="ip" label="IP" />
          <Toggle k="vlan" label="VLAN" />
          <Toggle k="ports" label="Ports" />
          <Toggle k="speed" label="Speed" />
          {view === 'logical' && <Toggle k="zones" label="Zonen" />}
          <Separator orientation="vertical" className="mx-1" />
          <Tooltip content="Am Raster einrasten">
            <Button size="icon-sm" variant="toggle" active={net.snap} onClick={() => setNet({ snap: !net.snap })}>
              <Magnet />
            </Button>
          </Tooltip>
          <Tooltip content="Mini-Map">
            <Button size="icon-sm" variant="toggle" active={net.minimap} onClick={() => setNet({ minimap: !net.minimap })}>
              <MapIcon />
            </Button>
          </Tooltip>
          <Tooltip content="Auto-Layout (hierarchisch)">
            <Button size="sm" variant="ghost" onClick={autoLayout} data-testid="net-autolayout">
              <LayoutTemplate /> Auto-Layout
            </Button>
          </Tooltip>
          <DropdownMenu>
            <Tooltip content="Ausrichten & verteilen (mind. 2 Geräte auswählen)">
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" disabled={selectedDevices.length < 2}>
                  <AlignStartVertical /> <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
            </Tooltip>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => align('left')}>
                <AlignStartVertical /> Links
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => align('hcenter')}>
                <AlignCenterVertical /> Horizontal zentrieren
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => align('right')}>
                <AlignEndVertical /> Rechts
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => align('top')}>
                <AlignStartHorizontal /> Oben
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => align('vcenter')}>
                <AlignCenterHorizontal /> Vertikal zentrieren
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => align('bottom')}>
                <AlignEndHorizontal /> Unten
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => align('distribute-h')}>
                <AlignHorizontalDistributeCenter /> Horizontal gleich verteilen
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => align('distribute-v')}>
                <AlignVerticalDistributeCenter /> Vertikal gleich verteilen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip content="Auswahl gruppieren (Strg+G)">
            <Button size="icon-sm" variant="ghost" disabled={!selectedDevices.length} onClick={groupSelected}>
              <Group />
            </Button>
          </Tooltip>
          <Tooltip content="Gruppe auflösen (Strg+Shift+G)">
            <Button size="icon-sm" variant="ghost" disabled={!selectedDevices.length && selection?.type !== 'group'} onClick={ungroupSelected}>
              <Ungroup />
            </Button>
          </Tooltip>
          <Tooltip content="Alles einpassen">
            <Button size="icon-sm" variant="ghost" onClick={() => rf.fitView({ padding: 0.12, duration: 300 })}>
              <Maximize />
            </Button>
          </Tooltip>
          <span className="ml-auto hidden text-xs text-muted-foreground 2xl:inline">Port auf Port ziehen zum Verbinden · Shift+Ziehen = Mehrfachauswahl</span>
          <div className="ml-auto 2xl:ml-1">
            <HelpButton section="netzwerk" />
          </div>
        </div>
        <div className="relative min-h-0 flex-1" ref={wrapper} onDragOver={onDragOver} onDrop={onDrop} data-testid="network-canvas">
          <ReactFlow<AnyNode, ConnEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={onNodeDragStop}
            onSelectionChange={onSelectionChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={24}
            selectionMode={SelectionMode.Partial}
            selectionOnDrag={false}
            panOnDrag
            multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
            deleteKeyCode={null}
            snapToGrid={net.snap}
            snapGrid={[20, 20]}
            minZoom={0.1}
            maxZoom={3}
            onlyRenderVisibleElements
            onNodeDoubleClick={(_, n) => n.type === 'device' && project.devices[n.id]?.build && openInHardware(n.id)}
            onNodeContextMenu={(e, n) => {
              e.preventDefault()
              if (n.type !== 'device') return
              if (!selectedDevices.includes(n.id)) select({ type: 'device', ids: [n.id] })
              const r = wrapper.current!.getBoundingClientRect()
              setMenu({ x: e.clientX - r.left, y: e.clientY - r.top, nodeId: n.id })
            }}
            onEdgeContextMenu={(e, edge) => {
              e.preventDefault()
              if (edge.id.startsWith('hosted:')) return
              select({ type: 'connection', ids: [edge.id] })
              const r = wrapper.current!.getBoundingClientRect()
              setMenu({ x: e.clientX - r.left, y: e.clientY - r.top, edgeId: edge.id })
            }}
            onPaneClick={() => setMenu(null)}
            attributionPosition="bottom-center"
            defaultEdgeOptions={{ type: 'conn' }}
            connectionLineStyle={{ stroke: 'var(--primary)', strokeWidth: 2.5, strokeDasharray: '6 4' }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="var(--canvas-grid-strong)" />
            <Controls showInteractive={false} position="bottom-right" />
            {net.minimap && (
              <MiniMap
                pannable
                zoomable
                position="top-right"
                nodeColor={(n) => (n.type === 'device' ? DEVICE_KINDS[project.devices[n.id]?.kind ?? 'server']?.color ?? '#64748b' : 'transparent')}
                nodeStrokeWidth={0}
                maskColor="color-mix(in oklch, var(--background) 70%, transparent)"
                style={{ width: 180, height: 120 }}
              />
            )}
            {vlans.length > 0 && (view === 'logical' || net.vlan) && (
              <Panel position="bottom-left" className="!m-3">
                <div className="rounded-lg border bg-card/95 p-2 shadow-md" data-testid="vlan-legend">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">VLANs</div>
                  {vlans.map((v) => (
                    <button key={v.id} type="button" onClick={() => openVlan(v.id)} className="flex w-full cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-accent">
                      <span className="size-2.5 rounded-sm" style={{ background: v.color }} />
                      <span className="font-semibold tabular-nums">{v.tag}</span>
                      <span className="flex-1 truncate">{v.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{v.subnet}</span>
                    </button>
                  ))}
                </div>
              </Panel>
            )}
            {view === 'physical' && (
              <Panel position="top-left" className="!m-3">
                <div className="flex gap-3 rounded-lg border bg-card/95 px-2.5 py-1.5 text-[10px] text-muted-foreground shadow-sm">
                  <span className="flex items-center gap-1">
                    <span className="h-0.5 w-5 bg-blue-500" /> Kupfer
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-1 w-5 bg-amber-500" /> Glasfaser
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-0.5 w-5 bg-slate-500" /> DAC
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-0.5 w-5 border-t-2 border-dashed border-teal-500" /> WLAN
                  </span>
                </div>
              </Panel>
            )}
          </ReactFlow>
          {menu && (
            <div className="absolute z-20 min-w-48 rounded-lg border bg-popover p-1 text-sm shadow-xl" style={{ left: menu.x, top: menu.y }} onMouseLeave={() => setMenu(null)}>
              {menuDevice && (
                <>
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">{menuDevice.name}</div>
                  {menuDevice.build && (
                    <MenuItem icon={<Wrench />} onClick={() => openInHardware(menuDevice.id)}>
                      Im Hardware Builder öffnen
                    </MenuItem>
                  )}
                  {menuDevice.rackPlacement && (
                    <MenuItem icon={<Server />} onClick={() => showInRack(menuDevice.id)}>
                      Im Rack zeigen
                    </MenuItem>
                  )}
                  <MenuItem icon={<Copy />} onClick={() => select({ type: 'device', ids: duplicateDevices(selectedDevices.length ? selectedDevices : [menuDevice.id]) })}>
                    Duplizieren
                  </MenuItem>
                  <MenuItem icon={<Group />} onClick={groupSelected}>
                    Gruppieren
                  </MenuItem>
                  <MenuItem icon={<EyeOff />} onClick={() => setHiddenInNetwork(selectedDevices.length ? selectedDevices : [menuDevice.id], true)}>
                    Aus Ansicht ausblenden
                  </MenuItem>
                  <MenuItem icon={<Trash2 />} destructive onClick={() => deleteDevices(selectedDevices.length ? selectedDevices : [menuDevice.id])}>
                    Löschen
                  </MenuItem>
                </>
              )}
              {menu.edgeId && (
                <>
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Verbindung</div>
                  <MenuItem icon={<Network />} onClick={() => select({ type: 'connection', ids: [menu.edgeId!] })}>
                    Eigenschaften
                  </MenuItem>
                  <MenuItem icon={<Trash2 />} destructive onClick={() => deleteConnections([menu.edgeId!])}>
                    Verbindung löschen
                  </MenuItem>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )

  function MenuItem({ icon, children, onClick, destructive }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; destructive?: boolean }) {
    return (
      <button
        type="button"
        className={cn('flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent [&_svg]:size-4', destructive && 'text-destructive')}
        onClick={() => {
          onClick()
          setMenu(null)
        }}
      >
        {icon}
        {children}
      </button>
    )
  }
}

export function NetworkEditor() {
  return (
    <ReactFlowProvider>
      <NetworkEditorInner />
    </ReactFlowProvider>
  )
}
