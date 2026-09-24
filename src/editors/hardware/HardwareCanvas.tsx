import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Device, HardwareComponent, Id, Placement, Point, Rect } from '@/models'
import { findComponentTemplate } from '@/data/componentCatalog'
import { ChassisGraphic, ComponentGraphic, HardwareDefs, SlotGraphic, TrayArea, slotHighlight, type SlotState } from '@/components/hardware/graphics'
import { resolveBuild, slotKey, type ResolvedBuild, type ResolvedSlot } from '@/utils/buildLayout'
import { checkFit, issuesForComponent, slotAcceptsKind, worstLevel, type Issue } from '@/utils/compatibility'
import { createComponent } from '@/utils/factory'
import { apply, computeSnapGuides, corners, invert, normalizeAngle, pointInTransformedRect, rectsIntersect, snap, toSvg, unionRect, type GuideLine } from '@/utils/geometry'
import { toast, useUiStore } from '@/store/uiStore'
import {
  addComponentFromTemplate,
  addInternalLink,
  dropComponent,
  installComponent,
  moveComponents,
  placementFromMatrix,
  resizeComponent,
  setComponentRotation,
  setDriveController,
} from '@/store/actions/hardware'
import { useViewport } from '../useViewport'
import type { SlotTarget } from '@/utils/buildOps'
import { storageControllers } from '@/utils/compatibility'

export type HwTool = 'select' | 'pan' | 'link'

interface TargetInfo extends SlotTarget {
  level: 'ok' | 'info' | 'warning' | 'error'
  message: string
  label: string
}

type DragState =
  | {
      kind: 'move'
      ids: Id[]
      primary: Id
      startWorld: Point
      origin: Map<Id, Placement>
      delta: Point
      moved: boolean
      target: TargetInfo | null
      guides: GuideLine[]
      pointer: Point
      clickedSelected: boolean
      shift: boolean
    }
  | { kind: 'marquee'; start: Point; current: Point; additive: boolean }
  | { kind: 'pan'; startClient: Point; origin: { x: number; y: number } }
  | { kind: 'rotate'; id: Id; center: Point; startAngle: number; origRot: number; rot: number }
  | { kind: 'resize'; id: Id; start: Point; orig: { w: number; h: number; placement: Placement }; size: { w: number; h: number } }
  | { kind: 'link'; fromId: Id; current: Point }

const LINK_COLORS: Record<string, string> = {
  sata: '#f59e0b',
  sas: '#a855f7',
  nvme: '#3b82f6',
  power: '#ef4444',
  fan: '#64748b',
  pcie: '#22c55e',
  custom: '#94a3b8',
}

export interface HardwareCanvasHandle {
  fit: () => void
  zoomIn: () => void
  zoomOut: () => void
  zoom: number
}

function ancestorsOf(byId: Map<Id, HardwareComponent>, id: Id): Id[] {
  const out: Id[] = []
  let cur = byId.get(id)
  const guard = new Set<Id>()
  while (cur?.mount && cur.mount.parentId !== 'chassis' && !guard.has(cur.id)) {
    guard.add(cur.id)
    out.push(cur.mount.parentId)
    cur = byId.get(cur.mount.parentId)
  }
  return out
}

