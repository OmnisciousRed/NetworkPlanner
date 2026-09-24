import { beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore } from '@/store/projectStore'
import { createProject } from '@/utils/factory'
import { createDemoProject } from '@/data/sampleProject'
import { findChassisTemplate } from '@/data/chassisCatalog'
import { addDeviceFromTemplate, createBuiltDeviceAction, deleteDevices, duplicateDevices, updateDevice } from '@/store/actions/devices'
import { addComponentFromTemplate, deleteComponents, updateComponentSpecs } from '@/store/actions/hardware'
import { addVlan, connect, deleteVlan, setConnectionVlans } from '@/store/actions/network'
import { addRack, placeDevice, placeDeviceAuto } from '@/store/actions/rack'
import { connectionOfPort, getDevicePorts } from '@/utils/device'

const project = () => useProjectStore.getState().project

function buildServerWithNic() {
  const t = findChassisTemplate('ch-2u')!
  const id = createBuiltDeviceAction('server', 'Proxmox Server 01', t.name, t.params, t.id)
  addComponentFromTemplate(id, 'mb-x13dei', { auto: true })
  addComponentFromTemplate(id, 'cpu-xeon-6430', { auto: true })
  const nicId = addComponentFromTemplate(id, 'nic-x710-da2', { auto: true })!
  return { id, nicId }
}

