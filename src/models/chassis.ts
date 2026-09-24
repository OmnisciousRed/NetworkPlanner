import type { Id, Size } from './common'
import type { MainboardFormFactor, Slot } from './component'

export type ChassisFormFactor = 'rack' | 'tower'

/** Parameters from which a chassis layout is generated (also used for custom chassis). */
export interface ChassisParams {
  formFactor: ChassisFormFactor
  /** rack units, rack chassis only */
  heightU: number
  bays35: number
  bays25: number
  /** how many of the 2.5" bays support U.2 NVMe */
  nvmeBays: number
  hotSwap: boolean
  psuBays: number
  fanSlots: number
  fanSizeMm: number
  mainboardFormFactors: MainboardFormFactor[]
  maxCardHeight: 'full' | 'low-profile'
  maxCardLengthMm: number
  expansionSlots: number
  /** cooling capability per CPU */
  maxCpuTdpW: number
  widthMm: number
  depthMm: number
  heightMm: number
  weightKg: number
}

export interface Chassis {
  templateId?: Id
  name: string
  params: ChassisParams
  /** interior canvas size (landscape: x = front→rear, y = left→right) */
  size: Size
  /** bays: mainboard area, drive bays, PSU bays, fan slots */
  slots: Slot[]
}

export interface ChassisTemplate {
  id: Id
  name: string
  description: string
  params: ChassisParams
  custom?: boolean
}
