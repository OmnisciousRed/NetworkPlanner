import type { Id, Rect, Size } from './common'
import type { ConnectorType, NetworkInterface } from './network'

/* ------------------------------------------------------------------ */
/* Component kinds                                                     */
/* ------------------------------------------------------------------ */

export type ComponentKind =
  | 'mainboard'
  | 'cpu'
  | 'ram'
  | 'storage'
  | 'nic'
  | 'psu'
  | 'fan'
  | 'gpu'
  | 'hba'
  | 'raid'
  | 'pcie'
  | 'bbu'
  | 'custom'

export type MemoryType = 'DDR3' | 'DDR4' | 'DDR5'
export type MainboardFormFactor = 'Mini-ITX' | 'mATX' | 'ATX' | 'E-ATX' | 'SSI-EEB'
export type StorageType = 'hdd' | 'ssd' | 'nvme'
export type StorageFormFactor =
  | '3.5"'
  | '2.5"'
  | 'M.2 2242'
  | 'M.2 2260'
  | 'M.2 2280'
  | 'M.2 22110'
  | 'U.2'
export type StorageInterface = 'SATA' | 'SAS' | 'NVMe'

export const MAINBOARD_FORM_FACTOR_SIZE: Record<MainboardFormFactor, Size> = {
  // landscape: w = along airflow (depth), h = across
  'Mini-ITX': { w: 170, h: 170 },
  mATX: { w: 244, h: 244 },
  ATX: { w: 305, h: 244 },
  'E-ATX': { w: 330, h: 305 },
  'SSI-EEB': { w: 330, h: 305 },
}

/* ------------------------------------------------------------------ */
/* Specs per kind                                                      */
/* ------------------------------------------------------------------ */

export interface CpuSpecs {
  socket: string
  vendor: 'Intel' | 'AMD' | 'Other'
  family: string
  cores: number
  threads: number
  baseClockGHz: number
  boostClockGHz?: number
  tdpW: number
  memoryTypes: MemoryType[]
  maxSockets: number
  pcieLanes?: number
}

export interface RamSpecs {
  memoryType: MemoryType
  capacityGB: number
  speedMTs: number
  ecc: boolean
  registered: boolean
  formFactor: 'DIMM' | 'SO-DIMM'
}

export interface StorageSpecs {
  storageType: StorageType
  formFactor: StorageFormFactor
  interface: StorageInterface
  pcieGen?: number
  capacityGB: number
  rpm?: number
}

export interface PcieCardBase {
  pcieLanes: 1 | 4 | 8 | 16
  pcieGen: number
  lowProfile: boolean
  lengthMm: number
}

export interface NicSpecs extends PcieCardBase {
  portCount: number
  /** Mbit/s per port */
  speed: number
  connector: ConnectorType
  controller?: string
}

export interface GpuSpecs extends PcieCardBase {
  vramGB: number
  slotWidth: 1 | 2 | 3
  outputs?: string
}

export interface StorageControllerSpecs extends PcieCardBase {
  /** number of drives that can be attached directly */
  drivePorts: number
  protocol: 'SAS3' | 'SAS4' | 'SATA' | 'NVMe/SAS/SATA'
  mode: 'IT' | 'RAID'
  raidLevels?: string[]
  cacheGB?: number
  connectors?: string
}

export interface GenericPcieSpecs extends PcieCardBase {
  function: string
}

export interface PsuSpecs {
  watts: number
  efficiency: string
  hotSwap: boolean
  formFactor: 'ATX' | 'SFX' | 'CRPS' | 'Server'
  inputConnector: 'C14' | 'C20' | 'C8'
}

export interface FanSpecs {
  sizeMm: number
  rpm: number
  airflowCFM: number
}

export interface PcieSlotSpec {
  /** physical slot length */
  physical: 1 | 4 | 8 | 16
  /** electrical lanes */
  lanes: 1 | 4 | 8 | 16
  gen: number
  /** CPU index (0-based) the slot is wired to */
  cpu?: number
}

export interface M2SlotSpec {
  /** longest supported module, e.g. 80 for 2280 */
  maxLength: number
  interfaces: StorageInterface[]
  pcieGen?: number
}

export interface OnboardNicSpec {
  name: string
  speed: number
  connector: ConnectorType
  role?: 'data' | 'management'
}

export interface MainboardSpecs {
  formFactor: MainboardFormFactor
  socket: string
  sockets: number
  memoryType: MemoryType
  dimmsPerCpu: number
  /** "RDIMM" server boards need registered memory, "UDIMM" boards unbuffered */
  memoryModule: 'RDIMM' | 'UDIMM'
  eccSupport: boolean
  maxMemoryGB: number
  maxMemorySpeed?: number
  pcieSlots: PcieSlotSpec[]
  m2Slots: M2SlotSpec[]
  sataPorts: number
  /** U.2 / NVMe backplane connectors (e.g. SlimSAS / MCIO) */
  nvmePorts?: number
  onboardNics: OnboardNicSpec[]
  ipmi: boolean
  chipset?: string
}

