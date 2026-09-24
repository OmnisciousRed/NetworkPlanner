import type { ComponentOf, Device, HardwareBuild, HardwareComponent, NetworkInterface } from '@/models'
import { formatSpeed } from '@/models'

export type LoadLevel = 'idle' | 'typical' | 'max'

const FACTORS: Record<string, [number, number, number]> = {
  cpu: [0.2, 0.55, 1],
  gpu: [0.1, 0.45, 1],
  ram: [0.5, 0.8, 1],
  hdd: [0.7, 1, 1.25],
  ssd: [0.3, 0.6, 1],
  mainboard: [0.7, 0.9, 1],
  fan: [0.3, 0.55, 1],
  default: [0.6, 0.8, 1],
}

function loadIndex(l: LoadLevel) {
  return l === 'idle' ? 0 : l === 'typical' ? 1 : 2
}

export function componentPower(c: HardwareComponent, load: LoadLevel = 'typical'): number {
  const i = loadIndex(load)
  switch (c.kind) {
    case 'psu':
      return 0
    case 'cpu':
      return c.specs.tdpW * FACTORS.cpu[i]
    case 'gpu':
      return c.powerW * FACTORS.gpu[i]
    case 'ram':
      return c.powerW * FACTORS.ram[i]
    case 'storage':
      return c.powerW * (c.specs.storageType === 'hdd' ? FACTORS.hdd : FACTORS.ssd)[i]
    case 'mainboard':
      return c.powerW * FACTORS.mainboard[i]
    case 'fan':
      return c.powerW * FACTORS.fan[i]
    default:
      return c.powerW * FACTORS.default[i]
  }
}

export function psuEfficiency(eff?: string): number {
  if (!eff) return 0.87
  if (/titanium/i.test(eff)) return 0.94
  if (/platinum/i.test(eff)) return 0.92
  if (/gold/i.test(eff)) return 0.9
  if (/silver/i.test(eff)) return 0.88
  return 0.86
}

export function installedComponents(build: HardwareBuild): HardwareComponent[] {
  return build.components.filter((c) => !!c.mount)
}

export interface PowerEstimate {
  idleW: number
  typicalW: number
  maxW: number
  /** DC load at max, used for PSU sizing */
  dcMaxW: number
  psuCount: number
  psuTotalW: number
  /** capacity that is guaranteed with one PSU failed (N+1) */
  psuRedundantW: number
  redundant: boolean
}

export function estimateBuildPower(build: HardwareBuild): PowerEstimate {
  const installed = installedComponents(build)
  const psus = installed.filter((c): c is ComponentOf<'psu'> => c.kind === 'psu')
  const eff = psus.length ? psuEfficiency(psus[0].specs.efficiency) : 0.88
  const sum = (l: LoadLevel) => installed.reduce((s, c) => s + componentPower(c, l), 0)
  const dcIdle = sum('idle')
  const dcTyp = sum('typical')
  const dcMax = sum('max')
  const watts = psus.map((p) => p.specs.watts).sort((a, b) => a - b)
  const psuTotalW = watts.reduce((a, b) => a + b, 0)
  const redundant = psus.length >= 2
  const psuRedundantW = redundant ? psuTotalW - watts[watts.length - 1] : psuTotalW
  return {
    idleW: Math.round(dcIdle / eff),
    typicalW: Math.round(dcTyp / eff),
    maxW: Math.round(dcMax / eff),
    dcMaxW: Math.round(dcMax),
    psuCount: psus.length,
    psuTotalW,
    psuRedundantW,
    redundant,
  }
}

export interface BuildSummary {
  cpuCount: number
  cpuModels: string[]
  cores: number
  threads: number
  ramGB: number
  ramModules: number
  ramType?: string
  dimmSlots: number
  storageCount: number
  storageGB: number
  storageByType: Record<string, { count: number; gb: number }>
  nics: string[]
  ports: { label: string; count: number }[]
  gpus: string[]
  controllers: string[]
  power: PowerEstimate
  weightKg: number
  fans: number
  mainboard?: string
}

