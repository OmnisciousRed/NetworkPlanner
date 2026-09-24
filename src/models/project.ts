import type { Id } from './common'
import type { ChassisTemplate } from './chassis'
import type { ComponentTemplate } from './component'
import type { Connection } from './connection'
import type { Device, DeviceTemplate, NetworkGroup } from './device'
import type { DnsRecord, FirewallRule, Vlan } from './network'
import type { Rack } from './rack'

export const SCHEMA_VERSION = 1

export interface ProjectSettings {
  /** default policy between VLANs when no firewall rule matches */
  interVlanDefault: 'allow' | 'deny'
  /** electricity price for cost estimation (€/kWh) */
  energyPrice: number
}

export interface Project {
  schemaVersion: number
  id: Id
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  devices: Record<Id, Device>
  racks: Record<Id, Rack>
  connections: Record<Id, Connection>
  vlans: Record<Id, Vlan>
  firewallRules: FirewallRule[]
  dnsRecords: DnsRecord[]
  groups: Record<Id, NetworkGroup>
  customTemplates: {
    components: ComponentTemplate[]
    devices: DeviceTemplate[]
    chassis: ChassisTemplate[]
  }
  settings: ProjectSettings
}

export interface ProjectMeta {
  id: Id
  name: string
  updatedAt: string
  deviceCount: number
}