export function HardwareCanvas({
  device,
  issues,
  tool,
  onViewportApi,
}: {
  device: Device
  issues: Issue[]
  tool: HwTool
  onViewportApi?: (api: HardwareCanvasHandle) => void
}) {
  const build = device.build!
  const hw = useUiStore((s) => s.hw)
  const selection = useUiStore((s) => s.selection)
  const select = useUiStore((s) => s.select)
  const libDragPayload = useUiStore((s) => s.drag)
  const focus = useUiStore((s) => s.focus)
  const { vp, setVp, ref, screenToWorld, zoomAt, fit, centerOn } = useViewport({ minZoom: 0.2, maxZoom: 10, initialZoom: 1.1 })
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const [hoverId, setHoverId] = useState<Id | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [libPreview, setLibPreview] = useState<{ world: Point; target: TargetInfo | null; templateId: string } | null>(null)
  const libComponentCache = useRef<Map<string, HardwareComponent>>(new Map())

  const selectedIds = useMemo(
    () => (selection?.type === 'component' && selection.deviceId === device.id ? selection.ids : []),
    [selection, device.id],
  )
  const selectedSlot = selection?.type === 'slot' && selection.deviceId === device.id ? slotKey(selection.ownerId, selection.slotId) : null

  const byId = useMemo(() => new Map(build.components.map((c) => [c.id, c])), [build.components])

  // overrides while dragging
  const overrides = useMemo(() => {
    if (!drag) return undefined
    if (drag.kind === 'move' && drag.moved) {
      const m = new Map<Id, Placement>()
      for (const id of drag.ids) {
        const o = drag.origin.get(id)!
        m.set(id, { ...o, x: o.x + drag.delta.x, y: o.y + drag.delta.y })
      }
      return m
    }
    if (drag.kind === 'rotate') {
      const c = byId.get(drag.id)
      if (c) return new Map([[drag.id, { ...c.placement, rotation: drag.rot }]])
    }
    return undefined
  }, [drag, byId])

  const resolved: ResolvedBuild = useMemo(() => resolveBuild(build, overrides), [build, overrides])
  const baseResolved: ResolvedBuild = useMemo(() => resolveBuild(build), [build])

  const worldBounds = useMemo((): Rect => {
    const rects = [{ x: -30, y: -30, w: build.chassis.size.w + 60, h: build.chassis.size.h + 60 }]
    for (const r of baseResolved.components.values()) rects.push(r.aabb)
    return unionRect(rects)!
  }, [baseResolved, build.chassis.size])

  const doFit = useCallback(() => fit(worldBounds, 40), [fit, worldBounds])

  // initial fit per device
  const fittedFor = useRef<string | null>(null)
  useEffect(() => {
    if (fittedFor.current === device.id) return
    const t = requestAnimationFrame(() => {
      doFit()
      fittedFor.current = device.id
    })
    return () => cancelAnimationFrame(t)
  }, [device.id, doFit])

  useEffect(() => {
    onViewportApi?.({ fit: doFit, zoomIn: () => zoomAt(1.25), zoomOut: () => zoomAt(0.8), zoom: vp.zoom })
  }, [onViewportApi, doFit, zoomAt, vp.zoom])

  // focus a component (navigation from other views)
  useEffect(() => {
    if (focus?.type !== 'component') return
    const r = baseResolved.components.get(focus.id)
    if (r) centerOn({ x: r.aabb.x + r.aabb.w / 2, y: r.aabb.y + r.aabb.h / 2 }, Math.max(vp.zoom, 1.6))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce])

  // space bar for panning
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setSpaceDown(true)
        if (e.target === document.body) e.preventDefault()
      }
      if (e.key === 'Escape' && dragRef.current) {
        dragRef.current = null
        setDrag(null)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const updateDrag = (d: DragState | null) => {
    dragRef.current = d
    setDrag(d)
  }

  /* ---------------- slot detection ---------------- */

  const findTarget = useCallback(
    (c: HardwareComponent, world: Point, exclude: Set<Id>): TargetInfo | null => {
      const pad = Math.max(3, 8 / vp.zoom)
      let best: { rs: ResolvedSlot; dist: number; area: number; occupied: boolean } | null = null
      for (const rs of baseResolved.slots) {
        if (rs.ownerId !== 'chassis' && exclude.has(rs.ownerId)) continue
        if (!slotAcceptsKind(rs.slot, c)) continue
        const extraPad = rs.slot.rect.h < 12 || rs.slot.rect.w < 12 ? pad : pad / 2
        if (!pointInTransformedRect(rs.matrix, rs.slot.rect.w, rs.slot.rect.h, world, extraPad)) continue
        // distance from the pointer to the slot rectangle (0 = inside)
        const local = apply(invert(rs.matrix), world)
        const dx = Math.max(0, -local.x, local.x - rs.slot.rect.w)
        const dy = Math.max(0, -local.y, local.y - rs.slot.rect.h)
        const dist = Math.hypot(dx, dy)
        const area = rs.slot.rect.w * rs.slot.rect.h
        const occupied = rs.occupantIds.some((id) => id !== c.id)
        const better =
          !best ||
          dist < best.dist - 0.01 ||
          (Math.abs(dist - best.dist) <= 0.01 && (area < best.area - 0.01 || (Math.abs(area - best.area) <= 0.01 && best.occupied && !occupied)))
        if (better) best = { rs, dist, area, occupied }
      }
      if (!best) return null
      const fit = checkFit(build, best.rs.ownerId, best.rs.slot, c)
      const occupied = best.rs.occupantIds.filter((id) => id !== c.id)
      const occName = occupied.length ? byId.get(occupied[0])?.name : undefined
      const msg = fit.messages.filter((m) => fit.level !== 'ok' || m).join(' · ')
      return {
        ownerId: best.rs.ownerId,
        slotId: best.rs.slot.id,
        level: fit.level,
        label: best.rs.slot.label,
        message: [occName && fit.level !== 'error' ? `tauscht ${occName}` : '', msg].filter(Boolean).join(' · '),
      }
    },
    [baseResolved, build, byId, vp.zoom],
  )

  /* ---------------- pointer handling ---------------- */

  const expandWithGroups = (ids: Id[]): Id[] => {
    const groups = new Set(ids.map((id) => byId.get(id)?.groupId).filter(Boolean))
    if (!groups.size) return ids
    return [...new Set([...ids, ...build.components.filter((c) => c.groupId && groups.has(c.groupId)).map((c) => c.id)])]
  }

  const onComponentPointerDown = (e: React.PointerEvent, id: Id) => {
    if (e.button !== 0 || spaceDown || tool === 'pan') return
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    const world = screenToWorld(e.clientX, e.clientY)
    if (tool === 'link') {
      updateDrag({ kind: 'link', fromId: id, current: world })
      return
    }
    const isSelected = selectedIds.includes(id)
    let nextSel: Id[]
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      nextSel = isSelected ? selectedIds.filter((x) => x !== id) : [...selectedIds, ...expandWithGroups([id])]
    } else {
      nextSel = isSelected ? selectedIds : expandWithGroups([id])
    }
    select(nextSel.length ? { type: 'component', deviceId: device.id, ids: [...new Set(nextSel)] } : null)
    if (!nextSel.includes(id)) return
    // determine top-level moving set
    const moving = nextSel.filter((x) => !ancestorsOf(byId, x).some((a) => nextSel.includes(a)))
    const origin = new Map<Id, Placement>()
    for (const mid of moving) {
      const r = baseResolved.components.get(mid)
      if (!r) continue
      origin.set(mid, r.mounted ? placementFromMatrix(r.matrix, r.component.size.w, r.component.size.h) : { ...r.component.placement })
    }
    updateDrag({
      kind: 'move',
      ids: moving,
      primary: id,
      startWorld: world,
      origin,
      delta: { x: 0, y: 0 },
      moved: false,
      target: null,
      guides: [],
      pointer: world,
      clickedSelected: isSelected,
      shift: e.shiftKey,
    })
  }

  const onSlotPointerDown = (e: React.PointerEvent, rs: ResolvedSlot) => {
    if (e.button !== 0 || spaceDown || tool !== 'select') return
    e.stopPropagation()
    select({ type: 'slot', deviceId: device.id, ownerId: rs.ownerId, slotId: rs.slot.id })
  }

  const onBackgroundPointerDown = (e: React.PointerEvent) => {
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    if (e.button === 1 || e.button === 2 || spaceDown || tool === 'pan') {
      if (e.button === 2) return
      updateDrag({ kind: 'pan', startClient: { x: e.clientX, y: e.clientY }, origin: { x: vp.x, y: vp.y } })
      return
    }
    if (e.button !== 0) return
    const world = screenToWorld(e.clientX, e.clientY)
    updateDrag({ kind: 'marquee', start: world, current: world, additive: e.shiftKey })
  }

  const onRotateHandleDown = (e: React.PointerEvent, id: Id) => {
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    const r = baseResolved.components.get(id)
    if (!r) return
    const center = apply(r.matrix, { x: r.w / 2, y: r.h / 2 })
    const world = screenToWorld(e.clientX, e.clientY)
    const startAngle = (Math.atan2(world.y - center.y, world.x - center.x) * 180) / Math.PI
    updateDrag({ kind: 'rotate', id, center, startAngle, origRot: r.component.placement.rotation, rot: r.component.placement.rotation })
  }

  const onResizeHandleDown = (e: React.PointerEvent, id: Id) => {
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    const c = byId.get(id)
    if (!c) return
    updateDrag({
      kind: 'resize',
      id,
      start: screenToWorld(e.clientX, e.clientY),
      orig: { w: c.size.w, h: c.size.h, placement: { ...c.placement } },
      size: { ...c.size },
    })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    const world = screenToWorld(e.clientX, e.clientY)
    if (!d) return
    switch (d.kind) {
      case 'pan':
        setVp((v) => ({ ...v, x: d.origin.x + e.clientX - d.startClient.x, y: d.origin.y + e.clientY - d.startClient.y }))
        return
      case 'marquee':
        updateDrag({ ...d, current: world })
        return
      case 'link':
        updateDrag({ ...d, current: world })
        return
      case 'rotate': {
        const a = (Math.atan2(world.y - d.center.y, world.x - d.center.x) * 180) / Math.PI
        let rot = d.origRot + (a - d.startAngle)
        if (!e.shiftKey) rot = Math.round(rot / 15) * 15
        updateDrag({ ...d, rot: normalizeAngle(rot) })
        return
      }
      case 'resize': {
        let w = d.orig.w + (world.x - d.start.x)
        let h = d.orig.h + (world.y - d.start.y)
        if (hw.snap) {
          w = snap(w, hw.grid)
          h = snap(h, hw.grid)
        }
        updateDrag({ ...d, size: { w: Math.max(10, w), h: Math.max(6, h) } })
        return
      }
      case 'move': {
        let dx = world.x - d.startWorld.x
        let dy = world.y - d.startWorld.y
        const moved = d.moved || Math.hypot(dx * vp.zoom, dy * vp.zoom) > 3
        if (!moved) return
        let target: TargetInfo | null = null
        let guides: GuideLine[] = []
        const primary = byId.get(d.primary)
        if (d.ids.length === 1 && primary) {
          const exclude = new Set<Id>([d.primary, ...build.components.filter((c) => ancestorsOf(byId, c.id).includes(d.primary)).map((c) => c.id)])
          target = findTarget(primary, world, exclude)
        }
        if (!target) {
          // group bounding box at the unsnapped position
          const boxes: Rect[] = []
          for (const id of d.ids) {
            const o = d.origin.get(id)!
            const c = byId.get(id)!
            boxes.push({ x: o.x + dx, y: o.y + dy, w: c.size.w, h: c.size.h })
          }
          const box = unionRect(boxes)!
          let sdx = 0
          let sdy = 0
          if (hw.guides && !e.altKey) {
            const movingSet = new Set(d.ids)
            const refs: Rect[] = [{ x: 0, y: 0, w: build.chassis.size.w, h: build.chassis.size.h }]
            for (const r of baseResolved.components.values()) {
              if (movingSet.has(r.component.id) || ancestorsOf(byId, r.component.id).some((a) => movingSet.has(a))) continue
              if (r.mounted && r.parentId !== 'chassis') continue
              refs.push(r.aabb)
            }
            const res = computeSnapGuides(box, refs, 6 / vp.zoom)
            sdx = res.dx
            sdy = res.dy
            guides = res.guides
          }
          if (hw.snap && !e.altKey) {
            if (!guides.some((g) => g.axis === 'x')) sdx = snap(box.x, hw.grid) - box.x
            if (!guides.some((g) => g.axis === 'y')) sdy = snap(box.y, hw.grid) - box.y
          }
          dx += sdx
          dy += sdy
        }
        updateDrag({ ...d, delta: { x: dx, y: dy }, moved: true, target, guides, pointer: world })
        return
      }
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current
    updateDrag(null)
    if (!d) return
    switch (d.kind) {
      case 'marquee': {
        const r: Rect = {
          x: Math.min(d.start.x, d.current.x),
          y: Math.min(d.start.y, d.current.y),
          w: Math.abs(d.current.x - d.start.x),
          h: Math.abs(d.current.y - d.start.y),
        }
        if (r.w * vp.zoom < 4 && r.h * vp.zoom < 4) {
          if (!d.additive) select(null)
          return
        }
        const hits = [...baseResolved.components.values()].filter((c) => rectsIntersect(c.aabb, r) && !(c.component.kind === 'mainboard' && !(r.x <= c.aabb.x && r.y <= c.aabb.y && r.x + r.w >= c.aabb.x + c.aabb.w && r.y + r.h >= c.aabb.y + c.aabb.h)))
        const ids = hits.map((c) => c.component.id)
        const next = d.additive ? [...new Set([...selectedIds, ...ids])] : ids
        select(next.length ? { type: 'component', deviceId: device.id, ids: next } : null)
        return
      }
      case 'rotate':
        if (d.rot !== d.origRot) setComponentRotation(device.id, d.id, d.rot)
        return
      case 'resize': {
        resizeComponent(device.id, d.id, d.size)
        return
      }
      case 'link': {
        const world = screenToWorld(e.clientX, e.clientY)
        const hit = [...resolved.order].reverse().map((id) => resolved.components.get(id)!).find((r) => r.component.id !== d.fromId && pointInTransformedRect(r.matrix, r.w, r.h, world, 2))
        if (!hit) return
        const from = byId.get(d.fromId)!
        const to = hit.component
        if (from.kind === 'storage' && (to.kind === 'hba' || to.kind === 'raid' || to.kind === 'mainboard')) {
          const ctrl = storageControllers(build).find((c) => c.id === to.id || c.id.startsWith(`${to.id}:`))
          if (ctrl) setDriveController(device.id, from.id, ctrl.id)
        } else if (to.kind === 'storage' && (from.kind === 'hba' || from.kind === 'raid' || from.kind === 'mainboard')) {
          const ctrl = storageControllers(build).find((c) => c.id === from.id || c.id.startsWith(`${from.id}:`))
          if (ctrl) setDriveController(device.id, to.id, ctrl.id)
        } else {
          addInternalLink(device.id, from.id, to.id, from.kind === 'psu' || to.kind === 'psu' ? 'power' : from.kind === 'fan' || to.kind === 'fan' ? 'fan' : 'custom')
        }
        return
      }
      case 'move': {
        if (!d.moved) {
          if (d.clickedSelected && !d.shift && selectedIds.length > 1)
            select({ type: 'component', deviceId: device.id, ids: expandWithGroups([d.primary]) })
          return
        }
        if (d.ids.length === 1 && d.target) {
          const o = d.origin.get(d.primary)!
          if (d.target.level === 'error') {
            const c = byId.get(d.primary)
            toast(`${c?.name ?? 'Bauteil'} passt nicht in ${d.target.label}: ${d.target.message}`, 'error')
            return
          }
          dropComponent(device.id, d.primary, { ...o, x: o.x + d.delta.x, y: o.y + d.delta.y }, d.target)
          return
        }
        const placements: Record<Id, Placement> = {}
        for (const id of d.ids) {
          const o = d.origin.get(id)!
          placements[id] = { ...o, x: Math.round((o.x + d.delta.x) * 10) / 10, y: Math.round((o.y + d.delta.y) * 10) / 10 }
        }
        moveComponents(device.id, placements)
        return
      }
    }
  }

  /* ---------------- library drag & drop (HTML5) ---------------- */

  const libTemplateId = libDragPayload?.source === 'component-template' ? libDragPayload.templateId : null

  const libComponent = (templateId: string) => {
    let c = libComponentCache.current.get(templateId)
    if (!c) {
      const t = findComponentTemplate(templateId)
      if (!t) return null
      c = createComponent(t)
      libComponentCache.current.set(templateId, c)
    }
    return c
  }

  const onDragOver = (e: React.DragEvent) => {
    if (!libTemplateId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    const world = screenToWorld(e.clientX, e.clientY)
    const c = libComponent(libTemplateId)
    const target = c ? findTarget(c, world, new Set()) : null
    setLibPreview({ world, target, templateId: libTemplateId })
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const templateId = e.dataTransfer.getData('application/x-np-component') || libTemplateId
    setLibPreview(null)
    useUiStore.getState().set({ drag: null })
    if (!templateId) return
    const world = screenToWorld(e.clientX, e.clientY)
    const c = libComponent(templateId)
    if (!c) return
    const target = findTarget(c, world, new Set())
    if (target?.level === 'error') {
      toast(`${c.name} passt nicht in ${target.label}: ${target.message}`, 'error')
      return
    }
    const placement = { x: Math.round(world.x - c.size.w / 2), y: Math.round(world.y - c.size.h / 2), rotation: 0 }
    const id = addComponentFromTemplate(device.id, templateId, { placement, target })
    if (id) select({ type: 'component', deviceId: device.id, ids: [id] })
  }

  /* ---------------- rendering ---------------- */

  const targetKey = drag?.kind === 'move' && drag.target ? slotKey(drag.target.ownerId, drag.target.slotId) : libPreview?.target ? slotKey(libPreview.target.ownerId, libPreview.target.slotId) : null
  const draggingComponent: HardwareComponent | null =
    drag?.kind === 'move' && drag.moved && drag.ids.length === 1 ? byId.get(drag.primary) ?? null : libTemplateId ? libComponent(libTemplateId) : null

  // compatible slot highlighting while dragging
  const slotStates = useMemo(() => {
    const m = new Map<string, SlotState>()
    if (!draggingComponent) return m
    for (const rs of baseResolved.slots) {
      if (!slotAcceptsKind(rs.slot, draggingComponent)) continue
      if (rs.ownerId === draggingComponent.id) continue
      const fit = checkFit(build, rs.ownerId, rs.slot, draggingComponent)
      const lvl = fit.level === 'info' ? 'ok' : fit.level
      m.set(slotKey(rs.ownerId, rs.slot.id), lvl as SlotState)
    }
    return m
  }, [draggingComponent, baseResolved, build])

  const compIssues = useMemo(() => {
    const m = new Map<Id, 'error' | 'warning'>()
    for (const c of build.components) {
      const lvl = worstLevel(issuesForComponent(issues, c.id))
      if (lvl === 'error' || lvl === 'warning') m.set(c.id, lvl)
    }
    return m
  }, [issues, build.components])

  const trayRect = useMemo(() => {
    const x = build.chassis.size.w + 40
    const loose = [...baseResolved.components.values()].filter((r) => !r.mounted && r.aabb.x >= x - 30)
    const u = unionRect(loose.map((r) => r.aabb))
    return { x, y: -20, w: Math.max(260, u ? u.x + u.w - x + 20 : 0), h: Math.max(build.chassis.size.h + 40, u ? u.y + u.h + 20 : 0) }
  }, [baseResolved, build.chassis.size])

  const gridSize = hw.grid * vp.zoom
  const showGrid = gridSize >= 4
  const cursor =
    drag?.kind === 'pan' || spaceDown || tool === 'pan' ? (drag?.kind === 'pan' ? 'grabbing' : 'grab') : tool === 'link' ? 'crosshair' : 'default'

  const selBoxes = selectedIds
    .map((id) => resolved.components.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r)
  const single = selBoxes.length === 1 ? selBoxes[0] : null

  const linkPoint = (id: Id): Point | null => {
    const [cid, port] = id.split(':')
    const r = resolved.components.get(cid)
    if (!r) return null
    if (port === 'sata') return apply(r.matrix, { x: 6, y: r.h - 30 })
    if (port === 'nvme') return apply(r.matrix, { x: 6, y: r.h - 60 })
    return apply(r.matrix, { x: r.w / 2, y: r.h / 2 })
  }

  return (
    <div
      ref={ref}
      className="hw-canvas relative h-full w-full overflow-hidden bg-canvas select-none"
      style={{ cursor, touchAction: 'none' }}
      onDragOver={onDragOver}
      onDragLeave={() => setLibPreview(null)}
      onDrop={onDrop}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="hardware-canvas"
    >
      {showGrid && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(var(--canvas-grid) 1px, transparent 1px), linear-gradient(90deg, var(--canvas-grid) 1px, transparent 1px), linear-gradient(var(--canvas-grid-strong) 1px, transparent 1px), linear-gradient(90deg, var(--canvas-grid-strong) 1px, transparent 1px)`,
            backgroundSize: `${gridSize}px ${gridSize}px, ${gridSize}px ${gridSize}px, ${gridSize * 10}px ${gridSize * 10}px, ${gridSize * 10}px ${gridSize * 10}px`,
            backgroundPosition: `${vp.x}px ${vp.y}px`,
          }}
        />
      )}
      <svg
        className="absolute inset-0 h-full w-full"
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => updateDrag(null)}
      >
        <HardwareDefs />
        <g transform={`translate(${vp.x} ${vp.y}) scale(${vp.zoom})`}>
          <TrayArea {...trayRect} />
          <ChassisGraphic chassis={build.chassis} showLabels={hw.showLabels} />

          {/* slots (chassis bays first, then component slots in render order) */}
          {baseResolved.slots
            .filter((rs) => rs.ownerId === 'chassis')
            .map((rs) => {
              const occupied = rs.occupantIds.length > 0
              return (
                <g
                  key={slotKey(rs.ownerId, rs.slot.id)}
                  data-slot={rs.slot.id}
                  data-owner="chassis"
                  transform={toSvg(rs.matrix)}
                  onPointerDown={occupied ? undefined : (e) => onSlotPointerDown(e, rs)}
                  style={{ cursor: occupied ? undefined : 'pointer' }}
                >
                  <SlotGraphic slot={rs.slot} showLabels={hw.showLabels && !occupied} />
                </g>
              )
            })}

          {/* components */}
          {resolved.order.map((id) => {
            const r = resolved.components.get(id)!
            const c = r.component
            const dragging = drag?.kind === 'move' && drag.moved && drag.ids.includes(id)
            const boardSlots = c.slots ? resolved.slots.filter((s) => s.ownerId === id) : []
            const pad = Math.max(0, 5 / vp.zoom - Math.min(r.w, r.h) / 2)
            return (
              <g key={id} data-component-id={id}>
                <g
                  transform={toSvg(r.matrix)}
                  opacity={dragging && drag?.kind === 'move' && drag.target ? 0.55 : 1}
                  onPointerDown={(e) => onComponentPointerDown(e, id)}
                  onPointerEnter={() => setHoverId(id)}
                  onPointerLeave={() => setHoverId((h) => (h === id ? null : h))}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    if (!r.mounted) installComponent(device.id, id)
                    else if (c.kind === 'mainboard') fit(r.aabb, 30)
                  }}
                  style={{ cursor: tool === 'select' ? (dragging ? 'grabbing' : 'grab') : undefined }}
                  filter={dragging ? 'url(#np-shadow)' : undefined}
                >
                  <rect x={-pad} y={-pad} width={r.w + pad * 2} height={r.h + pad * 2} fill="transparent" />
                  <ComponentGraphic c={c} w={r.w} h={r.h} showLabels={hw.showLabels} />
                </g>
                {/* slots of this component (mainboard) */}
                {boardSlots.map((rs) => {
                  const occupied = rs.occupantIds.length > 0
                  return (
                    <g
                      key={rs.slot.id}
                      data-slot={rs.slot.id}
                      data-owner={id}
                      transform={toSvg(rs.matrix)}
                      onPointerDown={occupied ? undefined : (e) => onSlotPointerDown(e, rs)}
                      style={{ cursor: occupied ? undefined : 'pointer' }}
                    >
                      <SlotGraphic slot={rs.slot} showLabels={hw.showLabels && !occupied} />
                      {!occupied && <rect x={-1} y={-2} width={rs.slot.rect.w + 2} height={rs.slot.rect.h + 4} fill="transparent" />}
                    </g>
                  )
                })}
              </g>
            )
          })}

          {/* internal links overlay */}
          {hw.showLinks &&
            build.links.map((l) => {
              const a = linkPoint(l.fromId)
              const b = linkPoint(l.toId)
              if (!a || !b) return null
              const mx = (a.x + b.x) / 2
              return (
                <g key={l.id} style={{ pointerEvents: 'none' }}>
                  <path
                    d={`M${a.x} ${a.y} C${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`}
                    fill="none"
                    stroke={LINK_COLORS[l.kind] ?? '#94a3b8'}
                    strokeWidth={1.4 / Math.max(0.6, vp.zoom) + 0.6}
                    strokeDasharray="4 3"
                    opacity={0.75}
                    className="np-marching"
                  />
                  <circle cx={a.x} cy={a.y} r={2} fill={LINK_COLORS[l.kind]} />
                  <circle cx={b.x} cy={b.y} r={2} fill={LINK_COLORS[l.kind]} />
                </g>
              )
            })}

          {/* slot highlights while dragging */}
          {[...slotStates.entries()].map(([key, state]) => {
            const rs = baseResolved.slotByKey.get(key)
            if (!rs) return null
            const hover = key === targetKey
            const hl = slotHighlight(hover ? (`hover-${state}` as SlotState) : state)
            if (!hl) return null
            return (
              <g key={`hl-${key}`} transform={toSvg(rs.matrix)} style={{ pointerEvents: 'none' }}>
                <rect
                  x={-2}
                  y={-2}
                  width={rs.slot.rect.w + 4}
                  height={rs.slot.rect.h + 4}
                  rx={2}
                  fill={hl.color}
                  fillOpacity={hover ? 0.28 : 0.1}
                  stroke={hl.color}
                  strokeWidth={(hover ? 2.4 : 1.2) / vp.zoom + 0.4}
                  className={hover ? undefined : 'np-pulse'}
                />
              </g>
            )
          })}
          {selectedSlot &&
            (() => {
              const rs = resolved.slotByKey.get(selectedSlot)
              if (!rs) return null
              return (
                <g transform={toSvg(rs.matrix)} style={{ pointerEvents: 'none' }}>
                  <rect x={-2} y={-2} width={rs.slot.rect.w + 4} height={rs.slot.rect.h + 4} rx={2} fill="var(--selection)" fillOpacity={0.15} stroke="var(--selection)" strokeWidth={2 / vp.zoom + 0.3} strokeDasharray="4 2" />
                </g>
              )
            })()}

          {/* library drag preview */}
          {libPreview &&
            (() => {
              const c = libComponent(libPreview.templateId)
              if (!c) return null
              const x = libPreview.world.x - c.size.w / 2
              const y = libPreview.world.y - c.size.h / 2
              return (
                <g transform={`translate(${x} ${y})`} opacity={libPreview.target ? 0.35 : 0.7} style={{ pointerEvents: 'none' }}>
                  <ComponentGraphic c={c} w={c.size.w} h={c.size.h} />
                </g>
              )
            })()}

          {/* issue badges */}
          {[...compIssues.entries()].map(([id, lvl]) => {
            const r = resolved.components.get(id)
            if (!r) return null
            const p = { x: r.aabb.x + r.aabb.w, y: r.aabb.y }
            const s = 1 / vp.zoom
            return (
              <g key={`iss-${id}`} transform={`translate(${p.x} ${p.y}) scale(${s})`} style={{ pointerEvents: 'none' }}>
                <circle r={7} fill={lvl === 'error' ? '#ef4444' : '#f59e0b'} stroke="white" strokeWidth={1.5} />
                <text textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={800} fill="white">
                  !
                </text>
              </g>
            )
          })}

          {/* hover outline */}
          {hoverId && !drag && !selectedIds.includes(hoverId) && resolved.components.get(hoverId) && (
            <polygon
              points={corners(resolved.components.get(hoverId)!.matrix, resolved.components.get(hoverId)!.w, resolved.components.get(hoverId)!.h).map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="var(--selection)"
              strokeWidth={1 / vp.zoom}
              opacity={0.7}
              style={{ pointerEvents: 'none' }}
            />
          )}

          {/* selection */}
          {selBoxes.map((r) => (
            <polygon
              key={`sel-${r.component.id}`}
              points={corners(r.matrix, r.w, r.h).map((p) => `${p.x},${p.y}`).join(' ')}
              fill="var(--selection)"
              fillOpacity={0.08}
              stroke="var(--selection)"
              strokeWidth={2 / vp.zoom}
              style={{ pointerEvents: 'none' }}
            />
          ))}
          {single && !single.mounted && tool === 'select' && !(drag?.kind === 'move' && drag.moved) && (
            <SelectionHandles r={single} zoom={vp.zoom} onRotate={onRotateHandleDown} onResize={onResizeHandleDown} />
          )}

          {/* guides */}
          {drag?.kind === 'move' &&
            drag.guides.map((g, i) =>
              g.axis === 'x' ? (
                <line key={i} x1={g.pos} x2={g.pos} y1={g.from} y2={g.to} stroke="#ec4899" strokeWidth={1 / vp.zoom} strokeDasharray={`${4 / vp.zoom} ${3 / vp.zoom}`} style={{ pointerEvents: 'none' }} />
              ) : (
                <line key={i} y1={g.pos} y2={g.pos} x1={g.from} x2={g.to} stroke="#ec4899" strokeWidth={1 / vp.zoom} strokeDasharray={`${4 / vp.zoom} ${3 / vp.zoom}`} style={{ pointerEvents: 'none' }} />
              ),
            )}

          {/* marquee */}
          {drag?.kind === 'marquee' && (
            <rect
              x={Math.min(drag.start.x, drag.current.x)}
              y={Math.min(drag.start.y, drag.current.y)}
              width={Math.abs(drag.current.x - drag.start.x)}
              height={Math.abs(drag.current.y - drag.start.y)}
              fill="var(--selection)"
              fillOpacity={0.08}
              stroke="var(--selection)"
              strokeWidth={1 / vp.zoom}
              strokeDasharray={`${4 / vp.zoom} ${3 / vp.zoom}`}
              style={{ pointerEvents: 'none' }}
            />
          )}

          {/* cable tool */}
          {drag?.kind === 'link' &&
            (() => {
              const a = linkPoint(drag.fromId)
              if (!a) return null
              return <line x1={a.x} y1={a.y} x2={drag.current.x} y2={drag.current.y} stroke="#f59e0b" strokeWidth={2 / vp.zoom} strokeDasharray={`${5 / vp.zoom} ${3 / vp.zoom}`} style={{ pointerEvents: 'none' }} />
            })()}

          {/* resize preview */}
          {drag?.kind === 'resize' && (
            <rect x={drag.orig.placement.x} y={drag.orig.placement.y} width={drag.size.w} height={drag.size.h} fill="none" stroke="var(--selection)" strokeWidth={1.5 / vp.zoom} strokeDasharray="4 2" style={{ pointerEvents: 'none' }} />
          )}
        </g>
      </svg>

      {/* drop hint near cursor */}
      {(() => {
        const t = drag?.kind === 'move' && drag.moved ? drag.target : libPreview?.target
        const p = drag?.kind === 'move' && drag.moved ? drag.pointer : libPreview?.world
        if (!p) return null
        const sx = p.x * vp.zoom + vp.x + 16
        const sy = p.y * vp.zoom + vp.y + 16
        return (
          <div className="pointer-events-none absolute z-10 max-w-80 rounded-md border bg-popover/95 px-2 py-1 text-xs shadow-lg" style={{ left: sx, top: sy }}>
            {t ? (
              <>
                <div className="font-semibold">
                  {t.level === 'error' ? '✕' : t.level === 'warning' ? '⚠' : '✓'} {t.label}
                </div>
                {t.message && <div className={t.level === 'error' ? 'text-destructive' : 'text-muted-foreground'}>{t.message}</div>}
              </>
            ) : (
              <div className="text-muted-foreground">Frei platzieren (nicht eingebaut)</div>
            )}
          </div>
        )
      })()}
      {drag?.kind === 'rotate' && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded bg-foreground px-2 py-0.5 text-xs text-background">{Math.round(drag.rot)}°</div>
      )}
    </div>
  )
}

function SelectionHandles({
  r,
  zoom,
  onRotate,
  onResize,
}: {
  r: ReturnType<typeof resolveBuild>['components'] extends Map<Id, infer V> ? V : never
  zoom: number
  onRotate: (e: React.PointerEvent, id: Id) => void
  onResize: (e: React.PointerEvent, id: Id) => void
}) {
  const s = 1 / zoom
  const topCenter = apply(r.matrix, { x: r.w / 2, y: 0 })
  const center = apply(r.matrix, { x: r.w / 2, y: r.h / 2 })
  const dx = topCenter.x - center.x
  const dy = topCenter.y - center.y
  const len = Math.hypot(dx, dy) || 1
  const handle = { x: topCenter.x + (dx / len) * 22 * s, y: topCenter.y + (dy / len) * 22 * s }
  const br = apply(r.matrix, { x: r.w, y: r.h })
  return (
    <g>
      <line x1={topCenter.x} y1={topCenter.y} x2={handle.x} y2={handle.y} stroke="var(--selection)" strokeWidth={s} />
      <circle
        cx={handle.x}
        cy={handle.y}
        r={6 * s}
        fill="var(--card)"
        stroke="var(--selection)"
        strokeWidth={1.5 * s}
        style={{ cursor: 'grab' }}
        onPointerDown={(e) => onRotate(e, r.component.id)}
      >
        <title>Drehen (Shift = frei)</title>
      </circle>
      {r.component.resizable && !r.component.placement.rotation && (
        <rect
          x={br.x - 5 * s}
          y={br.y - 5 * s}
          width={10 * s}
          height={10 * s}
          fill="var(--card)"
          stroke="var(--selection)"
          strokeWidth={1.5 * s}
          style={{ cursor: 'nwse-resize' }}
          onPointerDown={(e) => onResize(e, r.component.id)}
        />
      )}
    </g>
  )
}
