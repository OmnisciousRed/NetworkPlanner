import type { DeviceCategory, DeviceFormFactor, DeviceKind } from '@/models'

export interface DeviceKindInfo {
  label: string
  category: DeviceCategory
  formFactor: DeviceFormFactor
  /** shown on the network canvas by default */
  network: boolean
  /** can be assembled in the hardware builder */
  buildable: boolean
  /** accent colour */
  color: string
}

export const DEVICE_KINDS: Record<DeviceKind, DeviceKindInfo> = {
  router: { label: 'Router', category: 'network', formFactor: 'desktop', network: true, buildable: true, color: '#0ea5e9' },
  firewall: { label: 'Firewall', category: 'network', formFactor: 'rack', network: true, buildable: true, color: '#ef4444' },
  switch: { label: 'Switch', category: 'network', formFactor: 'desktop', network: true, buildable: true, color: '#6366f1' },
  'managed-switch': { label: 'Managed Switch', category: 'network', formFactor: 'rack', network: true, buildable: true, color: '#6366f1' },
  'poe-switch': { label: 'PoE-Switch', category: 'network', formFactor: 'rack', network: true, buildable: true, color: '#8b5cf6' },
  'access-point': { label: 'Access Point', category: 'network', formFactor: 'wall', network: true, buildable: false, color: '#14b8a6' },
  modem: { label: 'Modem', category: 'network', formFactor: 'desktop', network: true, buildable: false, color: '#64748b' },
  gateway: { label: 'Gateway', category: 'network', formFactor: 'desktop', network: true, buildable: false, color: '#0891b2' },
  'vpn-gateway': { label: 'VPN-Gateway', category: 'network', formFactor: 'desktop', network: true, buildable: true, color: '#0d9488' },

  server: { label: 'Server', category: 'server', formFactor: 'rack', network: true, buildable: true, color: '#2563eb' },
  nas: { label: 'NAS', category: 'server', formFactor: 'rack', network: true, buildable: true, color: '#059669' },
  storage: { label: 'Storage', category: 'server', formFactor: 'rack', network: true, buildable: true, color: '#047857' },
  'raspberry-pi': { label: 'Raspberry Pi', category: 'server', formFactor: 'desktop', network: true, buildable: false, color: '#be185d' },
  'mini-pc': { label: 'Mini-PC', category: 'server', formFactor: 'desktop', network: true, buildable: false, color: '#475569' },
  workstation: { label: 'Workstation', category: 'server', formFactor: 'tower', network: true, buildable: true, color: '#7c3aed' },

  pc: { label: 'PC', category: 'client', formFactor: 'tower', network: true, buildable: true, color: '#475569' },
  laptop: { label: 'Laptop', category: 'client', formFactor: 'portable', network: true, buildable: false, color: '#475569' },
  phone: { label: 'Smartphone', category: 'client', formFactor: 'portable', network: true, buildable: false, color: '#475569' },
  tablet: { label: 'Tablet', category: 'client', formFactor: 'portable', network: true, buildable: false, color: '#475569' },
  tv: { label: 'TV', category: 'client', formFactor: 'desktop', network: true, buildable: false, color: '#475569' },
  console: { label: 'Konsole', category: 'client', formFactor: 'desktop', network: true, buildable: false, color: '#475569' },
  iot: { label: 'IoT-Gerät', category: 'client', formFactor: 'wall', network: true, buildable: false, color: '#ca8a04' },
  printer: { label: 'Drucker', category: 'client', formFactor: 'desktop', network: true, buildable: false, color: '#475569' },

  dns: { label: 'DNS', category: 'service', formFactor: 'virtual', network: true, buildable: false, color: '#0284c7' },
  dhcp: { label: 'DHCP', category: 'service', formFactor: 'virtual', network: true, buildable: false, color: '#0284c7' },
  'reverse-proxy': { label: 'Reverse Proxy', category: 'service', formFactor: 'virtual', network: true, buildable: false, color: '#9333ea' },
  vpn: { label: 'VPN', category: 'service', formFactor: 'virtual', network: true, buildable: false, color: '#0d9488' },
  docker: { label: 'Docker', category: 'service', formFactor: 'virtual', network: true, buildable: false, color: '#2496ed' },
  vm: { label: 'VM', category: 'service', formFactor: 'virtual', network: true, buildable: false, color: '#f97316' },
  kubernetes: { label: 'Kubernetes', category: 'service', formFactor: 'virtual', network: true, buildable: false, color: '#326ce5' },
  app: { label: 'App / Container', category: 'service', formFactor: 'virtual', network: true, buildable: false, color: '#16a34a' },
  cloud: { label: 'Cloud', category: 'service', formFactor: 'virtual', network: true, buildable: false, color: '#38bdf8' },
  internet: { label: 'Internet', category: 'service', formFactor: 'virtual', network: true, buildable: false, color: '#0ea5e9' },

  'patch-panel': { label: 'Patchpanel', category: 'rack', formFactor: 'rack', network: false, buildable: false, color: '#64748b' },
  pdu: { label: 'PDU', category: 'rack', formFactor: 'rack', network: false, buildable: false, color: '#b45309' },
  ups: { label: 'USV', category: 'rack', formFactor: 'rack', network: false, buildable: false, color: '#b45309' },
  shelf: { label: 'Einlegeboden', category: 'rack', formFactor: 'rack', network: false, buildable: false, color: '#64748b' },
  'cable-management': { label: 'Kabelmanagement', category: 'rack', formFactor: 'rack', network: false, buildable: false, color: '#64748b' },
  'blank-panel': { label: 'Blindblende', category: 'rack', formFactor: 'rack', network: false, buildable: false, color: '#64748b' },
}

export const CATEGORY_LABELS: Record<DeviceCategory, string> = {
  network: 'Netzwerk',
  server: 'Server',
  client: 'Clients',
  service: 'Services',
  rack: 'Rack-Infrastruktur',
}

export const BUILDABLE_KINDS: DeviceKind[] = ['server', 'nas', 'workstation', 'pc', 'router', 'firewall', 'switch', 'storage']

export function isServiceKind(kind: DeviceKind) {
  return DEVICE_KINDS[kind].category === 'service'
}

/** infrastructure devices that typically carry multiple VLANs (excluded from VLAN zones) */
export function isInfrastructureKind(kind: DeviceKind) {
  const c = DEVICE_KINDS[kind].category
  return c === 'network'
}
