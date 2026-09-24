import type {
  ComponentOf,
  HardwareBuild,
  HardwareComponent,
  Id,
  Slot,
} from '@/models'
import { isPcieCard, isStorageController } from '@/models'
import { m2LengthOf } from './generators'
import { estimateBuildPower } from './buildSummary'

export type IssueLevel = 'error' | 'warning' | 'info' | 'ok'

export interface Issue {
  key: string
  level: IssueLevel
  message: string
  componentIds?: Id[]
  slot?: { ownerId: Id | 'chassis'; slotId: Id }
}

export interface FitResult {
  level: 'ok' | 'info' | 'warning' | 'error'
  messages: string[]
}

const LEVEL_RANK = { ok: 0, info: 1, warning: 2, error: 3 } as const

function worst(a: FitResult['level'], b: FitResult['level']): FitResult['level'] {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b
}

/** true if the slot is the right *type* of receptacle for the component */
export function slotAcceptsKind(slot: Slot, c: HardwareComponent): boolean {
  switch (slot.kind) {
    case 'cpu':
      return c.kind === 'cpu'
    case 'dimm':
      return c.kind === 'ram'
    case 'pcie':
      return isPcieCard(c)
    case 'm2':
      return c.kind === 'storage' && c.specs.formFactor.startsWith('M.2')
    case 'bay-3.5':
    case 'bay-2.5':
      return c.kind === 'storage' && !c.specs.formFactor.startsWith('M.2')
    case 'psu':
      return c.kind === 'psu'
    case 'fan':
      return c.kind === 'fan'
    case 'mainboard':
      return c.kind === 'mainboard'
    default:
      return false
  }
}

function boardOf(build: HardwareBuild): ComponentOf<'mainboard'> | undefined {
  return build.components.find((c): c is ComponentOf<'mainboard'> => c.kind === 'mainboard' && !!c.mount)
    ?? build.components.find((c): c is ComponentOf<'mainboard'> => c.kind === 'mainboard')
}

function cpuInSocket(build: HardwareBuild, boardId: Id, cpuIndex: number): boolean {
  return build.components.some(
    (c) => c.kind === 'cpu' && c.mount?.parentId === boardId && c.mount.slotId === `cpu-${cpuIndex}`,
  )
}

/**
 * Checks whether a component fits into a slot. Used for drag-over highlighting,
 * drop validation and the compatibility report.
 */
