import type { Device, Id, Project, Rack } from '@/models'
import { INNER_MM, RACK_STANDARD_LABEL, rackStandardOf } from '@/models'
import { getDeviceDepth, getDeviceHeightU, getDevicePower, getDeviceRackStandard, getDeviceWeight, isShelfDevice } from './device'

/** reason why a device does not fit the rack width, or null */
export function widthProblem(rack: Rack, device: Device): string | null {
  const std = rackStandardOf(rack)
  if (isShelfDevice(device)) {
    if (device.widthMm && device.widthMm > INNER_MM[std])
      return `${device.name} ist ${device.widthMm} mm breit – im ${RACK_STANDARD_LABEL[std]}-Rack ist nur ca. ${INNER_MM[std]} mm Platz`
    return null
  }
  if (std === '10' && getDeviceRackStandard(device) === '19')
    return `${device.name} ist ein 19-Zoll-Gerät (ca. 48 cm breit) und passt nicht in das 10-Zoll-Rack „${rack.name}“`
  return null
}

export function devicesInRack(project: Project, rackId: Id): Device[] {
  return Object.values(project.devices)
    .filter((d) => d.rackPlacement?.rackId === rackId)
    .sort((a, b) => (b.rackPlacement!.positionU - a.rackPlacement!.positionU))
}

/** occupied units → device id */
export function rackOccupancy(project: Project, rackId: Id, exceptId?: Id): Map<number, Id> {
  const map = new Map<number, Id>()
  for (const d of devicesInRack(project, rackId)) {
    if (d.id === exceptId) continue
    const h = getDeviceHeightU(d) ?? 1
    for (let u = d.rackPlacement!.positionU; u < d.rackPlacement!.positionU + h; u++) map.set(u, d.id)
  }
  return map
}

export interface PlaceCheck {
  ok: boolean
  reason?: string
  conflictIds: Id[]
}

export function canPlace(project: Project, rackId: Id, device: Device, positionU: number): PlaceCheck {
  const rack = project.racks[rackId]
  const h = getDeviceHeightU(device)
  if (!rack) return { ok: false, reason: 'Rack nicht gefunden', conflictIds: [] }
  if (h === null) return { ok: false, reason: `${device.name} ist nicht rackfähig (keine Höheneinheit)`, conflictIds: [] }
  const wp = widthProblem(rack, device)
  if (wp) return { ok: false, reason: wp, conflictIds: [] }
  if (positionU < 1 || positionU + h - 1 > rack.heightU)
    return { ok: false, reason: `Passt nicht: U${positionU}–U${positionU + h - 1} liegt außerhalb des ${rack.heightU}U-Racks`, conflictIds: [] }
  const occ = rackOccupancy(project, rackId, device.id)
  const conflicts = new Set<Id>()
  for (let u = positionU; u < positionU + h; u++) {
    const id = occ.get(u)
    if (id) conflicts.add(id)
  }
  if (conflicts.size)
    return {
      ok: false,
      reason: `Belegt durch ${[...conflicts].map((id) => project.devices[id]?.name).join(', ')}`,
      conflictIds: [...conflicts],
    }
  return { ok: true, conflictIds: [] }
}

/** highest free position that fits (top-down filling, like most racks are planned) */
export function findFreePosition(project: Project, rackId: Id, device: Device, preferBottom = false): number | null {
  const rack = project.racks[rackId]
  const h = getDeviceHeightU(device)
  if (!rack || h === null) return null
  const positions = Array.from({ length: rack.heightU - h + 1 }, (_, i) => i + 1)
  if (!preferBottom) positions.reverse()
  for (const u of positions) if (canPlace(project, rackId, device, u).ok) return u
  return null
}

export interface UpsAnalysis {
  deviceId: Id
  name: string
  capacityW: number
  batteryWh: number
  loadW: number
  loadPct: number
  runtimeMin: number
}

export interface RackAnalysis {
  heightU: number
  usedU: number
  freeU: number
  largestFreeBlock: number
  deviceCount: number
  powerTypicalW: number
  powerMaxW: number
  weightKg: number
  heatBtuH: number
  deltaTC: number
  energyKWhYear: number
  costYear: number
  ups: UpsAnalysis[]
  pduCapacityW: number
  warnings: string[]
}

/**
 * UPS runtime estimate: usable battery energy (inverter efficiency ~90 %, 80 % depth of discharge)
 * with a Peukert-like penalty at high load.
 */
export function upsRuntimeMinutes(batteryWh: number, loadW: number, capacityW: number): number {
  if (loadW <= 0) return Infinity
  const usable = batteryWh * 0.9 * 0.8
  const loadRatio = Math.min(1.5, loadW / Math.max(1, capacityW))
  const penalty = 1 + 0.35 * loadRatio
  return (usable / loadW) * 60 / penalty
}

