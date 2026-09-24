import { describe, expect, it } from 'vitest'
import { createDemoProject } from '@/data/sampleProject'
import { analyzeBuild } from '@/utils/compatibility'
import { summarizeBuild } from '@/utils/buildSummary'
import { analyzeRack } from '@/utils/rack'
import { collectIpam } from '@/utils/ip'

describe('demo project', () => {
  it('builds a consistent homelab', () => {
    const p = createDemoProject()
    const built = Object.values(p.devices).filter((d) => d.build)
    expect(built).toHaveLength(3)
    for (const d of built) {
      const issues = analyzeBuild(d.build!)
      const bad = issues.filter((i) => i.level === 'error' || i.level === 'warning')
      console.log(d.name, summarizeBuild(d.build!).power, bad.map((i) => i.message), issues.filter(i=>i.level==='ok').map(i=>i.message))
      expect(bad).toEqual([])
    }
    const rack = Object.values(p.racks)[0]
    const a = analyzeRack(p, rack)
    console.log(a)
    const ipam = collectIpam(p).filter((e) => e.issues.length)
    console.log(ipam)
  })
})