export function checkFit(
  build: HardwareBuild,
  ownerId: Id | 'chassis',
  slot: Slot,
  c: HardwareComponent,
): FitResult {
  const res: FitResult = { level: 'ok', messages: [] }
  const add = (level: FitResult['level'], msg: string) => {
    res.level = worst(res.level, level)
    res.messages.push(msg)
  }
  if (!slotAcceptsKind(slot, c)) {
    add('error', `${c.name} passt nicht in ${slot.label}`)
    return res
  }
  const owner = ownerId === 'chassis' ? undefined : build.components.find((x) => x.id === ownerId)
  const board = owner?.kind === 'mainboard' ? owner : undefined
  const params = build.chassis.params

  switch (c.kind) {
    case 'cpu': {
      if (slot.meta.socket && slot.meta.socket !== c.specs.socket)
        add('error', `Diese CPU benötigt Sockel ${c.specs.socket} – das Mainboard hat ${slot.meta.socket}`)
      if (board && !c.specs.memoryTypes.includes(board.specs.memoryType))
        add('error', `CPU unterstützt ${c.specs.memoryTypes.join('/')} – das Mainboard verwendet ${board.specs.memoryType}`)
      if (board && board.specs.sockets > 1 && c.specs.maxSockets < 2)
        add('error', `${c.name} ist nicht für Dual-Socket-Systeme geeignet`)
      if (c.specs.tdpW > params.maxCpuTdpW)
        add('warning', `TDP ${c.specs.tdpW} W übersteigt die Kühlleistung des Gehäuses (${params.maxCpuTdpW} W)`)
      break
    }
    case 'ram': {
      if (c.specs.formFactor === 'SO-DIMM') add('error', 'SO-DIMM-Module passen nicht in DIMM-Slots')
      if (slot.meta.memoryType && slot.meta.memoryType !== c.specs.memoryType)
        add('error', `Dieses Modul ist für ${c.specs.memoryType} ausgelegt, das Mainboard verwendet ${slot.meta.memoryType}`)
      if (slot.meta.memoryModule === 'RDIMM' && !c.specs.registered)
        add('error', 'Das Mainboard benötigt Registered DIMMs (RDIMM)')
      if (slot.meta.memoryModule === 'UDIMM' && c.specs.registered)
        add('error', 'Das Mainboard unterstützt keine Registered DIMMs (nur UDIMM)')
      if (board && c.specs.ecc && !board.specs.eccSupport) add('info', 'ECC wird von diesem Mainboard nicht genutzt')
      if (board?.specs.maxMemorySpeed && c.specs.speedMTs > board.specs.maxMemorySpeed)
        add('info', `Läuft mit max. ${board.specs.maxMemorySpeed} MT/s`)
      if (board && slot.meta.cpuIndex && !cpuInSocket(build, board.id, slot.meta.cpuIndex))
        add('warning', `${slot.label} gehört zu CPU ${slot.meta.cpuIndex + 1}, die nicht bestückt ist`)
      break
    }
    case 'nic':
    case 'gpu':
    case 'hba':
    case 'raid':
    case 'pcie': {
      const physical = slot.meta.physical ?? 16
      const lanes = slot.meta.lanes ?? physical
      if (c.specs.pcieLanes > physical)
        add('error', `PCIe x${c.specs.pcieLanes}-Karte passt physisch nicht in einen x${physical}-Slot`)
      else if (c.specs.pcieLanes > lanes)
        add('info', `Slot ist elektrisch nur x${lanes} angebunden – Karte läuft mit reduzierter Bandbreite`)
      if (slot.meta.pcieGen && c.specs.pcieGen > slot.meta.pcieGen)
        add('info', `Karte (Gen${c.specs.pcieGen}) läuft im Gen${slot.meta.pcieGen}-Slot mit reduzierter Geschwindigkeit`)
      if (params.maxCardHeight === 'low-profile' && !c.specs.lowProfile)
        add('error', 'Das Gehäuse nimmt nur Low-Profile-Karten auf')
      if (c.specs.lengthMm > params.maxCardLengthMm)
        add('warning', `Karte (${c.specs.lengthMm} mm) ist länger als erlaubt (${params.maxCardLengthMm} mm)`)
      if (board && slot.meta.cpuIndex && !cpuInSocket(build, board.id, slot.meta.cpuIndex))
        add('warning', `${slot.label} ist an CPU ${slot.meta.cpuIndex + 1} angebunden, die nicht bestückt ist`)
      if (c.kind === 'gpu' && c.specs.slotWidth > 1 && board) {
        const order = slot.meta.order ?? 0
        const blocked = (board.slots ?? []).filter(
          (s) => s.kind === 'pcie' && (s.meta.order ?? 0) > order && (s.meta.order ?? 0) < order + c.specs.slotWidth,
        )
        const occupied = blocked.filter((s) =>
          build.components.some((x) => x.id !== c.id && x.mount?.parentId === board.id && x.mount.slotId === s.id),
        )
        if (occupied.length)
          add('warning', `${c.specs.slotWidth}-Slot-Karte blockiert ${occupied.map((s) => s.label).join(', ')}`)
      }
      if (!res.messages.length && c.specs.pcieLanes < physical)
        add('ok', `PCIe x${c.specs.pcieLanes}-Karte passt in PCIe x${physical}-Slot`)
      break
    }
    case 'storage': {
      const ff = c.specs.formFactor
      if (slot.kind === 'm2') {
        const len = m2LengthOf(ff)
        if (slot.meta.maxLength && len > slot.meta.maxLength)
          add('error', `M.2 22${len} ist zu lang für diesen Slot (max. 22${slot.meta.maxLength})`)
        if (slot.meta.interfaces && !slot.meta.interfaces.includes(c.specs.interface))
          add('error', `Slot unterstützt nur ${slot.meta.interfaces.join('/')} – Modul ist ${c.specs.interface}`)
      } else if (slot.kind === 'bay-2.5') {
        if (ff === '3.5"') add('error', 'Dieses Gehäuse besitzt keinen passenden Laufwerksschacht (3.5" in 2.5"-Schacht)')
        if (ff === 'U.2' && !slot.meta.nvme) add('error', 'Schacht ohne NVMe-Backplane – U.2 wird nicht unterstützt')
      } else if (slot.kind === 'bay-3.5') {
        if (ff === '2.5"') add('info', '2.5"-Laufwerk im 3.5"-Schacht benötigt einen Adapterrahmen')
        if (ff === 'U.2') add('error', 'Schacht ohne NVMe-Backplane – U.2 wird nicht unterstützt')
      }
      break
    }
    case 'psu': {
      const allowed = slot.meta.psuFormFactor
      if (allowed && !allowed.includes(c.specs.formFactor))
        add('error', `${c.specs.formFactor}-Netzteil passt nicht in diesen Schacht (${allowed.join('/')})`)
      break
    }
    case 'fan': {
      if (slot.meta.fanSize && c.specs.sizeMm > slot.meta.fanSize)
        add('error', `${c.specs.sizeMm} mm Lüfter ist zu groß für den ${slot.meta.fanSize} mm Lüfterplatz`)
      else if (slot.meta.fanSize && c.specs.sizeMm < slot.meta.fanSize)
        add('info', `Kleinerer Lüfter (${c.specs.sizeMm} mm) im ${slot.meta.fanSize} mm Platz – weniger Luftstrom`)
      break
    }
    case 'mainboard': {
      if (slot.meta.formFactors && !slot.meta.formFactors.includes(c.specs.formFactor))
        add('error', `Formfaktor ${c.specs.formFactor} wird vom Gehäuse nicht unterstützt (${slot.meta.formFactors.join(', ')})`)
      break
    }
  }
  return res
}