describe('shared object model (hardware ↔ rack ↔ network)', () => {
  beforeEach(() => {
    useProjectStore.getState().replaceProject(createProject('Test'))
  })

  it('NIC ports built in the hardware builder are network ports of the device', () => {
    const { id } = buildServerWithNic()
    const names = getDevicePorts(project().devices[id]).map((p) => p.port.name)
    expect(names).toEqual(expect.arrayContaining(['LAN 1', 'LAN 2', 'IPMI', 'NIC 1', 'NIC 2']))
  })

  it('a connection is visible from both devices and disappears when the NIC is removed', () => {
    const { id, nicId } = buildServerWithNic()
    const sw = addDeviceFromTemplate('dev-core-switch')!
    const nicPort = getDevicePorts(project().devices[id]).find((p) => p.port.name === 'NIC 1')!.port
    const swPort = project().devices[sw].ports.find((p) => p.name === 'SFP+ 10')!
    const res = connect({ deviceId: id, portId: nicPort.id }, { deviceId: sw, portId: swPort.id })
    expect(res.id).toBeTruthy()
    expect(connectionOfPort(project(), id, nicPort.id)?.id).toBe(res.id)
    expect(connectionOfPort(project(), sw, swPort.id)?.id).toBe(res.id)
    // occupied port cannot be used twice
    const other = addDeviceFromTemplate('dev-pc')!
    expect(connect({ deviceId: other, portId: project().devices[other].ports[0].id }, { deviceId: sw, portId: swPort.id }).error).toBeTruthy()

    deleteComponents(id, [nicId])
    expect(project().connections[res.id!]).toBeUndefined()
    // undo restores NIC and connection together
    useProjectStore.getState().undo()
    expect(project().connections[res.id!]).toBeDefined()
    expect(project().devices[id].build!.components.some((c) => c.id === nicId)).toBe(true)
  })

  it('changing the NIC port count updates ports and removes dangling connections', () => {
    const { id, nicId } = buildServerWithNic()
    const sw = addDeviceFromTemplate('dev-core-switch')!
    const p2 = getDevicePorts(project().devices[id]).find((p) => p.port.name === 'NIC 2')!.port
    const c = connect({ deviceId: id, portId: p2.id }, { deviceId: sw, portId: project().devices[sw].ports[3].id })
    updateComponentSpecs<'nic'>(id, nicId, { portCount: 1 })
    expect(getDevicePorts(project().devices[id]).some((p) => p.port.name === 'NIC 2')).toBe(false)
    expect(project().connections[c.id!]).toBeUndefined()
    updateComponentSpecs<'nic'>(id, nicId, { portCount: 4, speed: 25000, connector: 'SFP28' })
    const nicPorts = getDevicePorts(project().devices[id]).filter((p) => p.componentId === nicId)
    expect(nicPorts).toHaveLength(4)
    expect(nicPorts.every((p) => p.port.speed === 25000 && p.port.connector === 'SFP28')).toBe(true)
  })

  it('VLANs assigned on a connection are stored on both ports and removed everywhere on delete', () => {
    const { id } = buildServerWithNic()
    const sw = addDeviceFromTemplate('dev-core-switch')!
    const vlan = addVlan({ tag: 20, name: 'Servers' })
    const nic = getDevicePorts(project().devices[id]).find((p) => p.port.name === 'NIC 1')!.port
    const swPort = project().devices[sw].ports[9]
    const c = connect({ deviceId: id, portId: nic.id }, { deviceId: sw, portId: swPort.id })
    setConnectionVlans(c.id!, [vlan])
    const nicAfter = getDevicePorts(project().devices[id]).find((p) => p.port.id === nic.id)!.port
    expect(nicAfter.vlanIds).toEqual([vlan])
    expect(nicAfter.vlanMode).toBe('access')
    expect(project().devices[sw].ports[9].vlanIds).toEqual([vlan])
    deleteVlan(vlan)
    expect(getDevicePorts(project().devices[id]).find((p) => p.port.id === nic.id)!.port.vlanIds).toEqual([])
  })

  it('rack placement is stored on the device and collisions are refused', () => {
    const { id } = buildServerWithNic()
    const rack = addRack('Rack 01', 24)
    expect(placeDevice(id, rack, 20)).toBe(true)
    expect(project().devices[id].rackPlacement).toMatchObject({ rackId: rack, positionU: 20 })
    const sw = addDeviceFromTemplate('dev-core-switch')!
    expect(placeDevice(sw, rack, 21)).toBe(false) // 2U server occupies U20–U21
    expect(placeDevice(sw, rack, 24)).toBe(true)
    expect(placeDevice(sw, rack, 25)).toBe(false) // out of range
    const nas = addDeviceFromTemplate('dev-nas-rack')!
    expect(placeDeviceAuto(nas, rack)).toBe(true)
    expect(project().devices[nas].rackPlacement!.positionU).toBe(22)
  })

  it('deleting a device removes its connections; duplicating keeps internal links', () => {
    const a = addDeviceFromTemplate('dev-switch')!
    const b = addDeviceFromTemplate('dev-pc')!
    connect({ deviceId: a, portId: project().devices[a].ports[0].id }, { deviceId: b, portId: project().devices[b].ports[0].id })
    const copies = duplicateDevices([a, b])
    expect(copies).toHaveLength(2)
    expect(Object.values(project().connections).filter((c) => copies.includes(c.a.deviceId) && copies.includes(c.b.deviceId))).toHaveLength(1)
    deleteDevices([a])
    expect(Object.values(project().connections).some((c) => c.a.deviceId === a || c.b.deviceId === a)).toBe(false)
  })

  it('undo / redo walk through the history and typing merges into one step', () => {
    const id = addDeviceFromTemplate('dev-pc')!
    const before = useProjectStore.getState().past.length
    updateDevice(id, (d) => (d.name = 'P'), 'Name', 'name')
    updateDevice(id, (d) => (d.name = 'PC'), 'Name', 'name')
    updateDevice(id, (d) => (d.name = 'PC 1'), 'Name', 'name')
    expect(useProjectStore.getState().past.length).toBe(before + 1)
    useProjectStore.getState().undo()
    expect(project().devices[id].name).not.toBe('PC 1')
    useProjectStore.getState().redo()
    expect(project().devices[id].name).toBe('PC 1')
  })
})

describe('demo project', () => {
  it('loads and is internally consistent', () => {
    const p = createDemoProject()
    for (const c of Object.values(p.connections)) {
      expect(p.devices[c.a.deviceId]).toBeDefined()
      expect(p.devices[c.b.deviceId]).toBeDefined()
      for (const end of [c.a, c.b]) {
        if (end.portId) expect(getDevicePorts(p.devices[end.deviceId]).some((x) => x.port.id === end.portId)).toBe(true)
      }
    }
    expect(Object.values(p.devices).filter((d) => d.build)).toHaveLength(3)
  })
})
