import { beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore } from '@/store/projectStore'
import { createProject, createDeviceFromTemplate, createRack } from '@/utils/factory'
import { findDeviceTemplate } from '@/data/deviceCatalog'
import { findChassisTemplate } from '@/data/chassisCatalog'
import { RACK_PRESETS } from '@/data/rackCatalog'
import { generateChassisLayout } from '@/utils/generators'
import { canPlace, analyzeRack, widthProblem } from '@/utils/rack'
import { getDeviceRackStandard } from '@/utils/device'
import { addDeviceFromTemplate, createBuiltDeviceAction } from '@/store/actions/devices'
import { addComponentFromTemplate } from '@/store/actions/hardware'
import { addRackFromPreset, fillWithBlanks, placeDevice, placeDeviceAuto, updateRack } from '@/store/actions/rack'
import { findFreeSlot, mountComponent } from '@/utils/buildOps'
import { emptyBuild, add } from './helpers'

const project = () => useProjectStore.getState().project

function template(id: string) {
  const t = findDeviceTemplate(id)
  if (!t) throw new Error(`missing template ${id}`)
  return createDeviceFromTemplate(t)
}

describe('10-inch racks', () => {
  beforeEach(() => {
    useProjectStore.getState().replaceProject(createProject('Test'))
  })

  it('creates the DeskPi RackMate T2 from its preset', () => {
    const id = addRackFromPreset('r10-deskpi-t2')!
    const rack = project().racks[id]
    expect(rack.name).toBe('DeskPi RackMate T2')
    expect(rack.standard).toBe('10')
    expect(rack.heightU).toBe(12)
    expect(rack.emptyWeightKg).toBeCloseTo(6.9)
    // second rack from the same preset gets a unique name
    const id2 = addRackFromPreset('r10-deskpi-t2')!
    expect(project().racks[id2].name).not.toBe(rack.name)
  })

  it('every preset has a valid standard and height', () => {
    for (const p of RACK_PRESETS) {
      expect(['19', '10']).toContain(p.standard)
      expect(p.heightU).toBeGreaterThan(0)
    }
  })

  it('refuses a 19" device in a 10" rack with a clear reason', () => {
    const rack = createRack('Mini', 12, '10')
    const sw = template('dev-firewall')
    expect(getDeviceRackStandard(sw)).toBe('19')
    const check = canPlace({ ...createProject('x'), racks: { [rack.id]: rack } }, rack.id, sw, 1)
    expect(check.ok).toBe(false)
    expect(check.reason).toMatch(/19-Zoll/)
  })

  it('accepts 10" devices and desktop devices on a shelf in a 10" rack', () => {
    const id = addRackFromPreset('r10-deskpi-t2')!
    const sw = addDeviceFromTemplate('rack10-switch-8')!
    const pi = addDeviceFromTemplate('dev-rpi')!
    const mini = addDeviceFromTemplate('dev-minipc')!
    expect(placeDeviceAuto(sw, id)).toBe(true)
    expect(placeDeviceAuto(pi, id)).toBe(true)
    expect(placeDeviceAuto(mini, id)).toBe(true)
    const a = analyzeRack(project(), project().racks[id])
    expect(a.warnings).toEqual([])
    expect(a.usedU).toBeGreaterThanOrEqual(3)
  })

  it('10" devices also fit into a 19" rack', () => {
    const rack = createRack('Groß', 42, '19')
    expect(widthProblem(rack, template('rack10-switch-8'))).toBeNull()
  })

  it('placing a 19" server into the 10" rack via the store is rejected', () => {
    const id = addRackFromPreset('r10-deskpi-t2')!
    const t = findChassisTemplate('ch-1u')!
    const srv = createBuiltDeviceAction('server', 'Big', t.name, t.params, t.id)
    expect(placeDevice(srv, id, 1)).toBe(false)
    expect(project().devices[srv].rackPlacement).toBeUndefined()
  })

  it('a self-built 10" server fits into the 10" rack', () => {
    const id = addRackFromPreset('r10-deskpi-t2')!
    const t = findChassisTemplate('ch-10in-2u')!
    const srv = createBuiltDeviceAction('server', 'Mini-Server', t.name, t.params, t.id)
    addComponentFromTemplate(srv, 'psu-sfx-450', { auto: true })
    expect(getDeviceRackStandard(project().devices[srv])).toBe('10')
    expect(placeDevice(srv, id, 1)).toBe(true)
  })

  it('switching an occupied rack to 10" warns about 19" devices', () => {
    const id = addRackFromPreset('r19-12')!
    const sw = addDeviceFromTemplate('dev-firewall')!
    expect(placeDeviceAuto(sw, id)).toBe(true)
    updateRack(id, { standard: '10' })
    const a = analyzeRack(project(), project().racks[id])
    expect(a.warnings.some((w) => w.includes('19-Zoll'))).toBe(true)
  })

  it('fills a 10" rack with 10" blanking panels', () => {
    const id = addRackFromPreset('r10-6')!
    fillWithBlanks(id)
    const blanks = Object.values(project().devices).filter((d) => d.rackPlacement?.rackId === id)
    expect(blanks).toHaveLength(6)
    expect(blanks.every((d) => getDeviceRackStandard(d) === '10')).toBe(true)
  })

  it('the 10" chassis generator makes a compact layout with an SFX bay', () => {
    const t = findChassisTemplate('ch-10in-2u')!
    const layout = generateChassisLayout(t.params)
    const psuBays = layout.slots.filter((s) => s.kind === 'psu')
    expect(psuBays).toHaveLength(1)
    expect(psuBays[0].meta?.psuFormFactor).toContain('SFX')
    const big = generateChassisLayout(findChassisTemplate('ch-2u')!.params)
    expect(layout.size.w).toBeLessThan(big.size.w)
  })

  it('an SFX PSU is compatible in the 10" chassis, a CRPS PSU is not', () => {
    const b = emptyBuild('ch-10in-2u')
    const sfx = add(b, 'psu-sfx-450')
    const slot = findFreeSlot(b, sfx)
    expect(slot).not.toBeNull()
    expect(mountComponent(b, sfx.id, slot!).ok).toBe(true)
    const b2 = emptyBuild('ch-10in-2u')
    const crps = add(b2, 'psu-crps-800')
    expect(findFreeSlot(b2, crps)).toBeNull()
  })
})
