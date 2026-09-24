import { beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore } from '@/store/projectStore'
import { createProject } from '@/utils/factory'
import { findChassisTemplate } from '@/data/chassisCatalog'
import { generateChassisLayout } from '@/utils/generators'
import { analyzeBuild } from '@/utils/compatibility'
import { findFreeSlot, mountComponent } from '@/utils/buildOps'
import { getDeviceRackStandard, getDeviceWeight, isShelfDevice } from '@/utils/device'
import { addDeviceFromTemplate, createBuiltDeviceAction } from '@/store/actions/devices'
import { addComponentFromTemplate } from '@/store/actions/hardware'
import { addCustomDeviceTemplate } from '@/store/actions/project'
import { addRackFromPreset, placeDevice, placeDeviceAuto } from '@/store/actions/rack'
import { emptyBuild, add } from './helpers'

const project = () => useProjectStore.getState().project

describe('drive enclosures (HDD bay unit / JBOD)', () => {
  beforeEach(() => {
    useProjectStore.getState().replaceProject(createProject('Test'))
  })

  it('has drive bays but no mainboard slot', () => {
    const layout = generateChassisLayout(findChassisTemplate('ch-10in-2u-hdd')!.params)
    expect(layout.slots.some((s) => s.kind === 'mainboard')).toBe(false)
    expect(layout.slots.filter((s) => s.kind === 'bay-3.5')).toHaveLength(4)
    expect(layout.slots.filter((s) => s.kind === 'psu')).toHaveLength(0)
  })

  it('does not complain about a missing mainboard, CPU, PSU or network', () => {
    const b = emptyBuild('ch-10in-2u-hdd')
    for (let i = 0; i < 4; i++) {
      const hdd = add(b, 'st-hdd-8t')
      expect(mountComponent(b, hdd.id, findFreeSlot(b, hdd)!).ok).toBe(true)
    }
    const issues = analyzeBuild(b)
    expect(issues.filter((i) => i.level === 'error')).toEqual([])
    expect(issues.some((i) => i.key === 'no-board' || i.key === 'no-net')).toBe(false)
    expect(issues.some((i) => i.key.startsWith('drive-unlinked'))).toBe(false)
    expect(issues.some((i) => i.key === 'enclosure')).toBe(true)
  })

  it('a normal chassis still requires a mainboard', () => {
    expect(analyzeBuild(emptyBuild('ch-2u')).some((i) => i.key === 'no-board' && i.level === 'error')).toBe(true)
  })

  it('a 10" HDD bay unit with drives fits into the DeskPi rack next to the server', () => {
    const rack = addRackFromPreset('r10-deskpi-t2')!
    const t = findChassisTemplate('ch-10in-2u-hdd')!
    const id = createBuiltDeviceAction('storage', 'HDD-Einschub', t.name, t.params, t.id)
    for (let i = 0; i < 4; i++) addComponentFromTemplate(id, 'st-hdd-8t', { auto: true })
    const dev = project().devices[id]
    expect(dev.build!.components.filter((c) => c.mount)).toHaveLength(4)
    expect(dev.hiddenInNetwork).toBe(true)
    expect(getDeviceRackStandard(dev)).toBe('10')
    expect(getDeviceWeight(dev)).toBeGreaterThan(t.params.weightKg)
    expect(placeDevice(id, rack, 3)).toBe(true)
  })
})

describe('custom device templates', () => {
  beforeEach(() => {
    useProjectStore.getState().replaceProject(createProject('Test'))
  })

  it('a custom 10" rack device fits into a 10" rack', () => {
    addCustomDeviceTemplate({ id: 'dtpl-x', kind: 'nas', name: '10" NAS-Einschub', group: 'EIGENE', formFactor: 'rack', rackStandard: '10', heightU: 2, driveBays: 4, ports: [] })
    const rack = addRackFromPreset('r10-deskpi-t2')!
    const id = addDeviceFromTemplate('dtpl-x')!
    expect(project().devices[id].driveBays).toBe(4)
    expect(placeDeviceAuto(id, rack)).toBe(true)
  })

  it('a custom 19" rack device is refused by a 10" rack', () => {
    addCustomDeviceTemplate({ id: 'dtpl-y', kind: 'switch', name: 'Großer Switch', group: 'EIGENE', formFactor: 'rack', rackStandard: '19', heightU: 1, ports: [] })
    const rack = addRackFromPreset('r10-deskpi-t2')!
    const id = addDeviceFromTemplate('dtpl-y')!
    expect(placeDeviceAuto(id, rack)).toBe(false)
  })

  it('a custom desktop device with a shelf height stands on a shelf and is checked by width', () => {
    addCustomDeviceTemplate({ id: 'dtpl-z', kind: 'nas', name: 'Tisch-NAS', group: 'EIGENE', formFactor: 'desktop', heightU: 3, widthMm: 180, ports: [] })
    addCustomDeviceTemplate({ id: 'dtpl-w', kind: 'nas', name: 'Breites NAS', group: 'EIGENE', formFactor: 'desktop', heightU: 3, widthMm: 300, ports: [] })
    const rack = addRackFromPreset('r10-deskpi-t2')!
    const ok = addDeviceFromTemplate('dtpl-z')!
    const wide = addDeviceFromTemplate('dtpl-w')!
    expect(isShelfDevice(project().devices[ok])).toBe(true)
    expect(placeDeviceAuto(ok, rack)).toBe(true)
    expect(placeDeviceAuto(wide, rack)).toBe(false)
  })
})
