import type { Connection, ConnectionEndpoint, FirewallRule, Id, NetworkGroup, Project, Vlan } from '@/models'
import { uid } from '@/models'
import {
  connectionsOfPort,
  findPort,
  findPortMutable,
  getDevicePorts,
  inferConnectionKind,
  isSharedPort,
} from '@/utils/device'
import { VLAN_COLORS } from '@/utils/factory'
import { nextFreeIp } from '@/utils/ip'
import { commit, getProject } from '../projectStore'
import { toast } from '../uiStore'

/* ------------------------------------------------------------------ */
/* Connections                                                         */
/* ------------------------------------------------------------------ */

export interface ConnectResult {
  id?: Id
  error?: string
}

/** chooses a free port of a device for a device-level connection, preferring compatible connectors */
export function pickFreePort(project: Project, deviceId: Id, preferConnector?: string): Id | undefined {
  const device = project.devices[deviceId]
  if (!device) return undefined
  const ports = getDevicePorts(device).filter((p) => p.installed && p.port.role !== 'management')
  const free = ports.filter((p) => isSharedPort(p.port) || !connectionsOfPort(project, deviceId, p.port.id).length)
  const fam = (c?: string) => (!c ? '' : c === 'RJ45' ? 'rj45' : /SFP|QSFP/.test(c) ? 'sfp' : c)
  const match = free.find((p) => fam(p.port.connector) === fam(preferConnector))
  return (match ?? free.find((p) => p.port.connector !== 'Virtual' || preferConnector === 'Virtual') ?? free[0])?.port.id
}

export function validateConnection(project: Project, a: ConnectionEndpoint, b: ConnectionEndpoint): string | null {
  if (a.deviceId === b.deviceId) return 'Ein Gerät kann nicht mit sich selbst verbunden werden'
  const da = project.devices[a.deviceId]
  const db = project.devices[b.deviceId]
  if (!da || !db) return 'Gerät nicht gefunden'
  for (const [dev, end] of [
    [da, a],
    [db, b],
  ] as const) {
    if (!end.portId) continue
    const p = findPort(dev, end.portId)
    if (!p) return 'Port nicht gefunden'
    if (!isSharedPort(p.port) && connectionsOfPort(project, dev.id, end.portId).length)
      return `${dev.name} ${p.port.name} ist bereits belegt`
  }
  const existing = Object.values(project.connections).find(
    (c) =>
      ((c.a.deviceId === a.deviceId && c.b.deviceId === b.deviceId) || (c.a.deviceId === b.deviceId && c.b.deviceId === a.deviceId)) &&
      (c.a.portId ?? '') === (a.portId ?? '') &&
      (c.b.portId ?? '') === (b.portId ?? ''),
  )
  if (existing) return 'Diese Verbindung existiert bereits'
  return null
}

export function connect(a: ConnectionEndpoint, b: ConnectionEndpoint, partial: Partial<Connection> = {}): ConnectResult {
  const project = getProject()
  const err = validateConnection(project, a, b)
  if (err) {
    toast(err, 'error')
    return { error: err }
  }
  const pa = a.portId ? findPort(project.devices[a.deviceId], a.portId)?.port : undefined
  const pb = b.portId ? findPort(project.devices[b.deviceId], b.portId)?.port : undefined
  const kind = inferConnectionKind(pa, pb)
  const conn: Connection = {
    id: uid('con'),
    a,
    b,
    ...kind,
    cableCategory: kind.medium === 'fiber' ? 'OM4' : kind.medium === 'copper' && kind.type === 'ethernet' ? 'Cat6a' : undefined,
    ...partial,
  }
  const na = project.devices[a.deviceId].name
  const nb = project.devices[b.deviceId].name
  commit(`${na}${pa ? ` ${pa.name}` : ''} ↔ ${nb}${pb ? ` ${pb.name}` : ''} verbunden`, (d) => {
    d.connections[conn.id] = conn
    // an access port connected to a switch port without config inherits the switch port VLAN
    const da = d.devices[a.deviceId]
    const db = d.devices[b.deviceId]
    const qa = a.portId ? findPortMutable(da, a.portId) : undefined
    const qb = b.portId ? findPortMutable(db, b.portId) : undefined
    if (qa && qb && !kind.medium.startsWith('wire')) {
      if (qa.vlanIds?.length && !qb.vlanIds?.length && qa.vlanMode !== 'trunk') {
        qb.vlanIds = [...qa.vlanIds]
        qb.vlanMode = 'access'
      } else if (qb.vlanIds?.length && !qa.vlanIds?.length && qb.vlanMode !== 'trunk') {
        qa.vlanIds = [...qb.vlanIds]
        qa.vlanMode = 'access'
      }
    }
  })
  return { id: conn.id }
}