export function analyzeRack(project: Project, rack: Rack): RackAnalysis {
  const devices = devicesInRack(project, rack.id)
  const occ = rackOccupancy(project, rack.id)
  let largest = 0
  let run = 0
  for (let u = 1; u <= rack.heightU; u++) {
    if (occ.has(u)) run = 0
    else {
      run++
      largest = Math.max(largest, run)
    }
  }
  const usedU = occ.size
  const consumers = devices.filter((d) => d.kind !== 'ups')
  const powerTypicalW = consumers.reduce((s, d) => s + getDevicePower(d, 'typical'), 0)
  const powerMaxW = consumers.reduce((s, d) => s + getDevicePower(d, 'max'), 0)
  const ownUps = devices.filter((d) => d.kind === 'ups').reduce((s, d) => s + getDevicePower(d, 'typical'), 0)
  const weightKg = Math.round((rack.emptyWeightKg + devices.reduce((s, d) => s + getDeviceWeight(d), 0)) * 10) / 10
  const totalHeat = powerTypicalW + ownUps
  const heatBtuH = Math.round(totalHeat * 3.412)
  // ΔT = P / (ρ · cp · V̇) with ρ·cp ≈ 1.2 kJ/(m³·K)
  const deltaTC = rack.airflowM3h > 0 ? Math.round((totalHeat / (1200 * (rack.airflowM3h / 3600))) * 10) / 10 : 0
  const energyKWhYear = Math.round((totalHeat * 24 * 365) / 1000)
  const costYear = Math.round(energyKWhYear * project.settings.energyPrice)
  const upsDevices = devices.filter((d) => d.kind === 'ups' && d.ups)
  // load is shared between all UPS in the rack
  const ups: UpsAnalysis[] = upsDevices.map((d) => {
    const loadW = powerTypicalW / upsDevices.length
    return {
      deviceId: d.id,
      name: d.name,
      capacityW: d.ups!.capacityW,
      batteryWh: d.ups!.batteryWh,
      loadW: Math.round(loadW),
      loadPct: Math.round((loadW / d.ups!.capacityW) * 100),
      runtimeMin: Math.round(upsRuntimeMinutes(d.ups!.batteryWh, loadW, d.ups!.capacityW)),
    }
  })
  const pduCapacityW = devices.filter((d) => d.kind === 'pdu').reduce((s, d) => s + (d.pdu?.maxW ?? 0), 0)

  const warnings: string[] = []
  if (weightKg > rack.maxLoadKg + rack.emptyWeightKg)
    warnings.push(`Traglast überschritten: ${weightKg} kg (max. ${rack.maxLoadKg} kg Zuladung)`)
  if (powerMaxW > rack.maxPowerW)
    warnings.push(`Spitzenleistung ${powerMaxW} W übersteigt die verfügbare Leistung (${rack.maxPowerW} W)`)
  if (pduCapacityW && powerMaxW > pduCapacityW)
    warnings.push(`PDU-Kapazität (${pduCapacityW} W) reicht nicht für die Spitzenlast (${powerMaxW} W)`)
  for (const u of ups) {
    if (u.loadPct > 100) warnings.push(`${u.name} ist überlastet (${u.loadPct} %)`)
    else if (u.loadPct > 80) warnings.push(`${u.name} ist hoch ausgelastet (${u.loadPct} %)`)
  }
  for (const d of devices) {
    const depth = getDeviceDepth(d)
    if (depth && depth > rack.depthMm) warnings.push(`${d.name} (${depth} mm) ist tiefer als das Rack (${rack.depthMm} mm)`)
    const wp = widthProblem(rack, d)
    if (wp) warnings.push(wp)
  }
  const heavyHigh = devices.filter((d) => d.kind === 'ups' && d.rackPlacement!.positionU > rack.heightU / 2)
  for (const d of heavyHigh) warnings.push(`${d.name}: Schwere USV besser im unteren Rackbereich montieren`)
  if (deltaTC > 15) warnings.push(`Hohe Temperaturdifferenz (~${deltaTC} °C) – Luftstrom/Kühlung prüfen`)

  return {
    heightU: rack.heightU,
    usedU,
    freeU: rack.heightU - usedU,
    largestFreeBlock: largest,
    deviceCount: devices.length,
    powerTypicalW,
    powerMaxW,
    weightKg,
    heatBtuH,
    deltaTC,
    energyKWhYear,
    costYear,
    ups,
    pduCapacityW,
    warnings,
  }
}
