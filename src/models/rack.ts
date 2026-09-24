import type { Id } from './common'

/** mounting standard: 19" (482.6 mm panels) or 10" (254 mm panels) */
export type RackStandard = '19' | '10'

export interface Rack {
  id: Id
  name: string
  /** undefined = 19" (projects created before 10" support) */
  standard?: RackStandard
  heightU: number
  /** usable mounting depth in mm */
  depthMm: number
  widthMm: number
  maxLoadKg: number
  /** rack's own weight */
  emptyWeightKg: number
  /** available power (e.g. PDU / circuit) in W */
  maxPowerW: number
  /** cooling airflow available in m³/h, used for temperature estimation */
  airflowM3h: number
  location?: string
  notes?: string
}

export interface RackPlacement {
  rackId: Id
  /** lowest occupied unit, 1-based (U1 is at the bottom) */
  positionU: number
  face: 'front' | 'rear'
}

export const RACK_HEIGHTS = [4, 6, 8, 9, 10, 12, 15, 18, 22, 24, 27, 32, 36, 42, 45, 47, 48]

/** selectable heights for a single device (e.g. 8U GPU servers, 10U blade chassis) */
export const DEVICE_HEIGHTS_U = Array.from({ length: 12 }, (_, i) => i + 1)

/** 1 U = 1.75" = 44.45 mm */
export const U_MM = 44.45
/** 19" front panel incl. ears */
export const RACK_PANEL_MM = 482.6

/** front panel width incl. ears per standard */
export const PANEL_MM: Record<RackStandard, number> = { '19': 482.6, '10': 254 }

/** clear width between the rails – what a device body (e.g. on a shelf) may use */
export const INNER_MM: Record<RackStandard, number> = { '19': 450, '10': 222 }

export const RACK_STANDARD_LABEL: Record<RackStandard, string> = { '19': '19 Zoll', '10': '10 Zoll' }

export function rackStandardOf(rack: Pick<Rack, 'standard'>): RackStandard {
  return rack.standard ?? '19'
}
