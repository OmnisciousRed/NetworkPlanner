import type {
  ChassisParams,
  MainboardFormFactor,
  MainboardSpecs,
  Size,
  Slot,
  StorageFormFactor,
} from '@/models'
import { MAINBOARD_FORM_FACTOR_SIZE } from '@/models'

/* ------------------------------------------------------------------ */
/* Geometry constants (canvas units ≈ mm)                               */
/* ------------------------------------------------------------------ */

export const DIMM_LEN = 133
export const DIMM_THICK = 7
export const DIMM_PITCH = 9
export const PCIE_PITCH = 18
export const PCIE_THICK = 7
export const M2_WIDTH = 22
export const M2_PITCH = 28

export const PCIE_SLOT_LEN: Record<number, number> = { 1: 25, 4: 39, 8: 56, 16: 89 }

interface SocketGeometry {
  socket: Size
  cpu: Size
}

const SOCKETS: Record<string, SocketGeometry> = {
  LGA4677: { socket: { w: 84, h: 66 }, cpu: { w: 77.5, h: 56.5 } },
  LGA4189: { socket: { w: 82, h: 62 }, cpu: { w: 77.5, h: 56.5 } },
  LGA3647: { socket: { w: 80, h: 62 }, cpu: { w: 76, h: 56.5 } },
  SP5: { socket: { w: 80, h: 78 }, cpu: { w: 75.4, h: 72 } },
  SP3: { socket: { w: 80, h: 64 }, cpu: { w: 75.4, h: 58.5 } },
  LGA1700: { socket: { w: 52, h: 44 }, cpu: { w: 45, h: 37.5 } },
  LGA1851: { socket: { w: 52, h: 44 }, cpu: { w: 45, h: 37.5 } },
  LGA1200: { socket: { w: 44, h: 44 }, cpu: { w: 37.5, h: 37.5 } },
  AM5: { socket: { w: 46, h: 46 }, cpu: { w: 40, h: 40 } },
  AM4: { socket: { w: 46, h: 46 }, cpu: { w: 40, h: 40 } },
}

export function socketGeometry(socket: string): SocketGeometry {
  return SOCKETS[socket] ?? { socket: { w: 60, h: 60 }, cpu: { w: 52, h: 52 } }
}

export function cpuSizeForSocket(socket: string): Size {
  return { ...socketGeometry(socket).cpu }
}

const CHANNEL_LETTERS = 'ABCDEFGHIJKLMNOP'

function dimmLabel(sockets: number, cpu: number, index: number, dimmsPerCpu: number): string {
  // desktop boards: 2 DIMMs per channel (A1 A2 B1 B2); server boards: 1 DIMM per channel
  const perChannel = dimmsPerCpu <= 4 && sockets === 1 ? 2 : 1
  const channels = Math.ceil(dimmsPerCpu / perChannel)
  const letter = CHANNEL_LETTERS[(cpu * channels + Math.floor(index / perChannel)) % CHANNEL_LETTERS.length]
  const num = (index % perChannel) + 1
  return sockets > 1 ? `P${cpu + 1}-${letter}${num}` : `DIMM ${letter}${num}`
}

export interface MainboardLayout {
  size: Size
  slots: Slot[]
}

/**
 * Generates the graphical slot layout of a mainboard from its specs.
 * Landscape orientation: x = front → rear (rear I/O on the right), y = across.
 */
