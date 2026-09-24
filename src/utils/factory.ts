import type {
  Chassis,
  ChassisParams,
  ChassisTemplate,
  ComponentTemplate,
  Device,
  DeviceKind,
  DeviceTemplate,
  HardwareComponent,
  MainboardSpecs,
  NetworkInterface,
  NicSpecs,
  PortGroupSpec,
  Project,
  Rack,
  RackStandard,
} from '@/models'
import { SCHEMA_VERSION, nowIso, uid } from '@/models'
import { DEVICE_KINDS } from '@/data/deviceKinds'
import { generateChassisLayout, generateMainboardLayout, pcieCardSize } from './generators'

/* ------------------------------------------------------------------ */
/* Ports                                                               */
/* ------------------------------------------------------------------ */

export function createPort(partial: Partial<NetworkInterface> & Pick<NetworkInterface, 'name' | 'speed' | 'connector'>): NetworkInterface {
  return { id: uid('port'), ipMode: 'none', ...partial }
}

export function createPortsFromGroups(groups: PortGroupSpec[]): NetworkInterface[] {
  const ports: NetworkInterface[] = []
  for (const g of groups) {
    const start = g.startIndex ?? 1
    for (let i = 0; i < g.count; i++) {
      const name = g.count === 1 && !/\s$/.test(g.namePrefix) ? g.namePrefix : `${g.namePrefix}${start + i}`
      ports.push(
        createPort({
          name: name.trim(),
          speed: g.speed,
          connector: g.connector,
          poe: g.poe,
          role: g.role ?? (g.connector === 'WiFi' ? 'wireless' : g.connector === 'Virtual' ? 'virtual' : 'data'),
        }),
      )
    }
  }
  return ports
}

export function createNicPorts(specs: NicSpecs): NetworkInterface[] {
  return Array.from({ length: specs.portCount }, (_, i) =>
    createPort({ name: `Port ${i + 1}`, speed: specs.speed, connector: specs.connector, role: 'data' }),
  )
}

export function createOnboardPorts(specs: MainboardSpecs): NetworkInterface[] {
  return specs.onboardNics.map((n) =>
    createPort({ name: n.name, speed: n.speed, connector: n.connector, role: n.role ?? 'data' }),
  )
}

/* ------------------------------------------------------------------ */
/* Components                                                          */
/* ------------------------------------------------------------------ */

function clone<T>(v: T): T {
  return structuredClone(v)
}

export function createComponent(t: ComponentTemplate, placement = { x: 0, y: 0, rotation: 0 }): HardwareComponent {
  const base = {
    id: uid('cmp'),
    templateId: t.id,
    name: t.name,
    manufacturer: t.manufacturer,
    model: t.model ?? t.name,
    powerW: t.powerW,
    weightKg: t.weightKg,
    placement: { ...placement },
    resizable: t.resizable,
    color: t.color,
  }
  switch (t.kind) {
    case 'mainboard': {
      const specs = clone(t.specs)
      const layout = generateMainboardLayout(specs)
      return { ...base, kind: 'mainboard', specs, size: layout.size, slots: layout.slots, ports: createOnboardPorts(specs) }
    }
    case 'nic': {
      const specs = clone(t.specs)
      return { ...base, kind: 'nic', specs, size: t.size ?? pcieCardSize(specs.lengthMm, specs.lowProfile), ports: createNicPorts(specs) }
    }
    default:
      return { ...base, kind: t.kind, specs: clone(t.specs), size: t.size ?? { w: 80, h: 40 } } as HardwareComponent
  }
}

/* ------------------------------------------------------------------ */
/* Chassis & devices                                                   */
/* ------------------------------------------------------------------ */

export function createChassis(name: string, params: ChassisParams, templateId?: string): Chassis {
  const layout = generateChassisLayout(params)
  return { name, params: clone(params), templateId, size: layout.size, slots: layout.slots }
}

export function createChassisFromTemplate(t: ChassisTemplate): Chassis {
  return createChassis(t.name, t.params, t.id)
}

