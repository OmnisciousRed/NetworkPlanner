import type { Device, Id, NetworkInterface, Project, Vlan } from '@/models'
import { getDevicePorts } from './device'

export function parseIp(s: string | undefined | null): number | null {
  if (!s) return null
  const m = /^\s*(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\s*$/.exec(s)
  if (!m) return null
  const parts = m.slice(1).map(Number)
  if (parts.some((p) => p > 255)) return null
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]
}

export function formatIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

export interface CidrInfo {
  network: number
  prefix: number
  mask: number
  broadcast: number
  first: number
  last: number
  /** usable host addresses */
  hosts: number
}

export function parseCidr(s: string | undefined | null): CidrInfo | null {
  if (!s) return null
  const m = /^\s*([\d.]+)\s*\/\s*(\d{1,2})\s*$/.exec(s)
  if (!m) return null
  const ip = parseIp(m[1])
  const prefix = Number(m[2])
  if (ip === null || prefix > 32) return null
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  const network = (ip & mask) >>> 0
  const broadcast = (network | (~mask >>> 0)) >>> 0
  const hosts = prefix >= 31 ? 2 ** (32 - prefix) : 2 ** (32 - prefix) - 2
  return {
    network,
    prefix,
    mask,
    broadcast,
    first: prefix >= 31 ? network : network + 1,
    last: prefix >= 31 ? broadcast : broadcast - 1,
    hosts,
  }
}

export function isValidCidr(s: string): boolean {
  const c = parseCidr(s)
  if (!c) return false
  const ip = parseIp(s.split('/')[0])
  return ip === c.network
}

export function ipInCidr(ip: string | number, cidr: CidrInfo | string): boolean {
  const n = typeof ip === 'number' ? ip : parseIp(ip)
  const c = typeof cidr === 'string' ? parseCidr(cidr) : cidr
  if (n === null || !c) return false
  return ((n & c.mask) >>> 0) === c.network
}

export function maskToString(mask: number): string {
  return formatIp(mask)
}

export interface IpamEntry {
  deviceId: Id
  deviceName: string
  portId: Id
  portName: string
  vlanId?: Id
  ip?: string
  mode: NetworkInterface['ipMode']
  mac?: string
  issues: string[]
}

/** the VLAN in which an interface has its IP (access VLAN / native VLAN / only VLAN) */
export function ipVlanOf(port: NetworkInterface): Id | undefined {
  if (port.vlanMode === 'trunk') return port.nativeVlanId ?? undefined
  return port.vlanIds?.[0]
}

export function collectIpam(project: Project): IpamEntry[] {
  const entries: IpamEntry[] = []
  for (const d of Object.values(project.devices)) {
    for (const dp of getDevicePorts(d)) {
      const p = dp.port
      if (p.role === 'patch') continue
      const vlanId = ipVlanOf(p)
      if (!p.ipAddress && !vlanId && (p.ipMode ?? 'none') === 'none') continue
      entries.push({
        deviceId: d.id,
        deviceName: d.name,
        portId: p.id,
        portName: p.name,
        vlanId,
        ip: p.ipAddress,
        mode: p.ipMode ?? 'none',
        mac: p.macAddress,
        issues: [],
      })
    }
  }
  // validation
  const byIp = new Map<string, IpamEntry[]>()
  for (const e of entries) if (e.ip) byIp.set(e.ip, [...(byIp.get(e.ip) ?? []), e])
  for (const e of entries) {
    const vlan = e.vlanId ? project.vlans[e.vlanId] : undefined
    if (e.ip) {
      if (parseIp(e.ip) === null) e.issues.push('Ungültige IP-Adresse')
      else {
        if ((byIp.get(e.ip)?.length ?? 0) > 1) e.issues.push('IP-Adresse mehrfach vergeben')
        if (vlan?.subnet && !ipInCidr(e.ip, vlan.subnet)) e.issues.push(`Liegt nicht im Subnetz von VLAN ${vlan.tag} (${vlan.subnet})`)
        const c = vlan?.subnet ? parseCidr(vlan.subnet) : null
        const n = parseIp(e.ip)!
        if (c && (n === c.network || n === c.broadcast)) e.issues.push('Netz- oder Broadcast-Adresse')
        if (vlan && e.mode === 'static' && inDhcpRange(vlan, e.ip)) e.issues.push('Statische IP liegt im DHCP-Bereich')
        if (vlan?.gateway && e.ip === vlan.gateway && !isGatewayDevice(project.devices[e.deviceId]))
          e.issues.push('Adresse des Gateways')
      }
    }
  }
  return entries
}

function isGatewayDevice(d?: Device) {
  return !!d && ['router', 'firewall', 'gateway', 'vpn-gateway', 'managed-switch'].includes(d.kind)
}

export function inDhcpRange(vlan: Vlan, ip: string): boolean {
  if (!vlan.dhcp?.enabled) return false
  const s = parseIp(vlan.dhcp.rangeStart)
  const e = parseIp(vlan.dhcp.rangeEnd)
  const n = parseIp(ip)
  if (s === null || e === null || n === null) return false
  return n >= s && n <= e
}

export function usedIps(project: Project): Set<string> {
  const set = new Set<string>()
  for (const d of Object.values(project.devices)) for (const p of getDevicePorts(d)) if (p.port.ipAddress) set.add(p.port.ipAddress)
  for (const v of Object.values(project.vlans)) if (v.gateway) set.add(v.gateway)
  return set
}

/** next free static address in the VLAN subnet (outside of the DHCP range, not gateway) */
export function nextFreeIp(project: Project, vlanId: Id): string | null {
  const vlan = project.vlans[vlanId]
  const c = parseCidr(vlan?.subnet)
  if (!vlan || !c) return null
  const used = usedIps(project)
  for (let n = c.first; n <= c.last; n++) {
    const ip = formatIp(n)
    if (used.has(ip)) continue
    if (inDhcpRange(vlan, ip)) continue
    return ip
  }
  return null
}

export function subnetUsage(project: Project, vlan: Vlan): { used: number; total: number } {
  const c = parseCidr(vlan.subnet)
  if (!c) return { used: 0, total: 0 }
  let used = 0
  for (const ip of usedIps(project)) if (ipInCidr(ip, c)) used++
  return { used, total: c.hosts }
}

export function randomMac(): string {
  const b = Array.from({ length: 6 }, () => Math.floor(Math.random() * 256))
  b[0] = (b[0] & 0xfe) | 0x02 // locally administered, unicast
  return b.map((x) => x.toString(16).padStart(2, '0')).join(':')
}