export function generateMainboardLayout(specs: MainboardSpecs): MainboardLayout {
  const nominal = MAINBOARD_FORM_FACTOR_SIZE[specs.formFactor] ?? { w: 305, h: 244 }
  const geo = socketGeometry(specs.socket)
  const slots: Slot[] = []
  const sockets = Math.max(1, specs.sockets)
  const dimms = Math.max(0, specs.dimmsPerCpu)
  const top = Math.ceil(dimms / 2)
  const bottom = Math.floor(dimms / 2)
  const unitW = Math.max(DIMM_LEN, geo.socket.w)
  const unitH = top * DIMM_PITCH + 6 + geo.socket.h + 6 + bottom * DIMM_PITCH
  const startX = 22
  const startY = 14
  const unitGap = 20
  const unitsRight = startX + sockets * unitW + (sockets - 1) * unitGap

  const m2Count = specs.m2Slots.length
  const m2MaxLen = Math.max(0, ...specs.m2Slots.map((m) => m.maxLength))
  const m2Beside = m2Count > 0 && m2Count * M2_PITCH <= unitH + 4
  const rearIo = 40
  const widthNeeded = unitsRight + (m2Beside ? 18 + m2MaxLen : 0) + rearIo
  const w = Math.max(nominal.w, widthNeeded)

  for (let s = 0; s < sockets; s++) {
    const ux = startX + s * (unitW + unitGap)
    // DIMMs above socket
    for (let i = 0; i < dimms; i++) {
      const isTop = i < top
      const row = isTop ? i : i - top
      const y = isTop
        ? startY + row * DIMM_PITCH
        : startY + top * DIMM_PITCH + 6 + geo.socket.h + 6 + row * DIMM_PITCH
      slots.push({
        id: `dimm-${s}-${i}`,
        kind: 'dimm',
        label: dimmLabel(sockets, s, i, dimms),
        rect: { x: ux + (unitW - DIMM_LEN) / 2, y, w: DIMM_LEN, h: DIMM_THICK },
        meta: {
          memoryType: specs.memoryType,
          memoryModule: specs.memoryModule,
          cpuIndex: s,
          order: i,
        },
      })
    }
    slots.push({
      id: `cpu-${s}`,
      kind: 'cpu',
      label: sockets > 1 ? `CPU ${s + 1} (${specs.socket})` : `CPU-Sockel (${specs.socket})`,
      rect: {
        x: ux + (unitW - geo.socket.w) / 2,
        y: startY + top * DIMM_PITCH + 6,
        w: geo.socket.w,
        h: geo.socket.h,
      },
      meta: { socket: specs.socket, cpuIndex: s },
    })
  }

  let cursorY = startY + unitH + 14
  specs.m2Slots.forEach((m2, i) => {
    const x = m2Beside ? unitsRight + 18 : startX + i * (m2.maxLength + 14)
    const y = m2Beside ? startY + i * M2_PITCH : cursorY
    slots.push({
      id: `m2-${i}`,
      kind: 'm2',
      label: `M.2_${i + 1}`,
      rect: { x, y, w: m2.maxLength, h: M2_WIDTH },
      meta: { maxLength: m2.maxLength, interfaces: m2.interfaces, pcieGen: m2.pcieGen, order: i },
    })
  })
  if (m2Count > 0 && !m2Beside) cursorY += M2_PITCH + 6

  specs.pcieSlots.forEach((p, i) => {
    const len = PCIE_SLOT_LEN[p.physical] ?? 89
    slots.push({
      id: `pcie-${i}`,
      kind: 'pcie',
      label: `PCIe ${i + 1} (x${p.physical}${p.lanes !== p.physical ? ` @x${p.lanes}` : ''} Gen${p.gen})`,
      rect: { x: w - rearIo - len, y: cursorY + i * PCIE_PITCH, w: len, h: PCIE_THICK },
      meta: {
        lanes: p.lanes,
        physical: p.physical,
        pcieGen: p.gen,
        cpuIndex: p.cpu ?? 0,
        order: i,
      },
    })
  })
  cursorY += specs.pcieSlots.length * PCIE_PITCH + 10
  const h = Math.max(nominal.h, cursorY)
  return { size: { w, h }, slots }
}

/* ------------------------------------------------------------------ */
/* Chassis                                                             */
/* ------------------------------------------------------------------ */

export const BAY_35 = { w: 150, h: 101 }
export const BAY_35_TOWER = { w: 150, h: 28 }
export const BAY_25 = { w: 102, h: 15 }
export const PSU_RACK = { w: 190, h: 76 }
export const PSU_SFX = { w: 125, h: 64 }
export const PSU_TOWER = { w: 150, h: 86 }

function bayFor(ff: MainboardFormFactor[]): Size {
  let w = 170
  let h = 170
  for (const f of ff) {
    const s = MAINBOARD_FORM_FACTOR_SIZE[f]
    w = Math.max(w, s.w)
    h = Math.max(h, s.h)
  }
  if (ff.includes('E-ATX') || ff.includes('SSI-EEB')) {
    w = Math.max(w, 350)
    h = Math.max(h, 330)
  }
  return { w, h }
}

export interface ChassisLayout {
  size: Size
  slots: Slot[]
}

export function generateChassisLayout(p: ChassisParams): ChassisLayout {
  return p.formFactor === 'tower' ? generateTower(p) : generateRack(p)
}

