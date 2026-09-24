import { useEffect, useMemo, useState } from 'react'
import { Maximize, PanelTop, Plus, Search, Wrench, ZoomIn, ZoomOut } from 'lucide-react'
import type { DeviceTemplate } from '@/models'
import { RACK_HEIGHTS } from '@/models'
import { DEVICE_CATALOG } from '@/data/deviceCatalog'
import { DEVICE_KINDS } from '@/data/deviceKinds'
import { useProjectStore } from '@/store/projectStore'
import { toast, useUiStore } from '@/store/uiStore'
import { addRack, addRackDeviceFromTemplate, fillWithBlanks, placeDevice, placeDeviceAuto, unplaceDevice } from '@/store/actions/rack'
import { findFreePosition } from '@/utils/rack'
import { createDeviceFromTemplate } from '@/utils/factory'
import { deleteDevices } from '@/store/actions/devices'
import { getDeviceHeightU, isRackable } from '@/utils/device'
import { buildOneLiner } from '@/utils/buildSummary'
import { isEditableTarget } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tooltip } from '@/components/ui/tooltip'
import { DeviceIcon } from '@/components/icons'
import { InfoButton } from '@/components/InfoButton'
import { cn } from '@/lib/utils'
import { RackCanvas, type RackCanvasHandle } from './RackCanvas'

function TemplateRow({ t }: { t: DeviceTemplate }) {
  const set = useUiStore((s) => s.set)
  const activeRackId = useUiStore((s) => s.activeRackId)
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-np-device-template', t.id)
        e.dataTransfer.effectAllowed = 'copy'
        set({ drag: { source: 'device-template', templateId: t.id } })
      }}
      onDragEnd={() => set({ drag: null })}
      onDoubleClick={() => {
        if (!activeRackId) return
        const pos = findFreePosition(useProjectStore.getState().project, activeRackId, createDeviceFromTemplate(t), t.kind === 'ups')
        if (pos !== null) addRackDeviceFromTemplate(t.id, activeRackId, pos)
        else toast('Kein freier Platz im Rack', 'error')
      }}
      className="group flex cursor-grab items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent active:cursor-grabbing"
      title="Ins Rack ziehen – Doppelklick setzt in den nächsten freien Platz"
      data-testid={`racklib-${t.id}`}
    >
      <div className="flex size-7 shrink-0 items-center justify-center rounded text-white" style={{ background: DEVICE_KINDS[t.kind].color }}>
        <DeviceIcon kind={t.kind} className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{t.name}</div>
        <div className="truncate text-[10px] text-muted-foreground">
          {t.heightU}U{t.powerW ? ` · ${t.powerW} W` : ''}
          {t.model ? ` · ${t.model}` : ''}
        </div>
      </div>
      <InfoButton device={t.kind} className="opacity-0 group-hover:opacity-100" />
    </div>
  )
}

function RackLibrary() {
  const project = useProjectStore((s) => s.project)
  const set = useUiStore((s) => s.set)
  const activeRackId = useUiStore((s) => s.activeRackId)
  const select = useUiStore((s) => s.select)
  const openDialog = useUiStore((s) => s.openDialog)
  const [q, setQ] = useState('')
  const [newHeight, setNewHeight] = useState(42)
  const racks = Object.values(project.racks).sort((a, b) => a.name.localeCompare(b.name))
  const unplaced = Object.values(project.devices).filter((d) => isRackable(d) && !d.rackPlacement && d.kind !== 'blank-panel')
  const templates = useMemo(() => {
    const all = [...DEVICE_CATALOG, ...project.customTemplates.devices].filter((t) => t.formFactor === 'rack' || t.heightU)
    const needle = q.trim().toLowerCase()
    return needle ? all.filter((t) => `${t.name} ${DEVICE_KINDS[t.kind].label} ${t.model ?? ''}`.toLowerCase().includes(needle)) : all
  }, [project.customTemplates.devices, q])
  const groups: [string, DeviceTemplate[]][] = [
    ['Server & Storage', templates.filter((t) => DEVICE_KINDS[t.kind].category === 'server')],
    ['Netzwerk', templates.filter((t) => DEVICE_KINDS[t.kind].category === 'network')],
    ['Strom', templates.filter((t) => t.kind === 'ups' || t.kind === 'pdu')],
    ['Passiv', templates.filter((t) => ['patch-panel', 'shelf', 'cable-management', 'blank-panel'].includes(t.kind))],
    ['Eigene', templates.filter((t) => t.custom && !['server', 'network'].includes(DEVICE_KINDS[t.kind].category))],
  ]
  return (
    <aside className="flex h-full w-[272px] shrink-0 flex-col border-r bg-card" data-testid="rack-library">
      <div className="space-y-2 border-b p-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Racks</div>
        <div className="space-y-0.5">
          {racks.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                set({ activeRackId: r.id })
                select({ type: 'rack', id: r.id })
              }}
              className={cn('flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-accent', r.id === activeRackId && 'bg-primary/10 text-primary')}
            >
              <PanelTop className="size-4" />
              <span className="flex-1 truncate">{r.name}</span>
              <span className="text-xs text-muted-foreground">{r.heightU}U</span>
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <NativeSelect value={newHeight} onChange={(e) => setNewHeight(Number(e.target.value))} className="h-7 w-20 text-xs">
            {RACK_HEIGHTS.map((h) => (
              <option key={h} value={h}>
                {h}U
              </option>
            ))}
          </NativeSelect>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => {
              const id = addRack(undefined, newHeight)
              set({ activeRackId: id })
              select({ type: 'rack', id })
            }}
            data-testid="add-rack"
          >
            <Plus /> Rack
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5 scroll-thin">
        <div className="flex items-center justify-between px-1.5 pb-1 pt-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Nicht im Rack ({unplaced.length})</span>
          <Tooltip content="Neues Gerät im Hardware Builder bauen">
            <Button size="icon-xs" variant="ghost" onClick={() => openDialog('chassisPicker')}>
              <Wrench />
            </Button>
          </Tooltip>
        </div>
        {unplaced.map((d) => (
          <div
            key={d.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/x-np-device', d.id)
              set({ drag: { source: 'device', deviceId: d.id } })
            }}
            onDragEnd={() => set({ drag: null })}
            onClick={() => select({ type: 'device', ids: [d.id] })}
            onDoubleClick={() => activeRackId && placeDeviceAuto(d.id, activeRackId)}
            className="flex cursor-grab items-center gap-2 rounded-md border border-dashed px-1.5 py-1 hover:bg-accent"
            title="Ins Rack ziehen – Doppelklick setzt automatisch ein"
            data-testid={`unplaced-${d.name}`}
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded text-white" style={{ background: DEVICE_KINDS[d.kind].color }}>
              <DeviceIcon kind={d.kind} className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold">{d.name}</div>
              <div className="truncate text-[10px] text-muted-foreground">
                {getDeviceHeightU(d)}U · {buildOneLiner(d) || DEVICE_KINDS[d.kind].label}
              </div>
            </div>
          </div>
        ))}
        {!unplaced.length && <div className="px-2 pb-2 text-xs text-muted-foreground">Alle rackfähigen Geräte sind platziert.</div>}
        <Separator className="my-2" />
        <div className="px-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Rack-Komponenten</div>
        <div className="relative mx-1 mb-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen" className="h-7 pl-7 text-xs" />
        </div>
        {groups
          .filter(([, ts]) => ts.length)
          .map(([g, ts]) => (
            <div key={g} className="mb-1">
              <div className="px-1.5 pb-0.5 pt-1 text-[11px] text-muted-foreground">{g}</div>
              {ts.map((t) => (
                <TemplateRow key={t.id} t={t} />
              ))}
            </div>
          ))}
      </div>
    </aside>
  )
}

