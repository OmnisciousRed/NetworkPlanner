import type {
  ChassisParams,
  ComponentSpecsMap,
  HardwareBuild,
  HardwareComponent,
  Id,
  InternalLinkKind,
  Placement,
  Project,
  Size,
} from '@/models'
import { uid } from '@/models'
import { findComponentTemplate } from '@/data/componentCatalog'
import { createComponent, createNicPorts, createPort } from '@/utils/factory'
import { generateChassisLayout, generateMainboardLayout, pcieCardSize } from '@/utils/generators'
import { resolveBuild } from '@/utils/buildLayout'
import {
  addComponent,
  autoLinkAllDrives,
  findFreeSlot,
  mountComponent,
  removeComponents,
  setDriveController as setDriveControllerOp,
  trayPlacement,
  unmountComponent,
  type MountResult,
  type SlotTarget,
} from '@/utils/buildOps'
import { apply, matRotation, normalizeAngle, rotate, type Mat } from '@/utils/geometry'
import { commit, getProject, useProjectStore } from '../projectStore'
import { toast } from '../uiStore'
import { purgeConnections } from './devices'

function buildOf(draft: Project, deviceId: Id): HardwareBuild | undefined {
  return draft.devices[deviceId]?.build
}

export function placementFromMatrix(m: Mat, w: number, h: number): Placement {
  const r = normalizeAngle(matRotation(m))
  const p0 = apply(m, { x: 0, y: 0 })
  const rc = apply(rotate(r), { x: w / 2, y: h / 2 })
  return { x: p0.x - w / 2 + rc.x, y: p0.y - h / 2 + rc.y, rotation: r }
}

function undo() {
  useProjectStore.getState().undo()
}

function reportMount(result: MountResult, name: string, build: HardwareBuild) {
  if (!result.ok) {
    toast(`${name} passt hier nicht: ${result.reason}`, 'error')
    return
  }
  for (const id of result.displacedIds) {
    const c = build.components.find((x) => x.id === id)
    if (c) toast(`${c.name} wurde ausgebaut und in die Ablage gelegt`, 'info', { label: 'Rückgängig', run: undo })
  }
  if (result.warnings.length) toast(`⚠ ${result.warnings.join(' · ')}`, 'warning')
}

/**
 * Creates a component from a library template in a device build.
 * - target: mount into the given slot
 * - auto: mount into the best free compatible slot
 * - otherwise it is placed freely at `placement`
 */
export function addComponentFromTemplate(
  deviceId: Id,
  templateId: string,
  opts: { placement?: Placement; target?: SlotTarget | null; auto?: boolean } = {},
): Id | null {
  const project = getProject()
  const device = project.devices[deviceId]
  if (!device?.build) return null
  const t = findComponentTemplate(templateId, project.customTemplates.components)
  if (!t) return null
  const c = createComponent(t, opts.placement ?? { x: 0, y: 0, rotation: 0 })
  let result: MountResult | null = null
  let note: string | null = null
  commit(`${c.name} hinzugefügt`, (draft) => {
    const build = buildOf(draft, deviceId)!
    addComponent(build, c)
    let target = opts.target ?? null
    if (!target && opts.auto) {
      target = findFreeSlot(build, build.components[build.components.length - 1])
      if (!target) note = `Kein freier passender Steckplatz für ${c.name} – in die Ablage gelegt`
    }
    if (target) {
      result = mountComponent(build, c.id, target)
      if (!result.ok) {
        const inst = build.components.find((x) => x.id === c.id)!
        if (!opts.placement) inst.placement = trayPlacement(build, inst, [inst.id])
      }
    } else if (!opts.placement) {
      const inst = build.components.find((x) => x.id === c.id)!
      inst.placement = trayPlacement(build, inst, [inst.id])
    }
    if (c.kind === 'hba' || c.kind === 'raid' || c.kind === 'mainboard') autoLinkAllDrives(build)
  })
  if (note) toast(note, 'warning')
  if (result) reportMount(result, c.name, getProject().devices[deviceId].build!)
  return c.id
}