export function createDeviceFromTemplate(t: DeviceTemplate, overrides: Partial<Device> = {}): Device {
  return {
    id: uid('dev'),
    name: t.name,
    kind: t.kind,
    templateId: t.id,
    manufacturer: t.manufacturer,
    model: t.model,
    formFactor: t.formFactor,
    rackStandard: t.rackStandard,
    heightU: t.heightU,
    widthMm: t.widthMm,
    depthMm: t.depthMm,
    weightKg: t.weightKg,
    powerW: t.powerW,
    driveBays: t.driveBays,
    ups: t.ups ? { ...t.ups } : undefined,
    pdu: t.pdu ? { ...t.pdu } : undefined,
    ports: createPortsFromGroups(t.ports),
    layout: {},
    hiddenInNetwork: !DEVICE_KINDS[t.kind].network,
    ...overrides,
  }
}

/** Creates an empty device with a chassis, ready for the hardware builder. */
export function createBuiltDevice(kind: DeviceKind, name: string, chassis: Chassis): Device {
  const ff = chassis.params.formFactor === 'rack' ? 'rack' : 'tower'
  return {
    id: uid('dev'),
    name,
    kind,
    formFactor: ff,
    heightU: chassis.params.formFactor === 'rack' ? chassis.params.heightU : undefined,
    depthMm: chassis.params.depthMm,
    build: { chassis, components: [], links: [] },
    ports: [],
    layout: {},
    // a drive enclosure has no network ports of its own
    hiddenInNetwork: !DEVICE_KINDS[kind].network || !!chassis.params.driveEnclosure,
  }
}

export function createRack(name: string, heightU = 42, standard: RackStandard = '19'): Rack {
  if (standard === '10') {
    return {
      id: uid('rack'),
      name,
      standard,
      heightU,
      depthMm: 300,
      widthMm: 280,
      maxLoadKg: 30,
      emptyWeightKg: Math.round((heightU * 0.4 + 2) * 10) / 10,
      maxPowerW: 3680,
      airflowM3h: 200,
    }
  }
  return {
    id: uid('rack'),
    name,
    standard,
    heightU,
    depthMm: 1000,
    widthMm: 600,
    maxLoadKg: heightU >= 36 ? 1000 : 600,
    emptyWeightKg: Math.round(heightU * 1.6 + 20),
    maxPowerW: 3680,
    airflowM3h: 1000,
  }
}

export function createProject(name = 'Neues Projekt'): Project {
  const now = nowIso()
  return {
    schemaVersion: SCHEMA_VERSION,
    id: uid('prj'),
    name,
    createdAt: now,
    updatedAt: now,
    devices: {},
    racks: {},
    connections: {},
    vlans: {},
    firewallRules: [],
    dnsRecords: [],
    groups: {},
    customTemplates: { components: [], devices: [], chassis: [] },
    settings: { interVlanDefault: 'deny', energyPrice: 0.35 },
  }
}

/**
 * Deep copy of a device with fresh ids for the device, its components and ports.
 * Mounts and internal links are remapped. Returns the mapping of old → new port ids.
 */
export function cloneDevice(device: Device, nameSuffix = ' (Kopie)'): { device: Device; portMap: Map<string, string> } {
  const copy = clone(device)
  const portMap = new Map<string, string>()
  copy.id = uid('dev')
  copy.name = `${device.name}${nameSuffix}`
  copy.rackPlacement = undefined
  copy.ports = copy.ports.map((p) => {
    const id = uid('port')
    portMap.set(p.id, id)
    return { ...p, id, ipAddress: undefined, macAddress: undefined }
  })
  if (copy.build) {
    const idMap = new Map<string, string>()
    for (const c of copy.build.components) {
      const nid = uid('cmp')
      idMap.set(c.id, nid)
      c.id = nid
      if (c.ports) {
        c.ports = c.ports.map((p) => {
          const id = uid('port')
          portMap.set(p.id, id)
          return { ...p, id, ipAddress: undefined, macAddress: undefined }
        })
      }
    }
    for (const c of copy.build.components) {
      if (c.mount && c.mount.parentId !== 'chassis') {
        const np = idMap.get(c.mount.parentId)
        c.mount = np ? { ...c.mount, parentId: np } : undefined
      }
    }
    copy.build.links = copy.build.links
      .filter((l) => idMap.has(l.fromId) && idMap.has(l.toId))
      .map((l) => ({ ...l, id: uid('lnk'), fromId: idMap.get(l.fromId)!, toId: idMap.get(l.toId)! }))
  }
  return { device: copy, portMap }
}

export const VLAN_COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6', '#84cc16', '#f97316', '#6366f1']
