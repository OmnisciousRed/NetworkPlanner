import type { Id } from './common'

export type ConnectionType = 'ethernet' | 'fiber' | 'dac' | 'wifi' | 'virtual' | 'wan' | 'service'

export type ConnectionMedium = 'copper' | 'fiber' | 'wireless' | 'virtual'

export interface ConnectionEndpoint {
  deviceId: Id
  /** NetworkInterface.id; undefined means device-level (logical) link */
  portId?: Id
}

/** A network connection (cable, radio link or logical link) is a first class object. */
export interface Connection {
  id: Id
  a: ConnectionEndpoint
  b: ConnectionEndpoint
  type: ConnectionType
  medium: ConnectionMedium
  /** Mbit/s – undefined = automatically the slowest of both ports */
  speed?: number
  /** VLANs for links without concrete ports (logical links). Port links derive VLANs from the ports. */
  vlanIds?: Id[]
  cableCategory?: string
  lengthM?: number
  cableLabel?: string
  label?: string
  notes?: string
}

export const CONNECTION_TYPE_LABELS: Record<ConnectionType, string> = {
  ethernet: 'Ethernet',
  fiber: 'Glasfaser',
  dac: 'DAC (Direct Attach)',
  wifi: 'WLAN',
  virtual: 'Virtuell',
  wan: 'WAN / Provider',
  service: 'Service-Abhängigkeit',
}

export const MEDIUM_LABELS: Record<ConnectionMedium, string> = {
  copper: 'Kupfer',
  fiber: 'Glasfaser',
  wireless: 'Funk',
  virtual: 'Virtuell',
}

export const CABLE_CATEGORIES = ['Cat5e', 'Cat6', 'Cat6a', 'Cat7', 'Cat8', 'OM3', 'OM4', 'OS2', 'DAC', 'AOC']
