import { describe, expect, it } from 'vitest'
import { autoLinkAllDrives, findFreeSlot, mountComponent, removeComponents, unmountComponent } from '@/utils/buildOps'
import { resolveBuild } from '@/utils/buildLayout'
import { add, emptyBuild } from './helpers'

describe('build operations', () => {
  it('swaps a component in an occupied slot and moves the old one to the tray', () => {
    const b = emptyBuild()
    const board = add(b, 'mb-x13dei')
    mountComponent(b, board.id, { ownerId: 'chassis', slotId: 'mainboard' })
    const r1 = add(b, 'ram-ddr5-rdimm-32')
    const r2 = add(b, 'ram-ddr5-rdimm-64')
    mountComponent(b, r1.id, { ownerId: board.id, slotId: 'dimm-0-0' })
    const res = mountComponent(b, r2.id, { ownerId: board.id, slotId: 'dimm-0-0' })
    expect(res.ok).toBe(true)
    expect(res.displacedIds).toEqual([r1.id])
    expect(b.components.find((c) => c.id === r1.id)!.mount).toBeUndefined()
    expect(b.components.find((c) => c.id === r1.id)!.placement.x).toBeGreaterThan(b.chassis.size.w)
  })

  it('refuses incompatible mounts unless forced', () => {
    const b = emptyBuild()
    const board = add(b, 'mb-x13dei')
    mountComponent(b, board.id, { ownerId: 'chassis', slotId: 'mainboard' })
    const cpu = add(b, 'cpu-r9-7950x')
    const res = mountComponent(b, cpu.id, { ownerId: board.id, slotId: 'cpu-0' })
    expect(res.ok).toBe(false)
    expect(b.components.find((c) => c.id === cpu.id)!.mount).toBeUndefined()
  })

  it('mounted children move with their mainboard', () => {
    const b = emptyBuild()
    const board = add(b, 'mb-x13dei')
    const cpu = add(b, 'cpu-xeon-6430')
    mountComponent(b, cpu.id, { ownerId: board.id, slotId: 'cpu-0' })
    const before = resolveBuild(b).components.get(cpu.id)!.aabb
    board.placement = { x: board.placement.x + 100, y: board.placement.y + 50, rotation: 0 }
    const after = resolveBuild(b).components.get(cpu.id)!.aabb
    expect(after.x - before.x).toBeCloseTo(100)
    expect(after.y - before.y).toBeCloseTo(50)
  })

  it('replacing a mainboard transfers compatible parts to the new board', () => {
    const b = emptyBuild()
    const oldBoard = add(b, 'mb-x13dei')
    mountComponent(b, oldBoard.id, { ownerId: 'chassis', slotId: 'mainboard' })
    const ram = add(b, 'ram-ddr5-rdimm-32')
    mountComponent(b, ram.id, { ownerId: oldBoard.id, slotId: 'dimm-0-0' })
    const newBoard = add(b, 'mb-x13dei')
    mountComponent(b, newBoard.id, { ownerId: 'chassis', slotId: 'mainboard' })
    expect(b.components.find((c) => c.id === ram.id)!.mount).toEqual({ parentId: newBoard.id, slotId: 'dimm-0-0' })
    expect(b.components.find((c) => c.id === oldBoard.id)!.mount).toBeUndefined()
  })

  it('removing a component removes its children and reports their network ports', () => {
    const b = emptyBuild()
    const board = add(b, 'mb-x13dei')
    const nic = add(b, 'nic-x710-da2')
    mountComponent(b, nic.id, { ownerId: board.id, slotId: 'pcie-0' })
    const { removedIds, removedPortIds } = removeComponents(b, [board.id])
    expect(removedIds).toContain(nic.id)
    expect(removedPortIds).toHaveLength((board.ports?.length ?? 0) + 2)
    expect(b.components).toHaveLength(0)
  })

  it('names NIC ports device-wide (NIC 1, NIC 2, …)', () => {
    const b = emptyBuild()
    const a = add(b, 'nic-x710-da2')
    const c = add(b, 'nic-i350-t4')
    expect(a.ports!.map((p) => p.name)).toEqual(['NIC 1', 'NIC 2'])
    expect(c.ports!.map((p) => p.name)).toEqual(['NIC 3', 'NIC 4', 'NIC 5', 'NIC 6'])
  })

  it('connects drives to an HBA when one is installed, SATA drives otherwise to the board', () => {
    const b = emptyBuild()
    const board = add(b, 'mb-b650d4u')
    mountComponent(b, board.id, { ownerId: 'chassis', slotId: 'mainboard' })
    const d1 = add(b, 'st-hdd-8t')
    mountComponent(b, d1.id, findFreeSlot(b, d1)!)
    expect(b.links.find((l) => l.fromId === d1.id)!.toId).toBe(`${board.id}:sata`)
    const hba = add(b, 'hba-9300-8i')
    mountComponent(b, hba.id, findFreeSlot(b, hba)!)
    const d2 = add(b, 'st-hdd-16t-sas')
    mountComponent(b, d2.id, findFreeSlot(b, d2)!)
    autoLinkAllDrives(b)
    expect(b.links.find((l) => l.fromId === d2.id)!.toId).toBe(hba.id)
    // unmounting a drive drops its controller link
    unmountComponent(b, d2.id)
    expect(b.links.find((l) => l.fromId === d2.id)).toBeUndefined()
  })
})
