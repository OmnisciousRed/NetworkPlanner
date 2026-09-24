import type { Id } from '@/models'
import { getProject, useProjectStore } from './projectStore'
import { toast, useUiStore } from './uiStore'
import { DEVICE_KINDS } from '@/data/deviceKinds'

let nonce = 0

export function goTo(view: ReturnType<typeof useUiStore.getState>['view']) {
  useUiStore.getState().set({ view })
}

/** open a device in the hardware builder (optionally selecting a component) */
export function openInHardware(deviceId: Id, componentId?: Id) {
  const d = getProject().devices[deviceId]
  if (!d) return
  if (!d.build) {
    toast(`${d.name} ist ein Fertiggerät ohne Einzelteile – über „Neues Gerät bauen“ kann ein eigenes Gerät zusammengestellt werden.`, 'info')
    return
  }
  useUiStore.getState().set({
    view: 'hardware',
    hardwareDeviceId: deviceId,
    selection: componentId ? { type: 'component', deviceId, ids: [componentId] } : null,
    focus: componentId ? { type: 'component', id: componentId, nonce: ++nonce } : null,
  })
}

export function showInRack(deviceId: Id) {
  const d = getProject().devices[deviceId]
  if (!d?.rackPlacement) {
    toast(`${d?.name ?? 'Gerät'} ist in keinem Rack platziert`, 'info')
    useUiStore.getState().set({ view: 'rack', selection: { type: 'device', ids: [deviceId] } })
    return
  }
  useUiStore.getState().set({
    view: 'rack',
    activeRackId: d.rackPlacement.rackId,
    selection: { type: 'device', ids: [deviceId] },
    focus: { type: 'rackDevice', id: deviceId, nonce: ++nonce },
  })
}

export function showInNetwork(deviceId: Id) {
  const d = getProject().devices[deviceId]
  if (!d) return
  const ui = useUiStore.getState()
  if (d.hiddenInNetwork) {
    useProjectStore.getState().commit('In Netzwerkansicht eingeblendet', (p) => {
      p.devices[deviceId].hiddenInNetwork = false
    })
  }
  const service = DEVICE_KINDS[d.kind].category === 'service'
  ui.set({
    view: 'network',
    networkView: service && ui.networkView !== 'service' ? 'service' : ui.networkView === 'service' && !service && !d.layout.service ? 'physical' : ui.networkView,
    selection: { type: 'device', ids: [deviceId] },
    focus: { type: 'device', id: deviceId, nonce: ++nonce },
  })
}

export function showConnection(connectionId: Id) {
  useUiStore.getState().set({
    view: 'network',
    selection: { type: 'connection', ids: [connectionId] },
    focus: { type: 'connection', id: connectionId, nonce: ++nonce },
  })
}

export function openVlan(vlanId: Id) {
  useUiStore.getState().set({ view: 'ipam', selection: { type: 'vlan', id: vlanId } })
}

export function openRack(rackId: Id) {
  useUiStore.getState().set({ view: 'rack', activeRackId: rackId, selection: { type: 'rack', id: rackId } })
}
