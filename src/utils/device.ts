import type { Connection, Device, HardwareComponent, Id, NetworkInterface, Project } from '@/models'
import { formatSpeed } from '@/models'
import { DEVICE_KINDS } from '@/data/deviceKinds'
import { estimateBuildPower } from './buildSummary'

export interface DevicePort {
  port: NetworkInterface
  source: 'device' | 'component'
  componentId?: Id
  componentName?: string
  /** false if the providing component lies loose in the tray */
  installed: boolean
}

/** All network interfaces of a device: fixed ports + ports of installed hardware components. */
export function getDevicePorts(device: Device): DevicePort[] {
  const out: DevicePort[] = device.ports.map((port) => ({ port, source: 'device', installed: true }))
  if (device.build) {
    const comps: HardwareComponent[] = [...device.build.components].sort((a, b) =>
      a.kind === 'mainboard' ? -1 : b.kind === 'mainboard' ? 1 : 0,
    )
    for (const c of comps) {
      for (const port of c.ports ?? []) {
        out.push({ port, source: 'component', componentId: c.id, componentName: c.name, installed: !!c.mount })
      }
    }
  }
  return out
}

export function findPort(device: Device, portId: Id | undefined): DevicePort | undefined {
  if (!portId) return undefined
  return getDevicePorts(device).find((p) => p.port.id === portId)
}

/** mutable reference to a port inside a (draft) device */
export function findPortMutable(device: Device, portId: Id): NetworkInterface | undefined {
  const p = device.ports.find((x) => x.id === portId)
  if (p) return p
  for (const c of device.build?.components ?? []) {
    const q = c.ports?.find((x) => x.id === portId)
    if (q) return q
  }
  return undefined
}

export function portLabel(p: NetworkInterface): string {
  return `${p.name} · ${formatSpeed(p.speed)} ${p.connector}`
}

export function getDeviceHeightU(device: Device): number | null {
  if (device.build) {
    return device.build.chassis.params.formFactor === 'rack' ? device.build.chassis.params.heightU : device.heightU ?? null
  }
  if (device.formFactor === 'rack') return device.heightU ?? 1
  return device.heightU ?? null
}

export function isRackable(device: Device): boolean {
  return getDeviceHeightU(device) !== null && DEVICE_KINDS[device.kind].category !== 'service'
}

export function getDevicePower(device: Device, load: 'idle' | 'typical' | 'max' = 'typical'): number {
  if (device.build) {
    const p = estimateBuildPower(device.build)
    return load === 'idle' ? p.idleW : load === 'max' ? p.maxW : p.typicalW
  }
  const base = device.powerW ?? 0
  return Math.round(load === 'idle' ? base * 0.6 : load === 'max' ? base * 1.3 : base)
}

export function getDeviceWeight(device: Device): number {
  if (device.build) {
    const w = device.build.chassis.params.weightKg + device.build.components.reduce((s, c) => s + c.weightKg, 0)
    return Math.round(w * 10) / 10
  }
  return device.weightKg ?? 0
}

export function getDeviceDepth(device: Device): number | undefined {
  return device.build?.chassis.params.depthMm ?? device.depthMm
}

/* ------------------------------------------------------------------ */
/* Connections                                                         */
/* ------------------------------------------------------------------ */

export function connectionsOfDevice(project: Project, deviceId: Id): Connection[] {
  return Object.values(project.connections).filter((c) => c.a.deviceId === deviceId || c.b.deviceId === deviceId)
}

export function connectionOfPort(project: Project, deviceId: Id, portId: Id): Connection | undefined {
  return Object.values(project.connections).find(
    (c) => (c.a.deviceId === deviceId && c.a.portId === portId) || (c.b.deviceId === deviceId && c.b.portId === portId),
  )
}

export function connectionsOfPort(project: Project, deviceId: Id, portId: Id): Connection[] {
  return Object.values(project.connections).filter(
    (c) => (c.a.deviceId === deviceId && c.a.portId === portId) || (c.b.deviceId === deviceId && c.b.portId === portId),
  )
}

/** the other side of a connection seen from `deviceId` */
export function otherEnd(c: Connection, deviceId: Id, portId?: Id) {
  if (c.a.deviceId === deviceId && (portId === undefined || c.a.portId === portId)) return c.b
  return c.a
}

export function effectiveSpeed(project: Project, c: Connection): number | undefined {
  if (c.speed) return c.speed
  const da = project.devices[c.a.deviceId]
  const db = project.devices[c.b.deviceId]
  const pa = da && findPort(da, c.a.portId)?.port
  const pb = db && findPort(db, c.b.portId)?.port
  const speeds = [pa?.speed, pb?.speed].filter((s): s is number => !!s && s > 0)
  return speeds.length ? Math.min(...speeds) : undefined
}

/** VLANs carried by a connection: union of both port configs (or connection override) */
export function connectionVlans(project: Project, c: Connection): Id[] {
  const set = new Set<Id>(c.vlanIds ?? [])
  for (const end of [c.a, c.b]) {
    const d = project.devices[end.deviceId]
    const p = d && findPort(d, end.portId)?.port
    p?.vlanIds?.forEach((v) => set.add(v))
    if (p?.nativeVlanId) set.add(p.nativeVlanId)
  }
  return [...set].filter((v) => project.vlans[v])
}

export function inferConnectionKind(a?: NetworkInterface, b?: NetworkInterface): Pick<Connection, 'type' | 'medium'> {
  const cons = [a?.connector, b?.connector]
  if (cons.includes('WiFi')) return { type: 'wifi', medium: 'wireless' }
  if (cons.includes('Virtual')) return { type: 'virtual', medium: 'virtual' }
  if (cons.includes('DSL') || cons.includes('Coax')) return { type: 'wan', medium: 'copper' }
  const fiberish = (c?: string) => !!c && /SFP|QSFP|Fiber/.test(c)
  if (fiberish(a?.connector) && fiberish(b?.connector)) return { type: 'fiber', medium: 'fiber' }
  if (!a && !b) return { type: 'ethernet', medium: 'copper' }
  return { type: 'ethernet', medium: 'copper' }
}

/** ports that may carry more than one connection */
export function isSharedPort(p?: NetworkInterface): boolean {
  return !!p && (p.connector === 'WiFi' || p.connector === 'Virtual')
}

export function connectorCompatibility(a?: NetworkInterface, b?: NetworkInterface): string | null {
  if (!a || !b) return null
  const wifi = [a.connector, b.connector].filter((c) => c === 'WiFi').length
  if (wifi === 1) return null
  const fam = (c: string) => (c === 'RJ45' ? 'rj45' : /SFP|QSFP|Fiber/.test(c) ? 'sfp' : c)
  if (fam(a.connector) !== fam(b.connector)) {
    if ((fam(a.connector) === 'rj45' && fam(b.connector) === 'sfp') || (fam(a.connector) === 'sfp' && fam(b.connector) === 'rj45'))
      return 'RJ45 ↔ SFP: benötigt ein RJ45-SFP-Modul (Transceiver)'
    return `Unterschiedliche Anschlüsse (${a.connector} ↔ ${b.connector})`
  }
  if (a.connector !== b.connector && fam(a.connector) === 'sfp') return `${a.connector} ↔ ${b.connector}: Geschwindigkeit wird auf das langsamere Modul begrenzt`
  return null
}

export function deviceDisplayType(device: Device): string {
  return DEVICE_KINDS[device.kind].label
}

/** primary IP of a device (first interface with an address) */
export function primaryIp(device: Device): string | undefined {
  return getDevicePorts(device).find((p) => p.port.ipAddress)?.port.ipAddress
}