/** drop of an existing component: into a slot (target) or freely at placement */
export function dropComponent(deviceId: Id, id: Id, placement: Placement, target?: SlotTarget | null) {
  let result: MountResult | null = null
  let name = ''
  commit(target ? 'Bauteil eingebaut' : 'Bauteil verschoben', (draft) => {
    const build = buildOf(draft, deviceId)
    const c = build?.components.find((x) => x.id === id)
    if (!build || !c) return
    name = c.name
    const wasMount = c.mount ? { ...c.mount } : undefined
    if (target) {
      if (wasMount && wasMount.parentId === target.ownerId && wasMount.slotId === target.slotId) return
      unmountComponent(build, id, placement)
      result = mountComponent(build, id, target)
      if (!result.ok) c.placement = placement
      if (result.ok && (c.kind === 'hba' || c.kind === 'raid')) autoLinkAllDrives(build)
    } else {
      unmountComponent(build, id, placement)
    }
  })
  if (result) reportMount(result, name, getProject().devices[deviceId].build!)
}

export function moveComponents(deviceId: Id, placements: Record<Id, Placement>, label = 'Bauteile verschoben') {
  commit(label, (draft) => {
    const build = buildOf(draft, deviceId)
    if (!build) return
    for (const [id, p] of Object.entries(placements)) unmountComponent(build, id, p)
  })
}

export function installComponent(deviceId: Id, id: Id, target?: SlotTarget) {
  let result: MountResult | null = null
  let name = ''
  commit('Bauteil eingebaut', (draft) => {
    const build = buildOf(draft, deviceId)
    const c = build?.components.find((x) => x.id === id)
    if (!build || !c) return
    name = c.name
    const t = target ?? findFreeSlot(build, c)
    if (!t) {
      result = { ok: false, reason: 'kein freier kompatibler Steckplatz', displacedIds: [], warnings: [] }
      return
    }
    result = mountComponent(build, id, t)
  })
  if (result) reportMount(result, name, getProject().devices[deviceId].build!)
}

export function uninstallComponents(deviceId: Id, ids: Id[]) {
  commit('Bauteil ausgebaut', (draft) => {
    const build = buildOf(draft, deviceId)
    if (!build) return
    for (const id of ids) {
      const c = build.components.find((x) => x.id === id)
      if (!c?.mount) continue
      unmountComponent(build, id, trayPlacement(build, c, [id]))
    }
  })
}

export function rotateComponents(deviceId: Id, ids: Id[], delta: number) {
  const build = getProject().devices[deviceId]?.build
  if (!build) return
  const loose = ids.filter((id) => !build.components.find((c) => c.id === id)?.mount)
  if (!loose.length) {
    toast('Eingebaute Bauteile folgen der Ausrichtung ihres Steckplatzes', 'info')
    return
  }
  commit('Bauteil gedreht', (draft) => {
    const b = buildOf(draft, deviceId)!
    for (const id of loose) {
      const c = b.components.find((x) => x.id === id)
      if (c) c.placement.rotation = normalizeAngle(c.placement.rotation + delta)
    }
  })
}

export function setComponentRotation(deviceId: Id, id: Id, rotation: number) {
  commit('Bauteil gedreht', (draft) => {
    const c = buildOf(draft, deviceId)?.components.find((x) => x.id === id)
    if (c && !c.mount) c.placement.rotation = normalizeAngle(rotation)
  }, { mergeKey: `rot-${id}` })
}

export function resizeComponent(deviceId: Id, id: Id, size: Size, placement?: Placement) {
  commit('Bauteil skaliert', (draft) => {
    const c = buildOf(draft, deviceId)?.components.find((x) => x.id === id)
    if (!c) return
    c.size = { w: Math.max(10, Math.round(size.w)), h: Math.max(6, Math.round(size.h)) }
    if (placement) c.placement = placement
    if ('lengthMm' in c.specs) (c.specs as { lengthMm: number }).lengthMm = c.size.w
  })
}

/** loose copies of components at their current world position (for clipboard / duplicate) */
export function snapshotComponents(build: HardwareBuild, ids: Id[]): HardwareComponent[] {
  const resolved = resolveBuild(build)
  return ids
    .map((id) => {
      const r = resolved.components.get(id)
      if (!r) return null
      const c = structuredClone(r.component) as HardwareComponent
      c.placement = r.mounted ? placementFromMatrix(r.matrix, c.size.w, c.size.h) : { ...c.placement }
      c.mount = undefined
      return c
    })
    .filter((c): c is HardwareComponent => !!c)
}

