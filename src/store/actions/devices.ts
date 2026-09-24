import type { Connection, Device, DeviceKind, Id, NetworkInterface, Point, Project } from '@/models'
import { uid } from '@/models'
import { findDeviceTemplate } from '@/data/deviceCatalog'
import { DEVICE_KINDS } from '@/data/deviceKinds'
import { cloneDevice, createBuiltDevice, createChassis, createDeviceFromTemplate } from '@/utils/factory'
import type { ChassisParams } from '@/models'
import { findPortMutable, getDevicePorts } from '@/utils/device'
import { commit, getProject, useProjectStore } from '../projectStore'
import { toast, useUiStore } from '../uiStore'

/** removes connections that reference any of the given ports or devices */
export function purgeConnections(draft: Project, opts: { portIds?: Id[]; deviceIds?: Id[] }): number {
  const ports = new Set(opts.portIds ?? [])
  const devices = new Set(opts.deviceIds ?? [])
  let n = 0
  for (const [id, c] of Object.entries(draft.connections)) {
    if (
      devices.has(c.a.deviceId) ||
      devices.has(c.b.deviceId) ||
      (c.a.portId && ports.has(c.a.portId)) ||
      (c.b.portId && ports.has(c.b.portId))
    ) {
      delete draft.connections[id]
      n++
    }
  }
  return n
}

function uniqueName(project: Project, base: string): string {
  const names = new Set(Object.values(project.devices).map((d) => d.name))
  if (!names.has(base)) return base
  const m = /^(.*?)(\s*)(\d+)$/.exec(base)
  const stem = m ? m[1] : base
  const sep = m ? m[2] || ' ' : ' '
  let i = m ? Number(m[3]) + 1 : 2
  const width = m ? m[3].length : 2
  while (names.has(`${stem}${sep}${String(i).padStart(width, '0')}`)) i++
  return `${stem}${sep}${String(i).padStart(width, '0')}`
}

export function nextDeviceName(kind: DeviceKind, base?: string): string {
  const label = base ?? DEVICE_KINDS[kind].label
  return uniqueName(getProject(), /\d+$/.test(label) ? label : `${label} 01`)
}

/** free position on the network canvas below/right of existing nodes */
export function freeNetworkPosition(project: Project, view: 'network' | 'service' = 'network'): Point {
  const pts = Object.values(project.devices)
    .map((d) => d.layout[view])
    .filter((p): p is Point => !!p)
  if (!pts.length) return { x: 80, y: 80 }
  const maxY = Math.max(...pts.map((p) => p.y))
  const row = pts.filter((p) => Math.abs(p.y - maxY) < 60)
  const maxX = Math.max(...row.map((p) => p.x))
  if (maxX < 1400) return { x: maxX + 260, y: maxY }
  return { x: Math.min(...pts.map((p) => p.x)), y: maxY + 220 }
}

export function addDeviceFromTemplate(
  templateId: string,
  opts: { position?: Point; view?: 'network' | 'service'; name?: string; hostDeviceId?: Id; rack?: { rackId: Id; positionU: number } } = {},
): Id | null {
  const project = getProject()
  const t = findDeviceTemplate(templateId, project.customTemplates.devices)
  if (!t) return null
  const view = opts.view ?? (DEVICE_KINDS[t.kind].category === 'service' ? 'service' : 'network')
  const device = createDeviceFromTemplate(t, {
    name: opts.name ?? uniqueName(project, t.kind === 'internet' ? 'Internet' : `${t.name.replace(/\s*\(.*\)$/, '')} 01`),
    hostDeviceId: opts.hostDeviceId,
  })
  if (opts.position) device.layout[view] = opts.position
  if (opts.rack) device.rackPlacement = { rackId: opts.rack.rackId, positionU: opts.rack.positionU, face: 'front' }
  commit(`${device.name} hinzugefügt`, (d) => {
    d.devices[device.id] = device
  })
  return device.id
}

export function createBuiltDeviceAction(kind: DeviceKind, name: string, chassisName: string, params: ChassisParams, templateId?: string): Id {
  const chassis = createChassis(chassisName, params, templateId)
  const device = createBuiltDevice(kind, uniqueName(getProject(), name), chassis)
  commit(`${device.name} erstellt`, (d) => {
    d.devices[device.id] = device
  })
  return device.id
}

export function updateDevice(id: Id, recipe: (d: Device) => void, label = 'Gerät geändert', mergeKey?: string) {
  commit(label, (draft) => {
    const d = draft.devices[id]
    if (d) recipe(d)
  }, { mergeKey })
}