export function summarizeBuild(build: HardwareBuild): BuildSummary {
  const installed = installedComponents(build)
  const cpus = installed.filter((c): c is ComponentOf<'cpu'> => c.kind === 'cpu')
  const rams = installed.filter((c): c is ComponentOf<'ram'> => c.kind === 'ram')
  const drives = installed.filter((c): c is ComponentOf<'storage'> => c.kind === 'storage')
  const board = installed.find((c): c is ComponentOf<'mainboard'> => c.kind === 'mainboard')
  const storageByType: BuildSummary['storageByType'] = {}
  for (const d of drives) {
    const key = d.specs.storageType === 'nvme' ? 'NVMe' : d.specs.storageType === 'ssd' ? 'SSD' : 'HDD'
    storageByType[key] = storageByType[key] ?? { count: 0, gb: 0 }
    storageByType[key].count++
    storageByType[key].gb += d.specs.capacityGB
  }
  const portList: NetworkInterface[] = installed.flatMap((c) => c.ports ?? [])
  const portGroups = new Map<string, number>()
  for (const p of portList) {
    const k = `${formatSpeed(p.speed)} ${p.connector}`
    portGroups.set(k, (portGroups.get(k) ?? 0) + 1)
  }
  const models = [...new Set(cpus.map((c) => c.name))]
  return {
    cpuCount: cpus.length,
    cpuModels: models,
    cores: cpus.reduce((s, c) => s + c.specs.cores, 0),
    threads: cpus.reduce((s, c) => s + c.specs.threads, 0),
    ramGB: rams.reduce((s, r) => s + r.specs.capacityGB, 0),
    ramModules: rams.length,
    ramType: rams[0] ? `${rams[0].specs.memoryType}${rams[0].specs.ecc ? ' ECC' : ''}` : undefined,
    dimmSlots: board?.slots?.filter((s) => s.kind === 'dimm').length ?? 0,
    storageCount: drives.length,
    storageGB: drives.reduce((s, d) => s + d.specs.capacityGB, 0),
    storageByType,
    nics: installed.filter((c) => c.kind === 'nic').map((c) => c.name),
    ports: [...portGroups.entries()].map(([label, count]) => ({ label, count })),
    gpus: installed.filter((c) => c.kind === 'gpu').map((c) => c.name),
    controllers: installed.filter((c) => c.kind === 'hba' || c.kind === 'raid').map((c) => c.name),
    power: estimateBuildPower(build),
    weightKg: Math.round((build.chassis.params.weightKg + installed.reduce((s, c) => s + c.weightKg, 0)) * 10) / 10,
    fans: installed.filter((c) => c.kind === 'fan').length,
    mainboard: board?.name,
  }
}

export function formatCapacity(gb: number): string {
  if (gb >= 1000) {
    const tb = gb / 1000
    return `${Number.isInteger(tb) ? tb : tb.toFixed(tb >= 10 ? 1 : 2)} TB`
  }
  return `${gb} GB`
}

/** one-line hardware description, e.g. "2× Xeon Gold 6430 · 256 GB · 4× NVMe" */
export function buildOneLiner(device: Device): string {
  if (!device.build) return [device.manufacturer, device.model].filter(Boolean).join(' ')
  const s = summarizeBuild(device.build)
  const parts: string[] = []
  if (s.cpuCount) parts.push(`${s.cpuCount > 1 ? `${s.cpuCount}× ` : ''}${s.cpuModels.join('/')}`)
  if (s.ramGB) parts.push(`${s.ramGB} GB RAM`)
  const st = Object.entries(s.storageByType).map(([k, v]) => `${v.count}× ${k}`)
  if (st.length) parts.push(st.join(', '))
  if (s.gpus.length) parts.push(s.gpus.join(', '))
  return parts.join(' · ') || 'Leeres Gehäuse'
}
