import type { Id, Point } from './common'
import type { Chassis } from './chassis'
import type { HardwareComponent, InternalLink } from './component'
import type { NetworkInterface, StaticRoute } from './network'
import type { RackPlacement } from './rack'

export type DeviceCategory = 'network' | 'server' | 'client' | 'service' | 'rack'

export type DeviceKind =
  // network
  | 'router'
  | 'firewall'
  | 'switch'
  | 'managed-switch'
  | 'poe-switch'
  | 'access-point'
  | 'modem'
  | 'gateway'
  | 'vpn-gateway'
  // servers
  | 'server'
  | 'nas'
  | 'storage'
  | 'raspberry-pi'
  | 'mini-pc'
  | 'workstation'
  // clients
  | 'pc'
  | 'laptop'
  | 'phone'
  | 'tablet'
  | 'tv'
  | 'console'
  | 'iot'
  | 'printer'
  // services
  | 'dns'
  | 'dhcp'
  | 'reverse-proxy'
  | 'vpn'
  | 'docker'
  | 'vm'
  | 'kubernetes'
  | 'app'
  | 'cloud'
  | 'internet'
  // rack infrastructure
  | 'patch-panel'
  | 'pdu'
  | 'ups'
  | 'shelf'
  | 'cable-management'
  | 'blank-panel'

export type DeviceFormFactor = 'rack' | 'tower' | 'desktop' | 'portable' | 'wall' | 'virtual'

export interface HardwareBuild {
  chassis: Chassis
  components: HardwareComponent[]
  links: InternalLink[]
}

export interface UpsSpecs {
  capacityVA: number
  capacityW: number
  batteryWh: number
}

export interface PduSpecs {
  outlets: number
  maxW: number
}

export interface DeviceLayout {
  /** position on the network canvas (physical & logical view) */
  network?: Point
  /** position on the service view */
  service?: Point
  /** network group (zone) */
  groupId?: Id
}

/**
 * A device is the central object shared by all editors:
 * hardware builder (build), rack builder (rackPlacement) and network designer (ports / layout).
 */
export interface Device {
  id: Id
  name: string
  kind: DeviceKind
  templateId?: Id
  manufacturer?: string
  model?: string
  hostname?: string
  notes?: string
  formFactor: DeviceFormFactor
  /** rack height for non-built rack devices */
  heightU?: number
  widthMm?: number
  depthMm?: number
  /** weight for non-built devices */
  weightKg?: number
  /** typical power draw for non-built devices */
  powerW?: number
  ups?: UpsSpecs
  pdu?: PduSpecs
  /** hardware composition – present for devices assembled in the hardware builder */
  build?: HardwareBuild
  /** fixed ports (switch ports, router ports, client NICs…) */
  ports: NetworkInterface[]
  rackPlacement?: RackPlacement
  layout: DeviceLayout
  /** for services / VMs / containers: device they run on */
  hostDeviceId?: Id
  routes?: StaticRoute[]
  /** hide from the network canvas */
  hiddenInNetwork?: boolean
  color?: string
}

/** Network canvas group / zone */
export interface NetworkGroup {
  id: Id
  name: string
  color: string
  view: 'network' | 'service'
}

/** Template for devices that are not assembled from parts (switches, clients, services, rack gear). */
export interface PortGroupSpec {
  count: number
  speed: number
  connector: NetworkInterface['connector']
  namePrefix: string
  poe?: boolean
  role?: NetworkInterface['role']
  startIndex?: number
}

export interface DeviceTemplate {
  id: Id
  kind: DeviceKind
  name: string
  /** library group */
  group: string
  manufacturer?: string
  model?: string
  formFactor: DeviceFormFactor
  heightU?: number
  depthMm?: number
  weightKg?: number
  powerW?: number
  ports: PortGroupSpec[]
  ups?: UpsSpecs
  pdu?: PduSpecs
  custom?: boolean
  description?: string
}