export function pasteComponents(deviceId: Id, items: HardwareComponent[], offset = { x: 24, y: 24 }): Id[] {
  const newIds: Id[] = []
  commit(items.length === 1 ? `${items[0].name} eingefügt` : `${items.length} Bauteile eingefügt`, (draft) => {
    const build = buildOf(draft, deviceId)
    if (!build) return
    const groupMap = new Map<Id, Id>()
    for (const src of items) {
      const c = structuredClone(src) as HardwareComponent
      c.id = uid('cmp')
      c.mount = undefined
      c.placement = { ...c.placement, x: c.placement.x + offset.x, y: c.placement.y + offset.y }
      if (c.groupId) {
        if (!groupMap.has(c.groupId)) groupMap.set(c.groupId, uid('grp'))
        c.groupId = groupMap.get(c.groupId)
      }
      if (c.ports) {
        c.ports = c.ports.map((p) => ({ ...p, id: uid('port'), ipAddress: undefined, macAddress: undefined, name: /^NIC \d+$/.test(p.name) ? 'Port 1' : p.name }))
      }
      addComponent(build, c)
      newIds.push(c.id)
    }
  })
  return newIds
}

export function duplicateComponents(deviceId: Id, ids: Id[]): Id[] {
  const build = getProject().devices[deviceId]?.build
  if (!build || !ids.length) return []
  return pasteComponents(deviceId, snapshotComponents(build, ids))
}

export function deleteComponents(deviceId: Id, ids: Id[]) {
  if (!ids.length) return
  let removed = 0
  let purged = 0
  commit(ids.length === 1 ? 'Bauteil gelöscht' : `${ids.length} Bauteile gelöscht`, (draft) => {
    const build = buildOf(draft, deviceId)
    if (!build) return
    const { removedIds, removedPortIds } = removeComponents(build, ids)
    removed = removedIds.length
    purged = purgeConnections(draft, { portIds: removedPortIds })
  })
  if (removed) {
    const extra = purged ? ` und ${purged} Netzwerkverbindung${purged > 1 ? 'en' : ''} entfernt` : ''
    toast(`${removed} Bauteil${removed > 1 ? 'e' : ''}${extra} gelöscht`, 'info', { label: 'Rückgängig', run: undo })
  }
}

export function updateComponent(
  deviceId: Id,
  id: Id,
  recipe: (c: HardwareComponent) => void,
  label = 'Bauteil geändert',
  mergeKey?: string,
) {
  commit(label, (draft) => {
    const c = buildOf(draft, deviceId)?.components.find((x) => x.id === id)
    if (c) recipe(c)
  }, { mergeKey })
}

/** updates specs and keeps derived data (NIC ports, card size, mainboard slots) consistent */
export function updateComponentSpecs<K extends keyof ComponentSpecsMap>(
  deviceId: Id,
  id: Id,
  patch: Partial<ComponentSpecsMap[K]>,
  mergeKey?: string,
) {
  commit('Eigenschaft geändert', (draft) => {
    const build = buildOf(draft, deviceId)
    const c = build?.components.find((x) => x.id === id)
    if (!build || !c) return
    Object.assign(c.specs, patch)
    if (c.kind === 'nic') {
      const ports = c.ports ?? []
      const want = Math.max(0, Math.min(16, Math.round(c.specs.portCount)))
      if (ports.length > want) {
        const removed = ports.slice(want).map((p) => p.id)
        c.ports = ports.slice(0, want)
        purgeConnections(draft, { portIds: removed })
      } else if (ports.length < want) {
        const extra = createNicPorts({ ...c.specs, portCount: want - ports.length })
        let max = 0
        for (const comp of build.components)
          for (const p of comp.ports ?? []) {
            const m = /^NIC (\d+)$/.exec(p.name)
            if (m) max = Math.max(max, Number(m[1]))
          }
        c.ports = [...ports, ...extra.map((p) => ({ ...p, name: `NIC ${++max}` }))]
      }
      for (const p of c.ports ?? []) {
        p.speed = c.specs.speed
        p.connector = c.specs.connector
      }
    }
    if ('lengthMm' in c.specs && (c.kind === 'nic' || c.kind === 'gpu' || c.kind === 'hba' || c.kind === 'raid' || c.kind === 'pcie')) {
      c.size = pcieCardSize(c.specs.lengthMm, c.specs.lowProfile)
    }
    if (c.kind === 'mainboard') {
      const layout = generateMainboardLayout(c.specs)
      c.size = layout.size
      c.slots = layout.slots
      const valid = new Set(layout.slots.map((s) => s.id))
      for (const child of build.components) {
        if (child.mount?.parentId === c.id && !valid.has(child.mount.slotId)) {
          child.mount = undefined
          child.placement = trayPlacement(build, child, [child.id])
        }
      }
      // onboard NICs
      const existing = c.ports ?? []
      c.ports = c.specs.onboardNics.map((n, i) => {
        const prev = existing[i]
        return prev ? { ...prev, name: n.name, speed: n.speed, connector: n.connector } : createPort({ name: n.name, speed: n.speed, connector: n.connector, role: n.role ?? 'data' })
      })
      const removed = existing.slice(c.specs.onboardNics.length).map((p) => p.id)
      if (removed.length) purgeConnections(draft, { portIds: removed })
    }
  }, { mergeKey })
}

