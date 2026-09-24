import { MousePointerClick } from 'lucide-react'
import { useProjectStore } from '@/store/projectStore'
import { useUiStore } from '@/store/uiStore'
import { ComponentInspector, SlotInspector } from './ComponentInspector'
import { DeviceInspector } from './DeviceInspector'
import { ConnectionInspector } from './ConnectionInspector'
import { RackInspector } from './RackInspector'
import { GroupInspector, VlanInspector } from './VlanInspector'
import { ChassisSection } from './ChassisSection'

export function Inspector() {
  const selection = useUiStore((s) => s.selection)
  const view = useUiStore((s) => s.view)
  const hardwareDeviceId = useUiStore((s) => s.hardwareDeviceId)
  const activeRackId = useUiStore((s) => s.activeRackId)
  const project = useProjectStore((s) => s.project)

  let content: React.ReactNode = null
  if (selection?.type === 'component' || selection?.type === 'slot') {
    const device = project.devices[selection.deviceId]
    if (device?.build) {
      content =
        selection.type === 'component' ? (
          <ComponentInspector device={device} ids={selection.ids} />
        ) : (
          <SlotInspector device={device} ownerId={selection.ownerId} slotId={selection.slotId} />
        )
    }
  } else if (selection?.type === 'device') {
    const devices = selection.ids.map((id) => project.devices[id]).filter(Boolean)
    if (devices.length === 1) content = <DeviceInspector device={devices[0]} />
    else if (devices.length > 1)
      content = (
        <div className="p-3">
          <div className="font-semibold">{devices.length} Geräte ausgewählt</div>
          <ul className="mt-2 space-y-0.5 text-sm text-muted-foreground">
            {devices.map((d) => (
              <li key={d.id}>{d.name}</li>
            ))}
          </ul>
          <div className="mt-3 text-xs text-muted-foreground">Tipp: Strg+G gruppiert die Auswahl, Strg+D dupliziert, Entf löscht.</div>
        </div>
      )
  } else if (selection?.type === 'connection') {
    if (selection.ids.length === 1) content = <ConnectionInspector id={selection.ids[0]} />
    else content = <div className="p-3 font-semibold">{selection.ids.length} Verbindungen ausgewählt</div>
  } else if (selection?.type === 'rack') {
    content = <RackInspector id={selection.id} />
  } else if (selection?.type === 'vlan') {
    content = <VlanInspector id={selection.id} />
  } else if (selection?.type === 'group') {
    content = <GroupInspector id={selection.id} />
  }

  if (!content) {
    // context defaults per editor
    if (view === 'hardware' && hardwareDeviceId && project.devices[hardwareDeviceId]) {
      const d = project.devices[hardwareDeviceId]
      content = (
        <>
          <DeviceInspector device={d} />
          {d.build && <ChassisSection device={d} />}
        </>
      )
    } else if (view === 'rack' && activeRackId && project.racks[activeRackId]) {
      content = <RackInspector id={activeRackId} />
    } else {
      content = (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
          <MousePointerClick className="size-8 opacity-50" />
          Objekt anklicken, um Details zu sehen und zu bearbeiten.
        </div>
      )
    }
  }

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col border-l bg-card" data-testid="inspector">
      <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">{content}</div>
    </aside>
  )
}