/* ------------------------------------------------------------------ */
/* Storage controller assignment                                       */
/* ------------------------------------------------------------------ */

export interface ControllerInfo {
  id: Id
  name: string
  kind: 'mainboard-sata' | 'mainboard-nvme' | 'hba' | 'raid'
  capacity: number
  used: number
}

export function storageControllers(build: HardwareBuild): ControllerInfo[] {
  const out: ControllerInfo[] = []
  const board = boardOf(build)
  const linkCount = (id: Id) => build.links.filter((l) => l.toId === id).length
  if (board) {
    out.push({ id: `${board.id}:sata`, name: `${board.name} – SATA`, kind: 'mainboard-sata', capacity: board.specs.sataPorts, used: linkCount(`${board.id}:sata`) })
    if (board.specs.nvmePorts)
      out.push({ id: `${board.id}:nvme`, name: `${board.name} – NVMe (U.2)`, kind: 'mainboard-nvme', capacity: board.specs.nvmePorts, used: linkCount(`${board.id}:nvme`) })
  }
  for (const c of build.components) {
    if (isStorageController(c) && c.mount)
      out.push({ id: c.id, name: c.name, kind: c.kind, capacity: c.specs.drivePorts, used: linkCount(c.id) })
  }
  return out
}

/** can the drive be attached to this controller? */
export function controllerSupports(ctrl: ControllerInfo, drive: ComponentOf<'storage'>): boolean {
  if (drive.specs.formFactor === 'U.2') return ctrl.kind === 'mainboard-nvme' || ctrl.kind === 'raid'
  if (drive.specs.interface === 'SAS') return ctrl.kind === 'hba' || ctrl.kind === 'raid'
  if (drive.specs.interface === 'NVMe') return ctrl.kind === 'mainboard-nvme' || ctrl.kind === 'raid'
  return ctrl.kind !== 'mainboard-nvme'
}

/* ------------------------------------------------------------------ */
/* Full build analysis                                                 */
/* ------------------------------------------------------------------ */