function generateRack(p: ChassisParams): ChassisLayout {
  const slots: Slot[] = []
  const bay = bayFor(p.mainboardFormFactors)
  const margin = 12
  const ten = p.rackStandard === '10'
  const psu = ten ? PSU_SFX : PSU_RACK
  // drive enclosures (HDD bay unit / JBOD) have no mainboard
  const board = p.driveEnclosure ? { w: 0, h: 0 } : bay
  // interior "height" of the top view is the usable width: ~430 mm for 19", ~210 mm for 10"
  const H = Math.max(ten ? 230 : 440, margin + board.h + 10 + psu.h + margin)
  const inner = H - 2 * margin

  // --- drive cage (front, left)
  let x = margin
  const rows35 = Math.max(1, Math.floor((inner + 4) / (BAY_35.h + 4)))
  const cols35 = Math.ceil(p.bays35 / rows35)
  for (let i = 0; i < p.bays35; i++) {
    const col = Math.floor(i / rows35)
    const row = i % rows35
    const rowsInCol = Math.min(rows35, p.bays35 - col * rows35)
    const offY = margin + (inner - (rowsInCol * (BAY_35.h + 4) - 4)) / 2
    slots.push({
      id: `bay35-${i}`,
      kind: 'bay-3.5',
      label: `Bay ${i} (3.5")`,
      rect: { x: x + col * (BAY_35.w + 6), y: offY + row * (BAY_35.h + 4), w: BAY_35.w, h: BAY_35.h },
      meta: { hotSwap: p.hotSwap, order: i },
    })
  }
  if (p.bays35 > 0) x += cols35 * (BAY_35.w + 6)
  const pitch25 = BAY_25.h + 2
  const rows25 = Math.max(1, Math.floor((inner + 2) / pitch25))
  const cols25 = Math.ceil(p.bays25 / rows25)
  for (let i = 0; i < p.bays25; i++) {
    const col = Math.floor(i / rows25)
    const row = i % rows25
    const rowsInCol = Math.min(rows25, p.bays25 - col * rows25)
    const offY = margin + (inner - (rowsInCol * pitch25 - 2)) / 2
    const idx = p.bays35 + i
    slots.push({
      id: `bay25-${i}`,
      kind: 'bay-2.5',
      label: `Bay ${idx} (2.5"${i < p.nvmeBays ? ' NVMe' : ''})`,
      rect: { x: x + col * (BAY_25.w + 6), y: offY + row * pitch25, w: BAY_25.w, h: BAY_25.h },
      meta: { hotSwap: p.hotSwap, nvme: i < p.nvmeBays, order: idx },
    })
  }
  if (p.bays25 > 0) x += cols25 * (BAY_25.w + 6)
  if (p.bays35 + p.bays25 === 0) x += 40

  // --- fan wall
  x += 12
  const fanDepth = 38
  if (p.fanSlots > 0) {
    const fanH = Math.min(p.fanSizeMm, (inner - (p.fanSlots - 1) * 6) / p.fanSlots)
    const total = p.fanSlots * fanH + (p.fanSlots - 1) * 6
    const offY = margin + (inner - total) / 2
    for (let i = 0; i < p.fanSlots; i++) {
      slots.push({
        id: `fan-${i}`,
        kind: 'fan',
        label: `Lüfter ${i + 1}`,
        rect: { x, y: offY + i * (fanH + 6), w: fanDepth, h: fanH },
        meta: { fanSize: p.fanSizeMm, order: i },
      })
    }
    x += fanDepth + 16
  }

  // --- mainboard bay
  const boardX = x
  if (!p.driveEnclosure)
    slots.push({
      id: 'mainboard',
      kind: 'mainboard',
      label: `Mainboard (${p.mainboardFormFactors.join(' / ')})`,
      rect: { x: boardX, y: margin, w: bay.w, h: bay.h },
      meta: { formFactors: p.mainboardFormFactors },
    })

  const psuTotal = p.psuBays * (psu.w + 8) - 8
  const W = boardX + Math.max(board.w, psuTotal, p.driveEnclosure ? 60 : 0) + margin + 14

  // --- PSU bays (rear, below the board)
  for (let i = 0; i < p.psuBays; i++) {
    slots.push({
      id: `psu-${i}`,
      kind: 'psu',
      label: `Netzteil ${i + 1}`,
      rect: {
        x: W - 14 - margin - (i + 1) * (psu.w + 8) + 8,
        y: H - margin - psu.h,
        w: psu.w,
        h: psu.h,
      },
      meta: { psuFormFactor: ten ? ['SFX', 'Server'] : ['CRPS', 'Server'], hotSwap: p.hotSwap, order: i },
    })
  }

  return { size: { w: W, h: H }, slots }
}

