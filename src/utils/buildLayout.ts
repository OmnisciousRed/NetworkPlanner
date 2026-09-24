import type { HardwareBuild, HardwareComponent, Id, Placement, Point, Rect, Slot } from '@/models'
import { aabbOf, apply, corners, mul, rotate, translate, type Mat } from './geometry'
import { m2LengthOf, pcieEdgeThickness } from './generators'

export interface Footprint {
  x: number
  y: number
  w: number
  h: number
}

/** where a component sits inside a slot (slot-local coordinates) */
export function mountFootprint(slot: Slot, c: HardwareComponent): Footprint {
  switch (slot.kind) {
    case 'dimm':
      return { x: 0, y: 0, w: slot.rect.w, h: slot.rect.h }
    case 'cpu':
      return {
        x: (slot.rect.w - c.size.w) / 2,
        y: (slot.rect.h - c.size.h) / 2,
        w: c.size.w,
        h: c.size.h,
      }
    case 'm2': {
      const len = c.kind === 'storage' ? m2LengthOf(c.specs.formFactor) : c.size.w
      return { x: 0, y: 0, w: len, h: slot.rect.h }
    }
    case 'pcie': {
      const h = pcieEdgeThickness(c.kind === 'gpu' ? c.specs.slotWidth : 1)
      return { x: slot.rect.w + 10 - c.size.w, y: -2.5, w: c.size.w, h }
    }
    case 'mainboard':
      return { x: 0, y: 0, w: c.size.w, h: c.size.h }
    default:
      return { x: 0, y: 0, w: slot.rect.w, h: slot.rect.h }
  }
}

export function slotLocalMatrix(slot: Slot): Mat {
  return mul(translate(slot.rect.x, slot.rect.y), rotate(slot.rotation ?? 0, slot.rect.w / 2, slot.rect.h / 2))
}

export function looseMatrix(p: Placement, w: number, h: number): Mat {
  return mul(translate(p.x, p.y), rotate(p.rotation, w / 2, h / 2))
}

export interface ResolvedComponent {
  component: HardwareComponent
  matrix: Mat
  w: number
  h: number
  mounted: boolean
  slot?: Slot
  parentId?: Id | 'chassis'
  aabb: Rect
  layer: number
}

export interface ResolvedSlot {
  slot: Slot
  ownerId: Id | 'chassis'
  matrix: Mat
  aabb: Rect
  center: Point
  occupantIds: Id[]
}

export interface ResolvedBuild {
  components: Map<Id, ResolvedComponent>
  /** render order (back to front) */
  order: Id[]
  slots: ResolvedSlot[]
  slotByKey: Map<string, ResolvedSlot>
}

export const slotKey = (ownerId: Id | 'chassis', slotId: Id) => `${ownerId}::${slotId}`

function isCardKind(c: HardwareComponent) {
  return c.kind === 'nic' || c.kind === 'gpu' || c.kind === 'hba' || c.kind === 'raid' || c.kind === 'pcie'
}

function baseLayer(c: HardwareComponent, mounted: boolean): number {
  if (c.kind === 'mainboard') return mounted ? 0 : 1
  return mounted ? 2 : 4
}

/**
 * Computes world transforms for all components of a build.
 * `overrides` turns components into free-floating items at the given placement (used while dragging).
 */
export function resolveBuild(build: HardwareBuild, overrides?: Map<Id, Placement>): ResolvedBuild {
  const byId = new Map(build.components.map((c) => [c.id, c]))
  const result = new Map<Id, ResolvedComponent>()
  const chassisSlots = new Map(build.chassis.slots.map((s) => [s.id, s]))
  const visiting = new Set<Id>()

  const resolve = (c: HardwareComponent): ResolvedComponent => {
    const cached = result.get(c.id)
    if (cached) return cached
    visiting.add(c.id)
    const override = overrides?.get(c.id)
    let res: ResolvedComponent | null = null
    if (!override && c.mount) {
      const { parentId, slotId } = c.mount
      let parentMatrix: Mat | null = null
      let parentLayer: number | null = null
      let slot: Slot | undefined
      if (parentId === 'chassis') {
        parentMatrix = [1, 0, 0, 1, 0, 0]
        slot = chassisSlots.get(slotId)
      } else {
        const parent = byId.get(parentId)
        if (parent && !visiting.has(parent.id)) {
          const pr = resolve(parent)
          parentMatrix = pr.matrix
          parentLayer = pr.layer
          slot = parent.slots?.find((s) => s.id === slotId)
        }
      }
      if (parentMatrix && slot) {
        const fp = mountFootprint(slot, c)
        const matrix = mul(mul(parentMatrix, slotLocalMatrix(slot)), translate(fp.x, fp.y))
        res = {
          component: c,
          matrix,
          w: fp.w,
          h: fp.h,
          mounted: true,
          slot,
          parentId,
          aabb: aabbOf(corners(matrix, fp.w, fp.h)),
          layer: parentLayer !== null ? parentLayer + (isCardKind(c) ? 1.2 : 1) : baseLayer(c, true),
        }
      }
    }
    if (!res) {
      const p = override ?? c.placement
      const matrix = looseMatrix(p, c.size.w, c.size.h)
      res = {
        component: c,
        matrix,
        w: c.size.w,
        h: c.size.h,
        mounted: false,
        aabb: aabbOf(corners(matrix, c.size.w, c.size.h)),
        layer: override ? 5 : baseLayer(c, false),
      }
    }
    visiting.delete(c.id)
    result.set(c.id, res)
    return res
  }

  build.components.forEach(resolve)

  const order = build.components
    .map((c, i) => ({ id: c.id, layer: result.get(c.id)!.layer, i }))
    .sort((a, b) => a.layer - b.layer || a.i - b.i)
    .map((e) => e.id)

  // slots
  const slots: ResolvedSlot[] = []
  const occupants = new Map<string, Id[]>()
  for (const c of build.components) {
    const r = result.get(c.id)!
    if (r.mounted && c.mount) {
      const k = slotKey(c.mount.parentId, c.mount.slotId)
      occupants.set(k, [...(occupants.get(k) ?? []), c.id])
    }
  }
  const pushSlot = (slot: Slot, ownerId: Id | 'chassis', parentMatrix: Mat) => {
    const matrix = mul(parentMatrix, slotLocalMatrix(slot))
    const pts = corners(matrix, slot.rect.w, slot.rect.h)
    slots.push({
      slot,
      ownerId,
      matrix,
      aabb: aabbOf(pts),
      center: apply(matrix, { x: slot.rect.w / 2, y: slot.rect.h / 2 }),
      occupantIds: occupants.get(slotKey(ownerId, slot.id)) ?? [],
    })
  }
  for (const s of build.chassis.slots) pushSlot(s, 'chassis', [1, 0, 0, 1, 0, 0])
  for (const c of build.components) {
    if (!c.slots?.length) continue
    const r = result.get(c.id)!
    for (const s of c.slots) pushSlot(s, c.id, r.matrix)
  }
  const slotByKey = new Map(slots.map((s) => [slotKey(s.ownerId, s.slot.id), s]))
  return { components: result, order, slots, slotByKey }
}

/** ids of all components mounted (directly or indirectly) in the given component */
export function descendantsOf(build: HardwareBuild, id: Id): Id[] {
  const out: Id[] = []
  const walk = (pid: Id) => {
    for (const c of build.components) {
      if (c.mount?.parentId === pid) {
        out.push(c.id)
        walk(c.id)
      }
    }
  }
  walk(id)
  return out
}
