import { describe, expect, it } from 'vitest'
import { generateChassisLayout, generateMainboardLayout } from '@/utils/generators'
import { findComponentTemplate } from '@/data/componentCatalog'
import { CHASSIS_CATALOG } from '@/data/chassisCatalog'
import type { MainboardSpecs } from '@/models'

describe('layout generators', () => {
  it('creates one slot per socket, DIMM, PCIe and M.2 position', () => {
    const t = findComponentTemplate('mb-x13dei')!
    const specs = t.specs as MainboardSpecs
    const layout = generateMainboardLayout(specs)
    const count = (k: string) => layout.slots.filter((s) => s.kind === k).length
    expect(count('cpu')).toBe(2)
    expect(count('dimm')).toBe(16)
    expect(count('pcie')).toBe(specs.pcieSlots.length)
    expect(count('m2')).toBe(specs.m2Slots.length)
    // DIMMs of the second CPU are assigned to CPU index 1
    expect(layout.slots.filter((s) => s.kind === 'dimm' && s.meta.cpuIndex === 1)).toHaveLength(8)
    // slot ids are unique
    expect(new Set(layout.slots.map((s) => s.id)).size).toBe(layout.slots.length)
  })

  it('keeps slots inside the board outline', () => {
    for (const id of ['mb-x13dei', 'mb-h13ssl', 'mb-b650i', 'mb-z790']) {
      const layout = generateMainboardLayout(findComponentTemplate(id)!.specs as MainboardSpecs)
      for (const s of layout.slots) {
        expect(s.rect.x).toBeGreaterThanOrEqual(0)
        expect(s.rect.y).toBeGreaterThanOrEqual(0)
        expect(s.rect.x + s.rect.w).toBeLessThanOrEqual(layout.size.w)
        expect(s.rect.y + s.rect.h).toBeLessThanOrEqual(layout.size.h)
      }
    }
  })

  it('generates the configured number of bays for every chassis template', () => {
    for (const t of CHASSIS_CATALOG) {
      const layout = generateChassisLayout(t.params)
      const count = (k: string) => layout.slots.filter((s) => s.kind === k).length
      expect(count('bay-3.5')).toBe(t.params.bays35)
      expect(count('bay-2.5')).toBe(t.params.bays25)
      expect(count('psu')).toBe(t.params.psuBays)
      expect(count('fan')).toBe(t.params.fanSlots)
      expect(count('mainboard')).toBe(1)
      expect(layout.slots.filter((s) => s.meta.nvme).length).toBe(t.params.nvmeBays)
    }
  })
})