export function deleteDevices(ids: Id[]) {
  if (!ids.length) return
  const project = getProject()
  const names = ids.map((id) => project.devices[id]?.name).filter(Boolean)
  commit(ids.length === 1 ? `${names[0]} gelöscht` : `${ids.length} Geräte gelöscht`, (d) => {
    purgeConnections(d, { deviceIds: ids })
    for (const id of ids) delete d.devices[id]
    for (const dev of Object.values(d.devices)) if (dev.hostDeviceId && ids.includes(dev.hostDeviceId)) dev.hostDeviceId = undefined
  })
  const ui = useUiStore.getState()
  if (ui.hardwareDeviceId && ids.includes(ui.hardwareDeviceId)) ui.set({ hardwareDeviceId: undefined })
  ui.select(null)
  toast(ids.length === 1 ? `„${names[0]}“ gelöscht` : `${ids.length} Geräte gelöscht`, 'info', {
    label: 'Rückgängig',
    run: () => undoAction(),
  })
}

function undoAction() {
  useProjectStore.getState().undo()
}

/** duplicates devices including their hardware build and connections between them */
export function duplicateDevices(ids: Id[], offset: Point = { x: 40, y: 40 }, source?: { devices: Device[]; connections: Connection[] }): Id[] {
  const project = getProject()
  const devices = source?.devices ?? ids.map((id) => project.devices[id]).filter(Boolean)
  const conns = source?.connections ?? Object.values(project.connections)
  const newIds: Id[] = []
  const idMap = new Map<Id, Id>()
  const portMap = new Map<Id, Id>()
  const copies: Device[] = []
  for (const dev of devices) {
    const { device, portMap: pm } = cloneDevice(dev, '')
    device.name = uniqueName({ ...project, devices: { ...project.devices, ...Object.fromEntries(copies.map((c) => [c.id, c])) } }, dev.name)
    for (const v of ['network', 'service'] as const) {
      const p = dev.layout[v]
      if (p) device.layout[v] = { x: p.x + offset.x, y: p.y + offset.y }
    }
    device.layout.groupId = undefined
    idMap.set(dev.id, device.id)
    pm.forEach((v, k) => portMap.set(k, v))
    copies.push(device)
    newIds.push(device.id)
  }
  const newConns: Connection[] = []
  for (const c of conns) {
    const a = idMap.get(c.a.deviceId)
    const b = idMap.get(c.b.deviceId)
    if (!a || !b) continue
    newConns.push({
      ...structuredClone(c),
      id: uid('con'),
      a: { deviceId: a, portId: c.a.portId ? portMap.get(c.a.portId) : undefined },
      b: { deviceId: b, portId: c.b.portId ? portMap.get(c.b.portId) : undefined },
    })
  }
  commit(copies.length === 1 ? `${copies[0].name} dupliziert` : `${copies.length} Geräte dupliziert`, (d) => {
    for (const c of copies) d.devices[c.id] = c
    for (const c of newConns) d.connections[c.id] = c
  })
  return newIds
}

export function setDevicePositions(view: 'network' | 'service', positions: Record<Id, Point>, label = 'Geräte verschoben') {
  commit(label, (d) => {
    for (const [id, p] of Object.entries(positions)) {
      const dev = d.devices[id]
      if (dev) dev.layout[view] = { x: Math.round(p.x), y: Math.round(p.y) }
    }
  })
}

export function updatePort(deviceId: Id, portId: Id, patch: Partial<NetworkInterface>, label = 'Port geändert', mergeKey?: string) {
  commit(label, (d) => {
    const dev = d.devices[deviceId]
    if (!dev) return
    const p = findPortMutable(dev, portId)
    if (p) Object.assign(p, patch)
  }, { mergeKey })
}

export function addDevicePort(deviceId: Id, port: Omit<NetworkInterface, 'id'>) {
  commit('Port hinzugefügt', (d) => {
    d.devices[deviceId]?.ports.push({ ...port, id: uid('port') })
  })
}

export function removeDevicePort(deviceId: Id, portId: Id) {
  commit('Port entfernt', (d) => {
    const dev = d.devices[deviceId]
    if (!dev) return
    dev.ports = dev.ports.filter((p) => p.id !== portId)
    purgeConnections(d, { portIds: [portId] })
  })
}

export function setHiddenInNetwork(ids: Id[], hidden: boolean) {
  commit(hidden ? 'Aus Netzwerkansicht ausgeblendet' : 'In Netzwerkansicht eingeblendet', (d) => {
    for (const id of ids) {
      const dev = d.devices[id]
      if (dev) dev.hiddenInNetwork = hidden
    }
  })
}

/** number of network ports of a device (used for UI hints) */
export function portCount(device: Device) {
  return getDevicePorts(device).length
}
