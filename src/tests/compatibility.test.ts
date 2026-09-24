import { describe, expect, it } from 'vitest'
import { analyzeBuild, checkFit } from '@/utils/compatibility'
import { findFreeSlot, getSlot, mountComponent } from '@/utils/buildOps'
import { add, emptyBuild, part } from './helpers'

function withBoard(boardId = 'mb-x13dei', chassis = 'ch-2u') {
  const b = emptyBuild(chassis)
  const board = add(b, boardId)
  expect(mountComponent(b, board.id, { ownerId: 'chassis', slotId: 'mainboard' }).ok).toBe(true)
  return { b, board }
}

describe('hardware compatibility', () => {
  it('rejects a CPU with the wrong socket', () => {
    const { b, board } = withBoard()
    const fit = checkFit(b, board.id, getSlot(b, { ownerId: board.id, slotId: 'cpu-0' })!, part('cpu-r7-7700'))
    expect(fit.level).toBe('error')
    expect(fit.messages.join()).toContain('Sockel AM5')
  })

  it('accepts a matching CPU', () => {
    const { b, board } = withBoard()
    const fit = checkFit(b, board.id, getSlot(b, { ownerId: board.id, slotId: 'cpu-0' })!, part('cpu-xeon-6430'))
    expect(fit.level).toBe('ok')
  })

  it('rejects DDR4 in a DDR5 board and UDIMM where RDIMM is required', () => {
    const { b, board } = withBoard()
    const slot = getSlot(b, { ownerId: board.id, slotId: 'dimm-0-0' })!
    const ddr4 = checkFit(b, board.id, slot, part('ram-ddr4-16'))
    expect(ddr4.level).toBe('error')
    expect(ddr4.messages.join()).toContain('DDR4')
    const udimm = checkFit(b, board.id, slot, part('ram-ddr5-32'))
    expect(udimm.messages.join()).toContain('RDIMM')
    expect(checkFit(b, board.id, slot, part('ram-ddr5-rdimm-32')).level).toBe('ok')
  })

  it('knows that x8 cards fit into x16 slots but x16 cards not into x8 slots', () => {
    const { b, board } = withBoard()
    const x16 = board.slots!.find((s) => s.kind === 'pcie' && s.meta.physical === 16)!
    const x8 = board.slots!.find((s) => s.kind === 'pcie' && s.meta.physical === 8)!
    const nic = checkFit(b, board.id, x16, part('nic-x710-da2'))
    expect(nic.level).toBe('ok')
    expect(nic.messages.join()).toContain('PCIe x8-Karte passt in PCIe x16-Slot')
    expect(checkFit(b, board.id, x8, part('nic-cx6-100')).level).toBe('error')
  })

  it('checks drive bays and low profile limits', () => {
    const nvme = emptyBuild('ch-2u-nvme')
    const bay25 = nvme.chassis.slots.find((s) => s.kind === 'bay-2.5')!
    expect(checkFit(nvme, 'chassis', bay25, part('st-hdd-8t')).level).toBe('error')
    expect(checkFit(nvme, 'chassis', bay25, part('st-u2-7450')).level).toBe('ok')

    const { b, board } = withBoard('mb-x12sth', 'ch-1u')
    const slot = board.slots!.find((s) => s.kind === 'pcie')!
    const gpu = checkFit(b, board.id, slot, part('gpu-rtx4090'))
    expect(gpu.level).toBe('error')
    expect(gpu.messages.join()).toContain('Low-Profile')
  })

  it('reports missing essentials for an empty chassis', () => {
    const issues = analyzeBuild(emptyBuild())
    const keys = issues.map((i) => i.key)
    expect(keys).toContain('no-board')
    expect(keys).toContain('no-psu')
    expect(keys).toContain('no-storage')
  })

  it('flags a PSU that is too small', () => {
    const { b } = withBoard()
    for (const id of ['cpu-xeon-6430', 'cpu-xeon-6430', 'gpu-rtx4090', 'psu-crps-800']) {
      const c = add(b, id)
      const slot = findFreeSlot(b, c)
      if (slot) mountComponent(b, c.id, slot, true)
    }
    const issues = analyzeBuild(b)
    expect(issues.some((i) => i.key === 'psu-over' && i.level === 'error')).toBe(true)
  })

  it('a fully built demo-like server has no errors or warnings', () => {
    const { b } = withBoard()
    for (const [id, n] of [
      ['cpu-xeon-6430', 2],
      ['ram-ddr5-rdimm-32', 4],
      ['st-nvme-990-1t', 2],
      ['nic-x710-da2', 1],
      ['psu-crps-1600', 2],
      ['fan-60', 6],
    ] as const) {
      for (let i = 0; i < n; i++) {
        const c = add(b, id)
        const slot = findFreeSlot(b, c)
        expect(slot, `${id} slot`).not.toBeNull()
        expect(mountComponent(b, c.id, slot!).ok).toBe(true)
      }
    }
    const bad = analyzeBuild(b).filter((i) => i.level === 'error' || i.level === 'warning')
    expect(bad).toEqual([])
  })
})