export function setDriveController(deviceId: Id, driveId: Id, controllerId: Id | null) {
  commit('Laufwerk-Controller geändert', (draft) => {
    const build = buildOf(draft, deviceId)
    if (build) setDriveControllerOp(build, driveId, controllerId)
  })
}

export function addInternalLink(deviceId: Id, fromId: Id, toId: Id, kind: InternalLinkKind = 'custom', label?: string) {
  if (fromId === toId) return
  commit('Interne Verbindung erstellt', (draft) => {
    const build = buildOf(draft, deviceId)
    if (!build) return
    if (build.links.some((l) => (l.fromId === fromId && l.toId === toId) || (l.fromId === toId && l.toId === fromId))) return
    build.links.push({ id: uid('lnk'), fromId, toId, kind, label })
  })
}

export function removeInternalLink(deviceId: Id, linkId: Id) {
  commit('Interne Verbindung entfernt', (draft) => {
    const build = buildOf(draft, deviceId)
    if (build) build.links = build.links.filter((l) => l.id !== linkId)
  })
}

export function groupComponents(deviceId: Id, ids: Id[]) {
  if (ids.length < 2) return
  const gid = uid('grp')
  commit('Bauteile gruppiert', (draft) => {
    const build = buildOf(draft, deviceId)
    build?.components.forEach((c) => {
      if (ids.includes(c.id)) c.groupId = gid
    })
  })
}

export function ungroupComponents(deviceId: Id, ids: Id[]) {
  commit('Gruppierung aufgehoben', (draft) => {
    const build = buildOf(draft, deviceId)
    const groups = new Set(build?.components.filter((c) => ids.includes(c.id)).map((c) => c.groupId))
    build?.components.forEach((c) => {
      if (c.groupId && groups.has(c.groupId)) c.groupId = undefined
    })
  })
}

export function reorderComponents(deviceId: Id, ids: Id[], to: 'front' | 'back') {
  commit(to === 'front' ? 'In den Vordergrund' : 'In den Hintergrund', (draft) => {
    const build = buildOf(draft, deviceId)
    if (!build) return
    const sel = build.components.filter((c) => ids.includes(c.id))
    const rest = build.components.filter((c) => !ids.includes(c.id))
    build.components = to === 'front' ? [...rest, ...sel] : [...sel, ...rest]
  })
}

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' | 'distribute-h' | 'distribute-v' | 'center-chassis'