export function RackEditor() {
  const project = useProjectStore((s) => s.project)
  const face = useUiStore((s) => s.rackFace)
  const set = useUiStore((s) => s.set)
  const activeRackId = useUiStore((s) => s.activeRackId)
  const select = useUiStore((s) => s.select)
  const [api, setApi] = useState<RackCanvasHandle | null>(null)

  useEffect(() => {
    const ids = Object.keys(project.racks)
    if ((!activeRackId || !project.racks[activeRackId]) && ids.length) set({ activeRackId: ids[0] })
  }, [activeRackId, project.racks, set])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target) || document.querySelector('[role="dialog"]')) return
      const sel = useUiStore.getState().selection
      if (sel?.type !== 'device') return
      const p = useProjectStore.getState().project
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        if (e.shiftKey) deleteDevices(sel.ids)
        else sel.ids.forEach((id) => p.devices[id]?.rackPlacement && unplaceDevice(id))
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        for (const id of sel.ids) {
          const d = p.devices[id]
          if (!d?.rackPlacement) continue
          placeDevice(id, d.rackPlacement.rackId, d.rackPlacement.positionU + (e.key === 'ArrowUp' ? 1 : -1), d.rackPlacement.face)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex min-h-0 flex-1">
      <RackLibrary />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1 border-b bg-card px-2 py-1.5">
          <div className="flex rounded-md bg-muted p-0.5">
            {(['front', 'rear'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => set({ rackFace: f })}
                className={cn('cursor-pointer rounded px-2.5 py-1 text-xs font-medium text-muted-foreground', face === f && 'bg-card text-foreground shadow-sm')}
                data-testid={`rack-face-${f}`}
              >
                {f === 'front' ? 'Vorderseite' : 'Rückseite'}
              </button>
            ))}
          </div>
          <Separator orientation="vertical" className="mx-1" />
          <Button size="sm" variant="ghost" disabled={!activeRackId} onClick={() => activeRackId && select({ type: 'rack', id: activeRackId })}>
            Rack-Analyse
          </Button>
          <Button size="sm" variant="ghost" disabled={!activeRackId} onClick={() => activeRackId && fillWithBlanks(activeRackId)}>
            Blindblenden auffüllen
          </Button>
          <span className="ml-2 hidden truncate text-xs text-muted-foreground 2xl:inline">
            Ziehen = einsetzen/verschieben · herausziehen = entfernen · ↑/↓ = 1 HE · Doppelklick = Hardware Builder
          </span>
          <div className="ml-auto flex items-center gap-0.5">
            <Button size="icon-sm" variant="ghost" onClick={() => api?.zoomOut()}>
              <ZoomOut />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => api?.zoomIn()}>
              <ZoomIn />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => api?.fit()}>
              <Maximize />
            </Button>
          </div>
        </div>
        <div className="relative min-h-0 flex-1">
          <RackCanvas onApi={setApi} />
        </div>
      </div>
    </div>
  )
}