export function updateConnection(id: Id, patch: Partial<Connection>, mergeKey?: string) {
  commit('Verbindung geändert', (d) => {
    const c = d.connections[id]
    if (c) Object.assign(c, patch)
  }, { mergeKey })
}

export function setConnectionEndpointPort(id: Id, side: 'a' | 'b', portId: Id | undefined) {
  const project = getProject()
  const c = project.connections[id]
  if (!c) return
  const end = c[side]
  if (portId) {
    const dev = project.devices[end.deviceId]
    const p = findPort(dev, portId)
    if (p && !isSharedPort(p.port) && connectionsOfPort(project, end.deviceId, portId).some((x) => x.id !== id)) {
      toast(`${dev.name} ${p.port.name} ist bereits belegt`, 'error')
      return
    }
  }
  commit('Verbindungsport geändert', (d) => {
    const cc = d.connections[id]
    if (!cc) return
    cc[side] = { ...cc[side], portId }
    const pa = cc.a.portId ? findPort(d.devices[cc.a.deviceId], cc.a.portId)?.port : undefined
    const pb = cc.b.portId ? findPort(d.devices[cc.b.deviceId], cc.b.portId)?.port : undefined
    Object.assign(cc, inferConnectionKind(pa, pb))
  })
}

export function deleteConnections(ids: Id[]) {
  if (!ids.length) return
  commit(ids.length === 1 ? 'Verbindung gelöscht' : `${ids.length} Verbindungen gelöscht`, (d) => {
    for (const id of ids) delete d.connections[id]
  })
}

/**
 * Sets the VLANs of a link. For port connections the VLANs are written to both ports
 * (1 VLAN = access, several = trunk), so that every view stays consistent.
 */
export function setConnectionVlans(id: Id, vlanIds: Id[]) {
  commit('VLAN der Verbindung geändert', (d) => {
    const c = d.connections[id]
    if (!c) return
    let wrote = false
    for (const end of [c.a, c.b]) {
      const dev = d.devices[end.deviceId]
      const p = dev && end.portId ? findPortMutable(dev, end.portId) : undefined
      if (!p) continue
      wrote = true
      p.vlanIds = [...vlanIds]
      p.vlanMode = vlanIds.length > 1 ? 'trunk' : 'access'
      if (p.vlanMode === 'trunk' && p.nativeVlanId && !vlanIds.includes(p.nativeVlanId)) p.nativeVlanId = undefined
    }
    c.vlanIds = wrote ? undefined : [...vlanIds]
  })
}

/* ------------------------------------------------------------------ */
/* VLANs                                                               */
/* ------------------------------------------------------------------ */

export function addVlan(partial: Partial<Vlan> = {}): Id {
  const project = getProject()
  const tags = new Set(Object.values(project.vlans).map((v) => v.tag))
  let tag = partial.tag ?? 10
  while (tags.has(tag)) tag += 10
  const vlan: Vlan = {
    id: uid('vlan'),
    tag,
    name: partial.name ?? `VLAN ${tag}`,
    color: partial.color ?? VLAN_COLORS[Object.keys(project.vlans).length % VLAN_COLORS.length],
    subnet: partial.subnet ?? `192.168.${tag % 256}.0/24`,
    gateway: partial.gateway ?? `192.168.${tag % 256}.1`,
    dhcp: partial.dhcp ?? { enabled: true, rangeStart: `192.168.${tag % 256}.100`, rangeEnd: `192.168.${tag % 256}.199` },
    dnsServers: partial.dnsServers ?? [`192.168.${tag % 256}.1`],
    ...partial,
  }
  commit(`VLAN ${vlan.tag} erstellt`, (d) => {
    d.vlans[vlan.id] = vlan
  })
  return vlan.id
}

export function updateVlan(id: Id, patch: Partial<Vlan>, mergeKey?: string) {
  if (patch.tag !== undefined) {
    const clash = Object.values(getProject().vlans).find((v) => v.id !== id && v.tag === patch.tag)
    if (clash) {
      toast(`VLAN-Tag ${patch.tag} wird bereits von „${clash.name}“ verwendet`, 'error')
      return
    }
  }
  commit('VLAN geändert', (d) => {
    const v = d.vlans[id]
    if (v) Object.assign(v, patch)
  }, { mergeKey: mergeKey ?? `vlan-${id}-${Object.keys(patch).join(',')}` })
}