export function analyzeBuild(build: HardwareBuild): Issue[] {
  const issues: Issue[] = []
  const push = (i: Issue) => issues.push(i)
  const byId = new Map(build.components.map((c) => [c.id, c]))
  const boards = build.components.filter((c): c is ComponentOf<'mainboard'> => c.kind === 'mainboard')
  const board = boards.find((b) => b.mount) ?? boards[0]
  const enclosure = !!build.chassis.params.driveEnclosure

  if (enclosure)
    push({
      key: 'enclosure',
      level: 'info',
      message: 'Laufwerksgehäuse ohne Mainboard: Die Laufwerke sitzen auf der Backplane und werden per Kabel (SATA, SAS oder USB) mit einem Server verbunden.',
    })
  else if (!boards.length) push({ key: 'no-board', level: 'error', message: 'Kein Mainboard eingebaut' })
  if (boards.length > 1) push({ key: 'multi-board', level: 'warning', message: 'Mehrere Mainboards im Gehäuse', componentIds: boards.map((b) => b.id) })

  // slot occupancy
  const occupancy = new Map<string, Id[]>()
  for (const c of build.components) {
    if (!c.mount) continue
    const k = `${c.mount.parentId}::${c.mount.slotId}`
    occupancy.set(k, [...(occupancy.get(k) ?? []), c.id])
  }
  for (const [k, ids] of occupancy) {
    if (ids.length > 1) push({ key: `dup-${k}`, level: 'error', message: `Steckplatz doppelt belegt: ${ids.map((i) => byId.get(i)?.name).join(', ')}`, componentIds: ids })
  }

  // per mounted component fit
  const okGroups = new Map<string, { count: number; ids: Id[]; text: string }>()
  for (const c of build.components) {
    if (!c.mount) {
      push({
        key: `loose-${c.id}`,
        level: 'warning',
        message: `${c.name} ist nicht eingebaut (liegt lose in der Ablage)`,
        componentIds: [c.id],
      })
      continue
    }
    const { parentId, slotId } = c.mount
    const slot =
      parentId === 'chassis'
        ? build.chassis.slots.find((s) => s.id === slotId)
        : byId.get(parentId)?.slots?.find((s) => s.id === slotId)
    if (!slot) {
      push({ key: `noslot-${c.id}`, level: 'error', message: `${c.name}: Steckplatz existiert nicht mehr`, componentIds: [c.id] })
      continue
    }
    const fit = checkFit(build, parentId, slot, c)
    const problems = fit.messages.length && fit.level !== 'ok'
    if (problems) {
      fit.messages.forEach((m, i) =>
        push({
          key: `fit-${c.id}-${i}`,
          level: fit.level === 'ok' ? 'info' : fit.level,
          message: `${c.name} (${slot.label}): ${m}`,
          componentIds: [c.id],
          slot: { ownerId: parentId, slotId },
        }),
      )
    }
    if (!problems || fit.level === 'info') {
      const text = okText(c, slot)
      if (text) {
        const g = okGroups.get(text) ?? { count: 0, ids: [], text }
        g.count++
        g.ids.push(c.id)
        okGroups.set(text, g)
      }
    }
  }

  const installed = build.components.filter((c) => c.mount)
  const cpus = installed.filter((c): c is ComponentOf<'cpu'> => c.kind === 'cpu')
  const rams = installed.filter((c): c is ComponentOf<'ram'> => c.kind === 'ram')
  const drives = installed.filter((c): c is ComponentOf<'storage'> => c.kind === 'storage')

  if (board) {
    if (!cpus.length) push({ key: 'no-cpu', level: 'error', message: 'Keine CPU eingesetzt' })
    else if (board.specs.sockets > cpus.length)
      push({ key: 'cpu-partial', level: 'info', message: `${cpus.length} von ${board.specs.sockets} CPU-Sockeln bestückt – zugehörige RAM/PCIe-Slots sind inaktiv` })
    if (new Set(cpus.map((c) => c.templateId ?? c.name)).size > 1)
      push({ key: 'cpu-mixed', level: 'warning', message: 'Unterschiedliche CPU-Modelle in einem Mehrsockel-System', componentIds: cpus.map((c) => c.id) })
    if (!rams.length) push({ key: 'no-ram', level: 'error', message: 'Kein Arbeitsspeicher eingesetzt' })
    const totalRam = rams.reduce((s, r) => s + r.specs.capacityGB, 0)
    if (totalRam > board.specs.maxMemoryGB)
      push({ key: 'ram-max', level: 'error', message: `${totalRam} GB überschreiten das Maximum des Mainboards (${board.specs.maxMemoryGB} GB)` })
    if (new Set(rams.map((r) => `${r.specs.capacityGB}-${r.specs.speedMTs}`)).size > 1)
      push({ key: 'ram-mixed', level: 'warning', message: 'Unterschiedliche RAM-Module gemischt – alle Module laufen mit der niedrigsten Geschwindigkeit', componentIds: rams.map((r) => r.id) })
    if (rams.length && cpus.length) {
      const perCpu = new Map<number, number>()
      for (const r of rams) {
        const slot = board.slots?.find((s) => s.id === r.mount?.slotId)
        const idx = slot?.meta.cpuIndex ?? 0
        perCpu.set(idx, (perCpu.get(idx) ?? 0) + 1)
      }
      const counts = [...perCpu.values()]
      if (cpus.length > 1 && new Set(counts).size > 1)
        push({ key: 'ram-unbalanced', level: 'info', message: 'RAM ist ungleich auf die CPUs verteilt – für beste Performance symmetrisch bestücken' })
    }
  }

  // storage & controllers
  if (!drives.length)
    push(enclosure ? { key: 'no-storage', level: 'warning', message: 'Noch keine Festplatten in den Schächten' } : { key: 'no-storage', level: 'warning', message: 'Kein Laufwerk eingebaut (Boot-Laufwerk fehlt)' })
  const controllers = storageControllers(build)
  for (const ctrl of controllers) {
    if (ctrl.used > ctrl.capacity)
      push({ key: `ctrl-over-${ctrl.id}`, level: 'error', message: `${ctrl.name}: ${ctrl.used} Laufwerke angeschlossen, aber nur ${ctrl.capacity} Anschlüsse vorhanden` })
  }
  for (const d of drives) {
    if (d.mount?.parentId !== 'chassis') continue // M.2 on board is directly attached
    if (enclosure) continue // attached to the enclosure's backplane
    const link = build.links.find((l) => l.fromId === d.id)
    if (!link) {
      push({ key: `drive-unlinked-${d.id}`, level: 'warning', message: `${d.name} ist mit keinem Controller verbunden`, componentIds: [d.id] })
      continue
    }
    const ctrl = controllers.find((c) => c.id === link.toId)
    if (!ctrl) {
      push({ key: `drive-badlink-${d.id}`, level: 'warning', message: `${d.name}: angeschlossener Controller ist nicht eingebaut`, componentIds: [d.id] })
    } else if (!controllerSupports(ctrl, d)) {
      push({ key: `drive-proto-${d.id}`, level: 'error', message: `${d.name} (${d.specs.interface}${d.specs.formFactor === 'U.2' ? ' U.2' : ''}) kann nicht an ${ctrl.name} betrieben werden`, componentIds: [d.id] })
    }
  }

  // power
  const power = estimateBuildPower(build)
  if (!power.psuCount && enclosure && !build.chassis.params.psuBays)
    push({ key: 'no-psu', level: 'info', message: 'Kein eigenes Netzteil – die Laufwerke werden vom Server bzw. einem externen Netzteil versorgt' })
  else if (!power.psuCount) push({ key: 'no-psu', level: 'error', message: 'Kein Netzteil eingebaut' })
  else {
    const cap = power.psuRedundantW
    if (power.maxW > power.psuTotalW)
      push({ key: 'psu-over', level: 'error', message: `Maximale Leistungsaufnahme (~${power.maxW} W) übersteigt die Netzteilleistung (${power.psuTotalW} W)` })
    else if (power.redundant && power.maxW > cap)
      push({ key: 'psu-redundancy', level: 'warning', message: `Keine volle Redundanz: Bei Ausfall eines Netzteils stehen nur ${cap} W zur Verfügung (Bedarf bis ~${power.maxW} W)` })
    else if (power.maxW > cap * 0.8)
      push({ key: 'psu-high', level: 'warning', message: `Netzteil-Auslastung unter Volllast über 80 % (~${power.maxW} W von ${cap} W)` })
    else
      push({ key: 'psu-ok', level: 'ok', message: `Netzteil ausreichend: ~${power.maxW} W Spitze bei ${cap} W${power.redundant ? ' (redundant)' : ''}` })
    const psus = installed.filter((c): c is ComponentOf<'psu'> => c.kind === 'psu')
    if (new Set(psus.map((p) => p.specs.watts)).size > 1)
      push({ key: 'psu-mixed', level: 'warning', message: 'Netzteile mit unterschiedlicher Leistung gemischt' })
  }

  // cooling
  const fanSlots = build.chassis.slots.filter((s) => s.kind === 'fan').length
  const fans = installed.filter((c) => c.kind === 'fan').length
  if (fanSlots && !fans) push({ key: 'no-fans', level: 'warning', message: 'Keine Lüfter eingebaut – das System wird überhitzen' })
  else if (fanSlots && fans < Math.ceil(fanSlots / 2))
    push({ key: 'few-fans', level: 'info', message: `Nur ${fans} von ${fanSlots} Lüfterplätzen belegt` })

  // network
  const ports = installed.flatMap((c) => c.ports ?? [])
  if (!ports.length && !enclosure) push({ key: 'no-net', level: 'warning', message: 'Keine Netzwerkschnittstelle vorhanden' })

  // raid cache protection
  const raid = installed.find((c) => c.kind === 'raid')
  if (raid && !installed.some((c) => c.kind === 'bbu'))
    push({ key: 'raid-bbu', level: 'info', message: 'RAID-Controller ohne Cache-Schutz (BBU/Supercap) – Write-Back-Cache nur mit Schutz aktivieren', componentIds: [raid.id] })

  for (const g of okGroups.values()) {
    push({ key: `ok-${g.text}`, level: 'ok', message: g.count > 1 ? `${g.count}× ${g.text.replace(' passt ', ' passen ')}` : g.text, componentIds: g.ids })
  }

  return issues.sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level])
}

