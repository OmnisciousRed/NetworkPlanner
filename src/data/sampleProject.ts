import type { Connection, Device, HardwareBuild, Id, NetworkInterface, Project, Vlan } from '@/models'
import { uid } from '@/models'
import { findComponentTemplate } from './componentCatalog'
import { findChassisTemplate } from './chassisCatalog'
import { findDeviceTemplate } from './deviceCatalog'
import {
  createBuiltDevice,
  createChassisFromTemplate,
  createComponent,
  createDeviceFromTemplate,
  createProject,
  createRack,
} from '@/utils/factory'
import { addComponent, autoLinkAllDrives, findFreeSlot, mountComponent } from '@/utils/buildOps'
import { getDevicePorts, inferConnectionKind } from '@/utils/device'
import { randomMac } from '@/utils/ip'

function install(build: HardwareBuild, templateId: string, count = 1) {
  const t = findComponentTemplate(templateId)
  if (!t) throw new Error(`template ${templateId} missing`)
  for (let i = 0; i < count; i++) {
    const c = addComponent(build, createComponent(t))
    const slot = findFreeSlot(build, c)
    if (slot) mountComponent(build, c.id, slot)
  }
}

function buildServer(
  name: string,
  kind: Device['kind'],
  chassisId: string,
  parts: [string, number][],
): Device {
  const ct = findChassisTemplate(chassisId)!
  const dev = createBuiltDevice(kind, name, createChassisFromTemplate(ct))
  const build = dev.build!
  for (const [tid, n] of parts) install(build, tid, n)
  autoLinkAllDrives(build)
  return dev
}

function port(dev: Device, name: string): NetworkInterface {
  const p = getDevicePorts(dev).find((x) => x.port.name === name)?.port
  if (!p) throw new Error(`port ${name} missing on ${dev.name}: ${getDevicePorts(dev).map((x) => x.port.name).join(',')}`)
  return p
}

function fromTemplate(templateId: string, name: string, extra: Partial<Device> = {}): Device {
  const t = findDeviceTemplate(templateId)
  if (!t) throw new Error(`device template ${templateId} missing`)
  return createDeviceFromTemplate(t, { name, ...extra })
}