/** align loose components (mounted ones are fixed by their slots) */
export function alignComponents(deviceId: Id, ids: Id[], mode: AlignMode) {
  const build = getProject().devices[deviceId]?.build
  if (!build) return
  const resolved = resolveBuild(build)
  const items = ids
    .map((id) => resolved.components.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r && !r.mounted)
  if (!items.length) {
    toast('Nur lose Bauteile können ausgerichtet werden', 'info')
    return
  }
  const minX = Math.min(...items.map((r) => r.aabb.x))
  const maxX = Math.max(...items.map((r) => r.aabb.x + r.aabb.w))
  const minY = Math.min(...items.map((r) => r.aabb.y))
  const maxY = Math.max(...items.map((r) => r.aabb.y + r.aabb.h))
  const out: Record<Id, Placement> = {}
  const shift = (r: (typeof items)[number], dx: number, dy: number) => {
    const p = r.component.placement
    out[r.component.id] = { ...p, x: p.x + dx, y: p.y + dy }
  }
  switch (mode) {
    case 'left':
      items.forEach((r) => shift(r, minX - r.aabb.x, 0))
      break
    case 'right':
      items.forEach((r) => shift(r, maxX - (r.aabb.x + r.aabb.w), 0))
      break
    case 'hcenter':
      items.forEach((r) => shift(r, (minX + maxX) / 2 - (r.aabb.x + r.aabb.w / 2), 0))
      break
    case 'top':
      items.forEach((r) => shift(r, 0, minY - r.aabb.y))
      break
    case 'bottom':
      items.forEach((r) => shift(r, 0, maxY - (r.aabb.y + r.aabb.h)))
      break
    case 'vcenter':
      items.forEach((r) => shift(r, 0, (minY + maxY) / 2 - (r.aabb.y + r.aabb.h / 2)))
      break
    case 'distribute-h': {
      if (items.length < 3) return toast('Zum Verteilen mindestens 3 Bauteile auswählen', 'info')
      const sorted = [...items].sort((a, b) => a.aabb.x - b.aabb.x)
      const total = sorted.reduce((s, r) => s + r.aabb.w, 0)
      const gap = (maxX - minX - total) / (sorted.length - 1)
      let x = minX
      for (const r of sorted) {
        shift(r, x - r.aabb.x, 0)
        x += r.aabb.w + gap
      }
      break
    }
    case 'distribute-v': {
      if (items.length < 3) return toast('Zum Verteilen mindestens 3 Bauteile auswählen', 'info')
      const sorted = [...items].sort((a, b) => a.aabb.y - b.aabb.y)
      const total = sorted.reduce((s, r) => s + r.aabb.h, 0)
      const gap = (maxY - minY - total) / (sorted.length - 1)
      let y = minY
      for (const r of sorted) {
        shift(r, 0, y - r.aabb.y)
        y += r.aabb.h + gap
      }
      break
    }
    case 'center-chassis': {
      const cx = build.chassis.size.w / 2
      const cy = build.chassis.size.h / 2
      const dx = cx - (minX + maxX) / 2
      const dy = cy - (minY + maxY) / 2
      items.forEach((r) => shift(r, dx, dy))
      break
    }
  }
  moveComponents(deviceId, out, 'Bauteile ausgerichtet')
}

/** neatly arranges all loose parts in the tray (auto layout) */
export function arrangeTray(deviceId: Id) {
  commit('Ablage aufgeräumt', (draft) => {
    const build = buildOf(draft, deviceId)
    if (!build) return
    const loose = build.components.filter((c) => !c.mount)
    const x0 = build.chassis.size.w + 60
    let x = x0
    let y = 0
    let rowH = 0
    const maxW = 520
    for (const c of loose) {
      if (x + c.size.w > x0 + maxW && x > x0) {
        x = x0
        y += rowH + 14
        rowH = 0
      }
      c.placement = { x, y, rotation: 0 }
      x += c.size.w + 14
      rowH = Math.max(rowH, c.size.h)
    }
  })
}

/** installs every loose part into a free compatible slot */
export function autoInstallLoose(deviceId: Id) {
  let installed = 0
  let failed = 0
  commit('Lose Bauteile automatisch eingebaut', (draft) => {
    const build = buildOf(draft, deviceId)
    if (!build) return
    const order = ['mainboard', 'cpu', 'ram', 'storage', 'nic', 'gpu', 'hba', 'raid', 'pcie', 'psu', 'fan', 'bbu', 'custom']
    const loose = build.components.filter((c) => !c.mount).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
    for (const c of loose) {
      const t = findFreeSlot(build, c)
      if (t && mountComponent(build, c.id, t).ok) installed++
      else failed++
    }
    autoLinkAllDrives(build)
  })
  toast(`${installed} Bauteil(e) eingebaut${failed ? `, ${failed} ohne passenden Steckplatz` : ''}`, failed ? 'warning' : 'success')
}

export function updateChassisParams(deviceId: Id, patch: Partial<ChassisParams>, name?: string) {
  commit('Gehäuse geändert', (draft) => {
    const dev = draft.devices[deviceId]
    const build = dev?.build
    if (!dev || !build) return
    Object.assign(build.chassis.params, patch)
    if (name) build.chassis.name = name
    const layout = generateChassisLayout(build.chassis.params)
    build.chassis.size = layout.size
    build.chassis.slots = layout.slots
    const valid = new Set(layout.slots.map((s) => s.id))
    for (const c of build.components) {
      if (c.mount?.parentId === 'chassis' && !valid.has(c.mount.slotId)) {
        c.mount = undefined
        c.placement = trayPlacement(build, c, [c.id])
      }
    }
    dev.formFactor = build.chassis.params.formFactor === 'rack' ? 'rack' : 'tower'
    dev.heightU = build.chassis.params.formFactor === 'rack' ? build.chassis.params.heightU : undefined
    dev.depthMm = build.chassis.params.depthMm
    if (dev.formFactor !== 'rack') dev.rackPlacement = undefined
  })
}
