import type { ComponentOf, HardwareBuild, HardwareComponent, Id, InternalLinkKind, Placement, Slot } from '@/models'
import { uid } from '@/models'
import { descendantsOf, resolveBuild, slotKey } from './buildLayout'
import { checkFit, controllerSupports, slotAcceptsKind, storageControllers } from './compatibility'
import { apply } from './geometry'

export interface SlotTarget {
  ownerId: Id | 'chassis'
  slotId: Id
}

/** free spot in the parts tray right of the chassis */
export function trayPlacement(build: HardwareBuild, _c: HardwareComponent | null, ignoreIds: Id[] = []): Placement {
  const trayX = build.chassis.size.w + 60
  let bottom = 0
  const resolved = resolveBuild(build)
  for (const r of resolved.components.values()) {
    if (r.mounted || ignoreIds.includes(r.component.id)) continue
    if (r.aabb.x >= trayX - 30) bottom = Math.max(bottom, r.aabb.y + r.aabb.h)
  }
  return { x: trayX, y: bottom ? bottom + 14 : 0, rotation: 0 }
}

function nextNicNumber(build: HardwareBuild): number {
  let max = 0
  for (const c of build.components)
    for (const p of c.ports ?? []) {
      const m = /^NIC (\d+)$/.exec(p.name)
      if (m) max = Math.max(max, Number(m[1]))
    }
  return max + 1
}

/** adds a component instance to the build and gives NIC ports device-wide names (NIC 1, NIC 2 …) */
export function addComponent(build: HardwareBuild, c: HardwareComponent): HardwareComponent {
  if (c.kind === 'nic' && c.ports) {
    let n = nextNicNumber(build)
    c.ports = c.ports.map((p) => (/^Port \d+$/.test(p.name) ? { ...p, name: `NIC ${n++}` } : p))
  }
  build.components.push(c)
  return c
}

export function getSlot(build: HardwareBuild, target: SlotTarget): Slot | undefined {
  if (target.ownerId === 'chassis') return build.chassis.slots.find((s) => s.id === target.slotId)
  return build.components.find((c) => c.id === target.ownerId)?.slots?.find((s) => s.id === target.slotId)
}

export function occupantOf(build: HardwareBuild, target: SlotTarget, exceptId?: Id): HardwareComponent | undefined {
  return build.components.find(
    (c) => c.id !== exceptId && c.mount?.parentId === target.ownerId && c.mount.slotId === target.slotId,
  )
}

/** finds the best free slot for a component (used for double-click install and auto placement) */
export function findFreeSlot(build: HardwareBuild, c: HardwareComponent): SlotTarget | null {
  const resolved = resolveBuild(build)
  let best: { t: SlotTarget; score: number } | null = null
  for (const rs of resolved.slots) {
    if (rs.ownerId === c.id) continue
    if (!slotAcceptsKind(rs.slot, c)) continue
    if (rs.occupantIds.some((id) => id !== c.id)) continue
    // skip slots on a board that itself is not mounted? allow but lower score
    const fit = checkFit(build, rs.ownerId, rs.slot, c)
    if (fit.level === 'error') continue
    let score = { ok: 0, info: 10, warning: 50, error: 1000 }[fit.level]
    score += (rs.slot.meta.order ?? 0) * 0.01
    if (rs.slot.kind === 'pcie' && 'pcieLanes' in c.specs) {
      // prefer the smallest slot that still offers full lanes
      const lanes = rs.slot.meta.lanes ?? 16
      const need = c.specs.pcieLanes ?? 1
      score += lanes >= need ? (lanes - need) * 0.1 : 20
    }
    if (rs.slot.kind === 'dimm') {
      // alternate CPUs, fill channel by channel
      score += (rs.slot.meta.cpuIndex ?? 0) * 0.005
    }
    if (rs.slot.kind === 'bay-3.5' && c.kind === 'storage' && c.specs.formFactor !== '3.5"') score += 5
    if (!best || score < best.score) best = { t: { ownerId: rs.ownerId, slotId: rs.slot.id }, score }
  }
  return best?.t ?? null
}

export interface MountResult {
  ok: boolean
  reason?: string
  displacedIds: Id[]
  warnings: string[]
}

/**
 * Mounts a component into a slot. An occupant of the slot is moved to the parts tray.
 * Placing a mainboard into an occupied mainboard bay transfers the installed parts to the new board.
 */