function okText(c: HardwareComponent, slot: Slot): string | null {
  switch (c.kind) {
    case 'cpu':
      return `CPU passt in Sockel ${c.specs.socket}`
    case 'ram':
      return `RAM (${c.specs.memoryType}${c.specs.registered ? ' RDIMM' : ''}) passt in DIMM-Slot`
    case 'storage':
      return slot.kind === 'm2' ? `NVMe passt in M.2-Slot` : `${c.specs.formFactor}-Laufwerk passt in Laufwerksschacht`
    case 'mainboard':
      return `Mainboard (${c.specs.formFactor}) passt ins Gehäuse`
    case 'psu':
      return 'Netzteil passt in Netzteilschacht'
    case 'fan':
      return 'Lüfter passt in Lüfterplatz'
    default:
      if (isPcieCard(c)) {
        const phys = slot.meta.physical ?? 16
        return c.specs.pcieLanes < phys
          ? `PCIe x${c.specs.pcieLanes}-Karte passt in PCIe x${phys}-Slot`
          : `PCIe x${c.specs.pcieLanes}-Karte passt in PCIe-Slot`
      }
      return null
  }
}

export function issuesForComponent(issues: Issue[], id: Id): Issue[] {
  return issues.filter((i) => i.level !== 'ok' && i.componentIds?.includes(id))
}

export function worstLevel(issues: Issue[]): IssueLevel {
  let w: IssueLevel = 'ok'
  for (const i of issues) if (LEVEL_RANK[i.level] > LEVEL_RANK[w]) w = i.level
  return w
}
