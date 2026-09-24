import type { Device, Id, Rack, RackStandard } from '@/models'
import { rackStandardOf } from '@/models'
import { findRackPreset } from '@/data/rackCatalog'
import { findDeviceTemplate } from '@/data/deviceCatalog'
import { createDeviceFromTemplate, createRack } from '@/utils/factory'
import { canPlace, findFreePosition, rackOccupancy } from '@/utils/rack'
import { getDeviceHeightU } from '@/utils/device'
import { commit, getProject } from '../projectStore'
import { baseNameFromTemplate, uniqueDeviceName } from './devices'
import { toast } from '../uiStore'

export function addRack(name?: string, heightU = 42, standard: RackStandard = '19'): Id {
  const project = getProject()
  const n = name ?? `Rack ${String(Object.keys(project.racks).length + 1).padStart(2, '0')}`
  const rack = createRack(n, heightU, standard)
  commit(`${rack.name} erstellt`, (d) => {
    d.racks[rack.id] = rack
  })
  return rack.id
}

/** creates a rack from a preset (e.g. a 10" DeskPi RackMate T2) */
export function addRackFromPreset(presetId: string): Id | null {
  const preset = findRackPreset(presetId)
  if (!preset) return null
  const project = getProject()
  const { id: _presetId, label: _label, description: _description, defaultName, ...values } = preset
  const taken = new Set(Object.values(project.racks).map((r) => r.name))
  let name = defaultName ?? `Rack ${String(Object.keys(project.racks).length + 1).padStart(2, '0')}`
  for (let i = 2; taken.has(name); i++) name = `${defaultName ?? 'Rack'} ${String(i).padStart(2, '0')}`
  const rack: Rack = { ...createRack(name, values.heightU, values.standard ?? '19'), ...values, name }
  commit(`${rack.name} erstellt`, (d) => {
    d.racks[rack.id] = rack
  })
  return rack.id
}

export function updateRack(id: Id, patch: Partial<Rack>, mergeKey?: string) {
  commit('Rack geändert', (d) => {
    const r = d.racks[id]
    if (r) Object.assign(r, patch)
  }, { mergeKey })
}

export function deleteRack(id: Id) {
  commit('Rack gelöscht', (d) => {
    delete d.racks[id]
    for (const dev of Object.values(d.devices)) if (dev.rackPlacement?.rackId === id) dev.rackPlacement = undefined
  })
}

export function placeDevice(deviceId: Id, rackId: Id, positionU: number, face: 'front' | 'rear' = 'front'): boolean {
  const project = getProject()
  const device = project.devices[deviceId]
  if (!device) return false
  const check = canPlace(project, rackId, device, positionU)
  if (!check.ok) {
    toast(check.reason ?? 'Platzierung nicht möglich', 'error')
    return false
  }
  const rack = project.racks[rackId]
  const h = getDeviceHeightU(device) ?? 1
  commit(`${device.name} → ${rack.name} U${positionU}${h > 1 ? `–U${positionU + h - 1}` : ''}`, (d) => {
    const dev = d.devices[deviceId]
    if (dev) dev.rackPlacement = { rackId, positionU, face }
  })
  return true
}

export function placeDeviceAuto(deviceId: Id, rackId: Id): boolean {
  const project = getProject()
  const device = project.devices[deviceId]
  if (!device) return false
  const pos = findFreePosition(project, rackId, device, device.kind === 'ups')
  if (pos === null) {
    toast(`Kein freier Platz für ${device.name} in ${project.racks[rackId]?.name}`, 'error')
    return false
  }
  return placeDevice(deviceId, rackId, pos)
}

export function unplaceDevice(deviceId: Id) {
  const device = getProject().devices[deviceId]
  if (!device?.rackPlacement) return
  commit(`${device.name} aus Rack entfernt`, (d) => {
    const dev = d.devices[deviceId]
    if (dev) dev.rackPlacement = undefined
  })
}

/** creates a device from a template directly inside a rack */
export function addRackDeviceFromTemplate(templateId: string, rackId: Id, positionU: number): Id | null {
  const project = getProject()
  const t = findDeviceTemplate(templateId, project.customTemplates.devices)
  if (!t) return null
  const tmp = createDeviceFromTemplate(t)
  const check = canPlace(project, rackId, tmp, positionU)
  if (!check.ok) {
    toast(check.reason ?? 'Kein Platz', 'error')
    return null
  }
  tmp.name = uniqueDeviceName(project, baseNameFromTemplate(t.name))
  tmp.rackPlacement = { rackId, positionU, face: 'front' }
  commit(`${tmp.name} ins Rack eingesetzt`, (d) => {
    d.devices[tmp.id] = tmp
  })
  return tmp.id
}

/** closes all free units with blank panels (improves airflow) */
export function fillWithBlanks(rackId: Id) {
  const project = getProject()
  const rack = project.racks[rackId]
  if (!rack) return
  const occ = rackOccupancy(project, rackId)
  const t = findDeviceTemplate(rackStandardOf(rack) === '10' ? 'rack10-blank-1u' : 'rack-blank-1u')!
  const created: Device[] = []
  for (let u = 1; u <= rack.heightU; u++) {
    if (occ.has(u)) continue
    const dev = createDeviceFromTemplate(t, { name: `Blindblende U${u}` })
    dev.rackPlacement = { rackId, positionU: u, face: 'front' }
    created.push(dev)
  }
  if (!created.length) return toast('Keine freien Höheneinheiten', 'info')
  commit(`${created.length} Blindblenden eingesetzt`, (d) => {
    for (const dev of created) d.devices[dev.id] = dev
  })
}

export function removeBlanks(rackId: Id) {
  commit('Blindblenden entfernt', (d) => {
    for (const [id, dev] of Object.entries(d.devices))
      if (dev.kind === 'blank-panel' && dev.rackPlacement?.rackId === rackId) delete d.devices[id]
  })
}