function generateTower(p: ChassisParams): ChassisLayout {
  const slots: Slot[] = []
  const bay = bayFor(p.mainboardFormFactors)
  const margin = 12
  const fanDepth = 26
  const cageX = margin + fanDepth + 14
  const cage35H = p.bays35 * (BAY_35_TOWER.h + 4)
  const cage25H = p.bays25 * (BAY_25.h + 5)
  const lowerH = Math.max(cage35H + cage25H + (p.bays25 ? 10 : 0), PSU_TOWER.h)
  const H = Math.max(470, margin + bay.h + 16 + lowerH + margin)
  const W = Math.max(470, cageX + bay.w + margin, cageX + BAY_35.w + 16 + p.psuBays * (PSU_TOWER.w + 8) + margin)

  // fans at the front
  if (p.fanSlots > 0) {
    const fanH = Math.min(p.fanSizeMm, (H - 2 * margin - (p.fanSlots - 1) * 10) / p.fanSlots)
    for (let i = 0; i < p.fanSlots; i++) {
      slots.push({
        id: `fan-${i}`,
        kind: 'fan',
        label: `Lüfter ${i + 1}`,
        rect: { x: margin, y: margin + 8 + i * (fanH + 10), w: fanDepth, h: fanH },
        meta: { fanSize: p.fanSizeMm, order: i },
      })
    }
  }

  if (!p.driveEnclosure)
    slots.push({
      id: 'mainboard',
      kind: 'mainboard',
      label: `Mainboard (${p.mainboardFormFactors.join(' / ')})`,
      rect: { x: W - margin - bay.w, y: margin, w: bay.w, h: bay.h },
      meta: { formFactors: p.mainboardFormFactors },
    })

  slots.push({
    id: 'psu-0',
    kind: 'psu',
    label: 'Netzteil',
    rect: { x: W - margin - PSU_TOWER.w, y: H - margin - PSU_TOWER.h, w: PSU_TOWER.w, h: PSU_TOWER.h },
    meta: { psuFormFactor: ['ATX', 'SFX'], order: 0 },
  })
  for (let i = 1; i < p.psuBays; i++) {
    slots.push({
      id: `psu-${i}`,
      kind: 'psu',
      label: `Netzteil ${i + 1}`,
      rect: {
        x: W - margin - PSU_TOWER.w - i * (PSU_TOWER.w + 8),
        y: H - margin - PSU_TOWER.h,
        w: PSU_TOWER.w,
        h: PSU_TOWER.h,
      },
      meta: { psuFormFactor: ['ATX', 'SFX'], order: i },
    })
  }

  for (let i = 0; i < p.bays35; i++) {
    slots.push({
      id: `bay35-${i}`,
      kind: 'bay-3.5',
      label: `Schacht ${i} (3.5")`,
      rect: {
        x: cageX,
        y: H - margin - (i + 1) * (BAY_35_TOWER.h + 4) + 4,
        w: BAY_35_TOWER.w,
        h: BAY_35_TOWER.h,
      },
      meta: { hotSwap: p.hotSwap, order: i },
    })
  }
  const base25 = H - margin - cage35H - (p.bays35 ? 10 : 0)
  for (let i = 0; i < p.bays25; i++) {
    slots.push({
      id: `bay25-${i}`,
      kind: 'bay-2.5',
      label: `Schacht ${p.bays35 + i} (2.5")`,
      rect: { x: cageX, y: base25 - (i + 1) * (BAY_25.h + 5) + 5, w: BAY_25.w, h: BAY_25.h },
      meta: { hotSwap: p.hotSwap, nvme: i < p.nvmeBays, order: p.bays35 + i },
    })
  }
  return { size: { w: W, h: H }, slots }
}

/* ------------------------------------------------------------------ */
/* Component geometry                                                  */
/* ------------------------------------------------------------------ */

export function m2LengthOf(ff: StorageFormFactor): number {
  const m = /^M\.2 22(\d+)$/.exec(ff)
  return m ? Number(m[1]) : 80
}

export function storageNaturalSize(ff: StorageFormFactor): Size {
  if (ff === '3.5"') return { w: 147, h: 101 }
  if (ff === '2.5"' || ff === 'U.2') return { w: 100, h: 70 }
  return { w: m2LengthOf(ff), h: M2_WIDTH }
}

/** natural (face) size of a PCIe card lying on the table */
export function pcieCardSize(lengthMm: number, lowProfile = true): Size {
  return { w: lengthMm, h: lowProfile ? 68 : 111 }
}

/** thickness of a mounted card seen from above */
export function pcieEdgeThickness(slotWidth = 1): number {
  return 12 + (slotWidth - 1) * PCIE_PITCH
}