export function mountComponent(build: HardwareBuild, id: Id, target: SlotTarget, force = false): MountResult {
  const c = build.components.find((x) => x.id === id)
  const slot = getSlot(build, target)
  if (!c || !slot) return { ok: false, reason: 'Steckplatz nicht gefunden', displacedIds: [], warnings: [] }
  if (target.ownerId === id || descendantsOf(build, id).includes(target.ownerId as Id))
    return { ok: false, reason: 'Ein Bauteil kann nicht in sich selbst eingebaut werden', displacedIds: [], warnings: [] }
  const fit = checkFit(build, target.ownerId, slot, c)
  if (fit.level === 'error' && !force) return { ok: false, reason: fit.messages.join(' · '), displacedIds: [], warnings: [] }

  const displacedIds: Id[] = []
  const occupant = occupantOf(build, target, id)
  if (occupant) {
    if (occupant.kind === 'mainboard' && c.kind === 'mainboard') {
      transferChildren(build, occupant.id, c.id)
    }
    occupant.mount = undefined
    occupant.placement = trayPlacement(build, occupant, [occupant.id])
    displacedIds.push(occupant.id)
  }
  c.mount = { parentId: target.ownerId, slotId: target.slotId }
  if (slot.rotation) c.placement.rotation = 0
  if (c.kind === 'storage' && target.ownerId === 'chassis') autoLinkDrive(build, c.id)
  return {
    ok: true,
    displacedIds,
    warnings: fit.level === 'warning' ? fit.messages : [],
  }
}

function transferChildren(build: HardwareBuild, fromBoard: Id, toBoard: Id) {
  const target = build.components.find((c) => c.id === toBoard)
  if (!target?.slots) return
  for (const child of build.components.filter((c) => c.mount?.parentId === fromBoard)) {
    const slotId = child.mount!.slotId
    const slot = target.slots.find((s) => s.id === slotId)
    if (slot && !occupantOf(build, { ownerId: toBoard, slotId }) && checkFit(build, toBoard, slot, child).level !== 'error') {
      child.mount = { parentId: toBoard, slotId }
    } else {
      child.mount = undefined
      child.placement = trayPlacement(build, child, [child.id])
    }
  }
}

/** removes a component from its slot and puts it at a free position */
export function unmountComponent(build: HardwareBuild, id: Id, placement?: Placement) {
  const c = build.components.find((x) => x.id === id)
  if (!c) return
  if (c.mount) {
    if (!placement) {
      // keep the current world position
      const r = resolveBuild(build).components.get(id)
      if (r) {
        const p = apply(r.matrix, { x: 0, y: 0 })
        placement = { x: p.x, y: p.y, rotation: 0 }
      }
    }
    c.mount = undefined
  }
  if (placement) c.placement = placement
  build.links = build.links.filter((l) => !(l.fromId === id && (l.kind === 'sata' || l.kind === 'sas' || l.kind === 'nvme')))
}

/** removes components (including parts mounted in them). Returns the ids of network ports that disappeared. */
export function removeComponents(build: HardwareBuild, ids: Id[]): { removedIds: Id[]; removedPortIds: Id[] } {
  const all = new Set<Id>()
  for (const id of ids) {
    all.add(id)
    descendantsOf(build, id).forEach((d) => all.add(d))
  }
  const removedPortIds: Id[] = []
  for (const c of build.components) if (all.has(c.id)) c.ports?.forEach((p) => removedPortIds.push(p.id))
  build.components = build.components.filter((c) => !all.has(c.id))
  build.links = build.links.filter(
    (l) => !all.has(l.fromId) && !all.has(l.toId) && ![...all].some((id) => l.toId.startsWith(`${id}:`)),
  )
  return { removedIds: [...all], removedPortIds }
}

function linkKindFor(drive: ComponentOf<'storage'>): InternalLinkKind {
  if (drive.specs.interface === 'NVMe') return 'nvme'
  if (drive.specs.interface === 'SAS') return 'sas'
  return 'sata'
}

/** connects a drive in a bay to the most suitable storage controller with free ports */
export function autoLinkDrive(build: HardwareBuild, driveId: Id) {
  const drive = build.components.find((c): c is ComponentOf<'storage'> => c.id === driveId && c.kind === 'storage')
  if (!drive) return
  if (build.links.some((l) => l.fromId === driveId)) return
  const ctrls = storageControllers(build).filter((c) => controllerSupports(c, drive) && c.used < c.capacity)
  // prefer HBA/RAID for SAS & HDDs in large chassis, mainboard for simple SATA
  ctrls.sort((a, b) => {
    const pa = a.kind === 'hba' || a.kind === 'raid' ? 0 : 1
    const pb = b.kind === 'hba' || b.kind === 'raid' ? 0 : 1
    return pa - pb
  })
  const ctrl = ctrls[0]
  if (!ctrl) return
  build.links.push({ id: uid('lnk'), fromId: driveId, toId: ctrl.id, kind: linkKindFor(drive) })
}

export function setDriveController(build: HardwareBuild, driveId: Id, controllerId: Id | null) {
  build.links = build.links.filter((l) => l.fromId !== driveId || !['sata', 'sas', 'nvme'].includes(l.kind))
  const drive = build.components.find((c): c is ComponentOf<'storage'> => c.id === driveId && c.kind === 'storage')
  if (drive && controllerId) build.links.push({ id: uid('lnk'), fromId: driveId, toId: controllerId, kind: linkKindFor(drive) })
}

/** connects all unconnected drives (e.g. after inserting an HBA) */
export function autoLinkAllDrives(build: HardwareBuild) {
  for (const c of build.components) {
    if (c.kind === 'storage' && c.mount?.parentId === 'chassis') autoLinkDrive(build, c.id)
  }
}

export function slotTargetKey(t: SlotTarget) {
  return slotKey(t.ownerId, t.slotId)
}