export interface BbuSpecs {
  capacityF?: number
  type: 'BBU' | 'Supercap'
}

export interface CustomSpecs {
  category: string
  description?: string
}

export interface ComponentSpecsMap {
  mainboard: MainboardSpecs
  cpu: CpuSpecs
  ram: RamSpecs
  storage: StorageSpecs
  nic: NicSpecs
  psu: PsuSpecs
  fan: FanSpecs
  gpu: GpuSpecs
  hba: StorageControllerSpecs
  raid: StorageControllerSpecs
  pcie: GenericPcieSpecs
  bbu: BbuSpecs
  custom: CustomSpecs
}

/* ------------------------------------------------------------------ */
/* Slots                                                               */
/* ------------------------------------------------------------------ */

export type SlotKind =
  | 'cpu'
  | 'dimm'
  | 'pcie'
  | 'm2'
  | 'bay-3.5'
  | 'bay-2.5'
  | 'psu'
  | 'fan'
  | 'mainboard'

export interface SlotMeta {
  socket?: string
  memoryType?: MemoryType
  memoryModule?: 'RDIMM' | 'UDIMM'
  cpuIndex?: number
  /** pcie */
  lanes?: number
  physical?: number
  pcieGen?: number
  order?: number
  /** m2 */
  maxLength?: number
  interfaces?: StorageInterface[]
  /** drive bays */
  nvme?: boolean
  hotSwap?: boolean
  /** mainboard bay */
  formFactors?: MainboardFormFactor[]
  /** fan slot */
  fanSize?: number
  /** psu bay */
  psuFormFactor?: PsuSpecs['formFactor'][]
}

/** A mounting position: chassis bay or mainboard slot. Geometry is in the parent's local coordinates. */
export interface Slot {
  id: Id
  kind: SlotKind
  label: string
  rect: Rect
  /** rotation in degrees around the slot centre */
  rotation?: number
  meta: SlotMeta
}

/* ------------------------------------------------------------------ */
/* Component instances                                                 */
/* ------------------------------------------------------------------ */

export interface Placement {
  x: number
  y: number
  rotation: number
}

export type Mount = { parentId: Id | 'chassis'; slotId: Id }

interface ComponentBase<K extends ComponentKind> {
  id: Id
  kind: K
  templateId?: Id
  name: string
  manufacturer?: string
  model?: string
  notes?: string
  /** typical power draw in W (for cards / drives / fans / boards) */
  powerW: number
  weightKg: number
  /** natural footprint (unrotated) on the canvas, in mm */
  size: Size
  /** free placement in chassis coordinates (used when not mounted) */
  placement: Placement
  mount?: Mount
  groupId?: Id
  /** display colour accent */
  color?: string
  specs: ComponentSpecsMap[K]
  /** mainboards carry their generated slot layout */
  slots?: Slot[]
  /** network interfaces provided by this component (NIC ports, onboard LAN, IPMI) */
  ports?: NetworkInterface[]
  resizable?: boolean
}

export type HardwareComponent = {
  [K in ComponentKind]: ComponentBase<K>
}[ComponentKind]

export type ComponentOf<K extends ComponentKind> = Extract<HardwareComponent, { kind: K }>

export type InternalLinkKind = 'sata' | 'sas' | 'nvme' | 'power' | 'fan' | 'pcie' | 'custom'

/** internal cable / relation between two components (e.g. HDD -> HBA) */
export interface InternalLink {
  id: Id
  fromId: Id
  /** component id or 'mainboard' onboard controller of mainboard component id */
  toId: Id
  kind: InternalLinkKind
  label?: string
}

export function isPcieCard(
  c: HardwareComponent,
): c is ComponentOf<'nic'> | ComponentOf<'gpu'> | ComponentOf<'hba'> | ComponentOf<'raid'> | ComponentOf<'pcie'> {
  return c.kind === 'nic' || c.kind === 'gpu' || c.kind === 'hba' || c.kind === 'raid' || c.kind === 'pcie'
}

export function isStorageController(
  c: HardwareComponent,
): c is ComponentOf<'hba'> | ComponentOf<'raid'> {
  return c.kind === 'hba' || c.kind === 'raid'
}

/* ------------------------------------------------------------------ */
/* Templates (library entries)                                         */
/* ------------------------------------------------------------------ */

export type ComponentTemplate = {
  [K in ComponentKind]: {
    id: Id
    kind: K
    /** library group, e.g. "CPU", "RAM" */
    group: string
    /** library sub group, e.g. "Intel Xeon" */
    subgroup: string
    name: string
    manufacturer?: string
    model?: string
    powerW: number
    weightKg: number
    size?: Size
    specs: ComponentSpecsMap[K]
    custom?: boolean
    resizable?: boolean
    color?: string
    description?: string
  }
}[ComponentKind]
