import type { Id } from './common'

export type ConnectorType =
  | 'RJ45'
  | 'SFP'
  | 'SFP+'
  | 'SFP28'
  | 'QSFP+'
  | 'QSFP28'
  | 'WiFi'
  | 'Virtual'
  | 'DSL'
  | 'Coax'
  | 'Fiber'

export const CONNECTORS: ConnectorType[] = [
  'RJ45',
  'SFP',
  'SFP+',
  'SFP28',
  'QSFP+',
  'QSFP28',
  'WiFi',
  'Virtual',
  'DSL',
  'Coax',
  'Fiber',
]

export type PortRole = 'data' | 'management' | 'wan' | 'uplink' | 'wireless' | 'patch' | 'virtual'

export type IpMode = 'none' | 'static' | 'dhcp'

export type VlanMode = 'access' | 'trunk'

/**
 * A network interface / port. Used for fixed device ports (switch ports, router ports)
 * and for ports that are provided by hardware components (NICs, onboard LAN).
 * The network editor works exclusively with these objects, so the ports of a
 * server built in the hardware builder are automatically known to the network.
 */
export interface NetworkInterface {
  id: Id
  name: string
  /** Mbit/s */
  speed: number
  connector: ConnectorType
  role?: PortRole
  /** switch port supplies PoE */
  poe?: boolean
  macAddress?: string
  ipMode?: IpMode
  ipAddress?: string
  vlanMode?: VlanMode
  /** references Vlan.id. access mode: first entry is the untagged VLAN */
  vlanIds?: Id[]
  /** trunk: untagged/native VLAN */
  nativeVlanId?: Id
  description?: string
}

export interface DhcpConfig {
  enabled: boolean
  rangeStart?: string
  rangeEnd?: string
  /** device that runs the DHCP service */
  serverDeviceId?: Id
  leaseHours?: number
}

export interface Vlan {
  id: Id
  /** 802.1Q tag 1-4094 */
  tag: number
  name: string
  color: string
  /** CIDR, e.g. 192.168.10.0/24 */
  subnet?: string
  gateway?: string
  dhcp?: DhcpConfig
  dnsServers?: string[]
  domain?: string
  description?: string
}

export type FirewallEndpoint = Id | 'any' | 'internet'

export interface FirewallRule {
  id: Id
  name: string
  action: 'allow' | 'deny'
  source: FirewallEndpoint
  destination: FirewallEndpoint
  protocol: 'any' | 'tcp' | 'udp' | 'icmp'
  ports?: string
  enabled: boolean
  description?: string
}

export interface StaticRoute {
  id: Id
  /** CIDR */
  destination: string
  gateway: string
  metric?: number
  description?: string
}

export interface DnsRecord {
  id: Id
  name: string
  type: 'A' | 'AAAA' | 'CNAME' | 'TXT'
  value: string
}

export const SPEED_OPTIONS = [100, 1000, 2500, 5000, 10000, 25000, 40000, 100000]

export function formatSpeed(mbit?: number): string {
  if (!mbit) return '–'
  if (mbit >= 1000) {
    const g = mbit / 1000
    return `${Number.isInteger(g) ? g : g.toFixed(1)}G`
  }
  return `${mbit}M`
}

export function formatSpeedLong(mbit?: number): string {
  if (!mbit) return '–'
  if (mbit >= 1000) {
    const g = mbit / 1000
    return `${Number.isInteger(g) ? g : g.toFixed(1)} Gbit/s`
  }
  return `${mbit} Mbit/s`
}
