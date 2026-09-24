import type { Id } from './common'

export interface Rack {
  id: Id
  name: string
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

export const RACK_HEIGHTS = [6, 9, 12, 15, 18, 22, 24, 27, 32, 36, 42, 45, 47, 48]

/** 1 U = 1.75" = 44.45 mm */
export const U_MM = 44.45
/** 19" front panel incl. ears */
export const RACK_PANEL_MM = 482.6