/** A complete example homelab: hardware, rack, network, VLANs, services. */
export function createDemoProject(): Project {
  const p = createProject('Mein Homelab')
  p.description = 'Beispielprojekt: selbst gebaute Server im Rack, VLAN-segmentiertes Netzwerk und Docker-Dienste.'

  /* ---------------- VLANs ---------------- */
  const mkVlan = (tag: number, name: string, color: string, dhcp: boolean): Vlan => ({
    id: uid('vlan'),
    tag,
    name,
    color,
    subnet: `192.168.${tag}.0/24`,
    gateway: `192.168.${tag}.1`,
    dhcp: dhcp ? { enabled: true, rangeStart: `192.168.${tag}.100`, rangeEnd: `192.168.${tag}.199`, leaseHours: 24 } : { enabled: false },
    dnsServers: [`192.168.20.53`],
    domain: 'home.lan',
  })
  const vMgmt = mkVlan(10, 'Management', '#0ea5e9', false)
  const vSrv = mkVlan(20, 'Servers', '#22c55e', false)
  const vIot = mkVlan(30, 'IoT', '#f59e0b', true)
  const vGuest = mkVlan(40, 'Guest', '#ef4444', true)
  const vClient = mkVlan(50, 'Clients', '#a855f7', true)
  vGuest.dnsServers = ['1.1.1.1', '9.9.9.9']
  for (const v of [vMgmt, vSrv, vIot, vGuest, vClient]) p.vlans[v.id] = v

  /* ---------------- Rack ---------------- */
  const rack = createRack('Rack 01', 24)
  rack.depthMm = 800
  rack.maxPowerW = 3680
  p.racks[rack.id] = rack

  /* ---------------- built servers ---------------- */
  const srv1 = buildServer('Proxmox Server 01', 'server', 'ch-2u-nvme', [
    ['mb-x13dei', 1],
    ['cpu-xeon-6430', 2],
    ['ram-ddr5-rdimm-32', 4],
    ['st-nvme-990-1t', 2],
    ['st-u2-7450', 4],
    ['nic-x710-da2', 2],
    ['psu-crps-1600', 2],
    ['fan-60', 6],
  ])
  srv1.hostname = 'pve01'
  srv1.notes = 'Proxmox VE Hypervisor – VMs und Docker-Host.'

  const srv2 = buildServer('Server 02', 'server', 'ch-1u', [
    ['mb-x12sth', 1],
    ['cpu-xeon-e2388g', 1],
    ['ram-ddr4-ecc-udimm-32', 4],
    ['st-nvme-990-2t', 2],
    ['st-ssd-870-1t', 2],
    ['nic-x710-da2', 1],
    ['psu-crps-800', 2],
    ['fan-40', 8],
  ])
  srv2.hostname = 'srv02'

  const nas = buildServer('NAS 01', 'nas', 'ch-2u', [
    ['mb-b650d4u', 1],
    ['cpu-epyc-4464p', 1],
    ['ram-ddr5-ecc-udimm-32', 2],
    ['hba-9300-8i', 1],
    ['st-hdd-20t', 8],
    ['st-nvme-990-1t', 2],
    ['nic-x710-da2', 1],
    ['psu-crps-800', 2],
    ['fan-60', 6],
  ])
  nas.hostname = 'nas01'
  nas.notes = 'TrueNAS SCALE – ZFS RAIDZ2 über 8 × 20 TB.'

  /* ---------------- other devices ---------------- */
  const internet = fromTemplate('svc-internet', 'Internet')
  const modem = fromTemplate('dev-modem', 'Modem')
  const fw = fromTemplate('dev-firewall', 'Firewall', { hostname: 'fw01' })
  const core = fromTemplate('dev-core-switch', 'Core Switch', { hostname: 'core-sw' })
  const poe = fromTemplate('dev-poe-switch', 'Access Switch', { hostname: 'access-sw' })
  const patch = fromTemplate('rack-patch-24', 'Patchpanel 01')
  const cable = fromTemplate('rack-cable-1u', 'Kabelführung 01')
  const ups = fromTemplate('rack-ups-3000', 'USV 01')
  const pdu = fromTemplate('rack-pdu', 'PDU 01')
  const ap = fromTemplate('dev-ap', 'Access Point', { hostname: 'ap-eg' })
  const pc = fromTemplate('dev-pc', 'Arbeitsplatz-PC')
  const laptop = fromTemplate('dev-laptop', 'Laptop')
  const phone = fromTemplate('dev-phone', 'Smartphone')
  const tv = fromTemplate('dev-tv', 'Smart-TV')
  const iot = fromTemplate('dev-iot', 'Smarte Steckdose')

  const docker = fromTemplate('svc-docker', 'Docker', { hostDeviceId: srv1.id })
  const proxy = fromTemplate('svc-proxy', 'Reverse Proxy', { hostDeviceId: srv1.id })
  const ha = fromTemplate('svc-app', 'Home Assistant')
  const grafana = fromTemplate('svc-app', 'Grafana')
  const pihole = fromTemplate('svc-dns', 'Pi-hole')
  const nextcloud = fromTemplate('svc-app', 'Nextcloud')
  for (const s of [ha, grafana, pihole, nextcloud]) s.hostDeviceId = docker.id

  const all = [internet, modem, fw, core, poe, patch, cable, ups, pdu, srv1, srv2, nas, ap, pc, laptop, phone, tv, iot, docker, proxy, ha, grafana, pihole, nextcloud]
  for (const d of all) p.devices[d.id] = d

  /* ---------------- rack placement (24U) ---------------- */
  const place = (d: Device, u: number) => (d.rackPlacement = { rackId: rack.id, positionU: u, face: 'front' })
  place(patch, 24)
  place(cable, 23)
  place(poe, 22)
  place(core, 21)
  place(fw, 19)
  place(srv1, 15)
  place(srv2, 13)
  place(nas, 9)
  place(pdu, 4)
  place(ups, 1)

  /* ---------------- network positions ---------------- */
  const pos = (d: Device, x: number, y: number) => (d.layout.network = { x, y })
  pos(internet, 520, -40)
  pos(modem, 520, 90)
  pos(fw, 470, 210)
  pos(core, 330, 380)
  pos(poe, 900, 380)
  pos(srv1, 40, 620)
  pos(srv2, 380, 620)
  pos(nas, 660, 620)
  pos(ap, 980, 620)
  pos(pc, 1250, 620)
  pos(tv, 1250, 780)
  pos(laptop, 900, 860)
  pos(phone, 1060, 860)
  pos(iot, 1220, 940)
  pos(ups, 1250, 460)

  const spos = (d: Device, x: number, y: number) => (d.layout.service = { x, y })
  spos(internet, 420, 0)
  spos(fw, 390, 130)
  spos(proxy, 400, 280)
  spos(docker, 400, 440)
  spos(ha, 60, 620)
  spos(grafana, 300, 620)
  spos(pihole, 540, 620)
  spos(nextcloud, 780, 620)
  spos(srv1, 340, 800)

  /* ---------------- port configuration ---------------- */
  const cfg = (dev: Device, name: string, patchP: Partial<NetworkInterface>) => Object.assign(port(dev, name), patchP)
  const all5 = [vMgmt.id, vSrv.id, vIot.id, vGuest.id, vClient.id]
  cfg(fw, 'SFP+ 1', { vlanMode: 'trunk', vlanIds: all5, nativeVlanId: vMgmt.id, ipMode: 'static', ipAddress: '192.168.10.1' })
  cfg(fw, 'WAN', { ipMode: 'dhcp' })
  cfg(core, 'SFP+ 1', { vlanMode: 'trunk', vlanIds: all5, nativeVlanId: vMgmt.id })
  cfg(core, 'SFP+ 24', { vlanMode: 'trunk', vlanIds: all5, nativeVlanId: vMgmt.id })
  cfg(poe, 'SFP+ 1', { vlanMode: 'trunk', vlanIds: all5, nativeVlanId: vMgmt.id, ipMode: 'static', ipAddress: '192.168.10.3' })
  for (const n of ['SFP+ 2', 'SFP+ 3', 'SFP+ 4', 'SFP+ 5', 'SFP+ 6']) cfg(core, n, { vlanMode: 'access', vlanIds: [vSrv.id] })
  cfg(core, 'QSFP+ 1', { ipMode: 'static', ipAddress: '192.168.10.2', vlanMode: 'access', vlanIds: [vMgmt.id], description: 'Management' })

  const access = (dev: Device, name: string, vlan: Vlan, ip?: string) =>
    cfg(dev, name, { vlanMode: 'access', vlanIds: [vlan.id], ipMode: ip ? 'static' : 'dhcp', ipAddress: ip, macAddress: randomMac() })
  access(srv1, 'NIC 1', vSrv, '192.168.20.10')
  access(srv1, 'NIC 2', vSrv, '192.168.20.11')
  access(srv1, 'NIC 3', vSrv)
  access(srv1, 'IPMI', vMgmt, '192.168.10.21')
  access(srv2, 'NIC 1', vSrv, '192.168.20.12')
  access(srv2, 'IPMI', vMgmt, '192.168.10.22')
  access(nas, 'NIC 1', vSrv, '192.168.20.20')
  access(nas, 'NIC 2', vSrv, '192.168.20.21')
  access(nas, 'IPMI', vMgmt, '192.168.10.23')
  cfg(ap, 'Uplink', { vlanMode: 'trunk', vlanIds: [vMgmt.id, vIot.id, vGuest.id, vClient.id], nativeVlanId: vMgmt.id, ipMode: 'static', ipAddress: '192.168.10.30' })
  cfg(ap, 'WLAN', { vlanMode: 'trunk', vlanIds: [vIot.id, vGuest.id, vClient.id] })
  for (const [n, v] of [
    ['Port 1', null],
    ['Port 2', vClient],
    ['Port 3', vIot],
    ['Port 21', vMgmt],
    ['Port 22', vMgmt],
    ['Port 23', vMgmt],
    ['Port 24', vMgmt],
  ] as const) {
    if (v) cfg(poe, n, { vlanMode: 'access', vlanIds: [v.id] })
    else cfg(poe, n, { vlanMode: 'trunk', vlanIds: [vMgmt.id, vIot.id, vGuest.id, vClient.id], nativeVlanId: vMgmt.id })
  }
  access(pc, 'LAN', vClient)
  access(tv, 'LAN', vIot)
  access(laptop, 'WLAN', vClient)
  access(phone, 'WLAN', vClient)
  access(iot, 'WLAN', vIot)
  access(ups, 'NMC', vMgmt, '192.168.10.40')
  cfg(proxy, 'vnet', { vlanMode: 'access', vlanIds: [vSrv.id], ipMode: 'static', ipAddress: '192.168.20.80' })
  cfg(pihole, 'vnet', { vlanMode: 'access', vlanIds: [vSrv.id], ipMode: 'static', ipAddress: '192.168.20.53' })
  cfg(docker, 'docker', { vlanMode: 'access', vlanIds: [vSrv.id] })

  /* ---------------- connections ---------------- */
  const link = (
    a: Device,
    ap_: string | null,
    b: Device,
    bp: string | null,
    extra: Partial<Connection> = {},
  ) => {
    const pa = ap_ ? port(a, ap_) : undefined
    const pb = bp ? port(b, bp) : undefined
    const c: Connection = {
      id: uid('con'),
      a: { deviceId: a.id, portId: pa?.id },
      b: { deviceId: b.id, portId: pb?.id },
      ...inferConnectionKind(pa, pb),
      ...extra,
    }
    if (c.medium === 'copper' && c.type === 'ethernet' && !c.cableCategory) c.cableCategory = 'Cat6a'
    if (c.medium === 'fiber' && !c.cableCategory) c.cableCategory = 'DAC'
    p.connections[c.id] = c
    return c
  }
  link(internet, null, modem, 'DSL', { type: 'wan', medium: 'copper', label: 'Glasfaser/DSL 250 Mbit/s' })
  link(modem, 'LAN', fw, 'WAN', { lengthM: 2 })
  link(fw, 'SFP+ 1', core, 'SFP+ 1', { type: 'dac', lengthM: 1, cableLabel: 'C-001' })
  link(core, 'SFP+ 2', srv1, 'NIC 1', { type: 'dac', lengthM: 1, cableLabel: 'C-010' })
  link(core, 'SFP+ 3', srv1, 'NIC 2', { type: 'dac', lengthM: 1, cableLabel: 'C-011' })
  link(core, 'SFP+ 4', srv2, 'NIC 1', { type: 'dac', lengthM: 1, cableLabel: 'C-012' })
  link(core, 'SFP+ 5', nas, 'NIC 1', { type: 'dac', lengthM: 1, cableLabel: 'C-013' })
  link(core, 'SFP+ 6', nas, 'NIC 2', { type: 'dac', lengthM: 1, cableLabel: 'C-014' })
  link(core, 'SFP+ 24', poe, 'SFP+ 1', { type: 'fiber', medium: 'fiber', cableCategory: 'OM4', lengthM: 2, cableLabel: 'C-002' })
  link(poe, 'Port 1', ap, 'Uplink', { lengthM: 15, cableLabel: 'C-101' })
  link(poe, 'Port 2', pc, 'LAN', { lengthM: 20, cableLabel: 'C-102' })
  link(poe, 'Port 3', tv, 'LAN', { lengthM: 12, cableLabel: 'C-103' })
  link(poe, 'Port 21', ups, 'NMC', { lengthM: 1 })
  link(poe, 'Port 22', nas, 'IPMI', { lengthM: 1 })
  link(poe, 'Port 23', srv2, 'IPMI', { lengthM: 1 })
  link(poe, 'Port 24', srv1, 'IPMI', { lengthM: 1 })
  link(ap, 'WLAN', laptop, 'WLAN')
  link(ap, 'WLAN', phone, 'WLAN')
  link(ap, 'WLAN', iot, 'WLAN')

  // service dependencies (logical)
  const svc = (a: Device, b: Device, label?: string) => link(a, null, b, null, { type: 'service', medium: 'virtual', label })
  svc(internet, fw, 'HTTPS 443')
  svc(fw, proxy, 'Port-Forward 443')
  svc(proxy, ha, 'ha.home.lan')
  svc(proxy, grafana, 'grafana.home.lan')
  svc(proxy, nextcloud, 'cloud.example.de')

  /* ---------------- firewall ---------------- */
  const rule = (name: string, action: 'allow' | 'deny', source: Id | 'any' | 'internet', destination: Id | 'any' | 'internet', protocol: 'any' | 'tcp' | 'udp' = 'any', ports?: string) =>
    p.firewallRules.push({ id: uid('fw'), name, action, source, destination, protocol, ports, enabled: true })
  rule('Management darf alles', 'allow', vMgmt.id, 'any')
  rule('Clients → Server (Web, SMB)', 'allow', vClient.id, vSrv.id, 'tcp', '443, 445, 8006')
  rule('DNS für alle', 'allow', 'any', vSrv.id, 'udp', '53')
  rule('IoT → Home Assistant', 'allow', vIot.id, vSrv.id, 'tcp', '8123')
  rule('Alle → Internet', 'allow', 'any', 'internet')
  rule('IoT isolieren', 'deny', vIot.id, 'any')
  rule('Gäste isolieren', 'deny', vGuest.id, 'any')
  rule('Internet → Reverse Proxy', 'allow', 'internet', vSrv.id, 'tcp', '443')

  return p
}

export const DEMO_IDS = { rack: 'Rack 01' }
