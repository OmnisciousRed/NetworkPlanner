import { describe, expect, it } from 'vitest'
import { createDemoProject } from '@/data/sampleProject'
import { analyzeRack, upsRuntimeMinutes } from '@/utils/rack'
import { analyzeBuild } from '@/utils/compatibility'

describe('rack analysis', () => {
  it('calculates height, power, weight and UPS runtime for the demo rack', () => {
    const p = createDemoProject()
    const rack = Object.values(p.racks)[0]
    const a = analyzeRack(p, rack)
    expect(a.heightU).toBe(24)
    expect(a.usedU + a.freeU).toBe(24)
    expect(a.usedU).toBeGreaterThan(10)
    expect(a.powerTypicalW).toBeGreaterThan(500)
    expect(a.powerMaxW).toBeGreaterThanOrEqual(a.powerTypicalW)
    expect(a.weightKg).toBeGreaterThan(rack.emptyWeightKg)
    expect(a.heatBtuH).toBeGreaterThan(0)
    expect(a.ups).toHaveLength(1)
    expect(a.ups[0].runtimeMin).toBeGreaterThan(5)
    expect(a.warnings).toEqual([])
  })

  it('UPS runtime decreases with load', () => {
    expect(upsRuntimeMinutes(864, 300, 2700)).toBeGreaterThan(upsRuntimeMinutes(864, 900, 2700))
  })

  it('all demo servers are fully compatible', () => {
    const p = createDemoProject()
    for (const d of Object.values(p.devices).filter((x) => x.build)) {
      expect(analyzeBuild(d.build!).filter((i) => i.level === 'error' || i.level === 'warning')).toEqual([])
    }
  })
})