export function deleteVlan(id: Id) {
  commit('VLAN gelöscht', (d) => {
    delete d.vlans[id]
    for (const dev of Object.values(d.devices)) {
      const ports = [...dev.ports, ...(dev.build?.components.flatMap((c) => c.ports ?? []) ?? [])]
      for (const p of ports) {
        if (p.vlanIds) p.vlanIds = p.vlanIds.filter((v) => v !== id)
        if (p.nativeVlanId === id) p.nativeVlanId = undefined
      }
    }
    for (const c of Object.values(d.connections)) if (c.vlanIds) c.vlanIds = c.vlanIds.filter((v) => v !== id)
    d.firewallRules = d.firewallRules.filter((r) => r.source !== id && r.destination !== id)
  })
}

/** assigns the next free IP of the port's VLAN */
export function assignNextIp(deviceId: Id, portId: Id, vlanId: Id): string | null {
  const project = getProject()
  const ip = nextFreeIp(project, vlanId)
  if (!ip) {
    toast('Keine freie Adresse im Subnetz', 'error')
    return null
  }
  commit(`IP ${ip} vergeben`, (d) => {
    const p = findPortMutable(d.devices[deviceId], portId)
    if (!p) return
    p.ipAddress = ip
    p.ipMode = 'static'
    if (!p.vlanIds?.length) {
      p.vlanIds = [vlanId]
      p.vlanMode = 'access'
    }
  })
  return ip
}

/* ------------------------------------------------------------------ */
/* Firewall                                                            */
/* ------------------------------------------------------------------ */

export function addFirewallRule(partial: Partial<FirewallRule> = {}) {
  const rule: FirewallRule = {
    id: uid('fw'),
    name: 'Neue Regel',
    action: 'allow',
    source: 'any',
    destination: 'any',
    protocol: 'any',
    enabled: true,
    ...partial,
  }
  commit('Firewall-Regel hinzugefügt', (d) => {
    d.firewallRules.push(rule)
  })
}

export function updateFirewallRule(id: Id, patch: Partial<FirewallRule>) {
  commit('Firewall-Regel geändert', (d) => {
    const r = d.firewallRules.find((x) => x.id === id)
    if (r) Object.assign(r, patch)
  }, { mergeKey: `fw-${id}-${Object.keys(patch).join(',')}` })
}

export function deleteFirewallRule(id: Id) {
  commit('Firewall-Regel gelöscht', (d) => {
    d.firewallRules = d.firewallRules.filter((r) => r.id !== id)
  })
}

export function moveFirewallRule(id: Id, dir: -1 | 1) {
  commit('Firewall-Regel verschoben', (d) => {
    const i = d.firewallRules.findIndex((r) => r.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= d.firewallRules.length) return
    const [r] = d.firewallRules.splice(i, 1)
    d.firewallRules.splice(j, 0, r)
  })
}

/** evaluates the rule set for traffic from → to (first match wins) */
export function evaluateFirewall(project: Project, from: Id | 'internet', to: Id | 'internet'): { action: 'allow' | 'deny'; rule?: FirewallRule } {
  for (const r of project.firewallRules) {
    if (!r.enabled) continue
    const srcOk = r.source === 'any' || r.source === from
    const dstOk = r.destination === 'any' || r.destination === to
    if (srcOk && dstOk) return { action: r.action, rule: r }
  }
  if (from === to) return { action: 'allow' }
  return { action: project.settings.interVlanDefault }
}

/* ------------------------------------------------------------------ */
/* Groups (network zones)                                              */
/* ------------------------------------------------------------------ */

export function createGroup(deviceIds: Id[], view: NetworkGroup['view'], name = 'Gruppe'): Id | null {
  if (deviceIds.length < 1) return null
  const project = getProject()
  const group: NetworkGroup = {
    id: uid('grp'),
    name: `${name} ${Object.keys(project.groups).length + 1}`,
    color: VLAN_COLORS[(Object.keys(project.groups).length + 3) % VLAN_COLORS.length],
    view,
  }
  commit('Gruppe erstellt', (d) => {
    d.groups[group.id] = group
    for (const id of deviceIds) {
      const dev = d.devices[id]
      if (dev) dev.layout.groupId = group.id
    }
  })
  return group.id
}

export function ungroup(groupId: Id) {
  commit('Gruppe aufgelöst', (d) => {
    delete d.groups[groupId]
    for (const dev of Object.values(d.devices)) if (dev.layout.groupId === groupId) dev.layout.groupId = undefined
  })
}

export function updateGroup(id: Id, patch: Partial<NetworkGroup>) {
  commit('Gruppe geändert', (d) => {
    const g = d.groups[id]
    if (g) Object.assign(g, patch)
  }, { mergeKey: `grp-${id}` })
}
