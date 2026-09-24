import { useEffect, useMemo, useState } from 'react'
import { Maximize, PanelTop, Plus, Search, Wrench, ZoomIn, ZoomOut } from 'lucide-react'
import type { DeviceTemplate, Rack } from '@/models'
import { RACK_STANDARD_LABEL, rackStandardOf } from '@/models'
import { DEVICE_CATALOG } from '@/data/deviceCatalog'
import { RACK_PRESETS } from '@/data/rackCatalog'
import { DEVICE_KINDS } from '@/data/deviceKinds'
import { useProjectStore } from '@/store/projectStore'
import { openCustomDialog, toast, useUiStore } from '@/store/uiStore'
import { addRackDeviceFromTemplate, addRackFromPreset, fillWithBlanks, placeDevice, placeDeviceAuto, unplaceDevice } from '@/store/actions/rack'
import { findFreePosition, widthProblem } from '@/utils/rack'
import { createDeviceFromTemplate } from '@/utils/factory'
import { deleteDevices } from '@/store/actions/devices'
import { getDeviceHeightU, getDeviceRackStandard, isRackable, isShelfDevice } from '@/utils/device'
import { buildOneLiner } from '@/utils/buildSummary'
import { isEditableTarget } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tooltip } from '@/components/ui/tooltip'
import { DeviceIcon } from '@/components/icons'
import { InfoButton } from '@/components/InfoButton'
import { cn } from '@/lib/utils'
import { HelpButton } from '@/components/HelpButton'
import { openHelp } from '@/store/navigation'
import { RackCanvas, type RackCanvasHandle } from './RackCanvas'

function TemplateRow({ t, misfit }: { t: DeviceTemplate; misfit?: string | null }) {
  const set = useUiStore((s) => s.set)
  const activeRackId = useUiStore((s) => s.activeRackId)
  const probe = useMemo(() => createDeviceFromTemplate(t), [t])
  const shelf = isShelfDevice(probe)
  const std = getDeviceRackStandard(probe)
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
        if (!activeRackId) return toast('Erst links ein Rack auswählen oder anlegen', 'info')
        if (misfit) return toast(misfit, 'error')
        const pos = findFreePosition(useProjectStore.getState().project, activeRackId, probe, t.kind === 'ups')
        if (pos !== null) addRackDeviceFromTemplate(t.id, activeRackId, pos)
        else toast('Kein freier Platz im Rack', 'error')
      }}
      className={cn('group flex cursor-grab items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent active:cursor-grabbing', misfit && 'opacity-50')}
      title={misfit ?? 'Ins Rack ziehen – Doppelklick setzt in den nächsten freien Platz'}
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
      {shelf ? (
        <span className="shrink-0 rounded bg-muted px-1 text-[9px] font-medium text-muted-foreground" title="Tischgerät – steht im Rack auf einem Einlegeboden">
          Boden
        </span>
      ) : (
        std === '10' && <span className="shrink-0 rounded bg-primary/10 px-1 text-[9px] font-semibold text-primary">10"</span>
      )}
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
  const [preset, setPreset] = useState('r19-42')
  const racks = Object.values(project.racks).sort((a, b) => a.name.localeCompare(b.name))
  const activeRack: Rack | undefined = activeRackId ? project.racks[activeRackId] : undefined
  const unplaced = Object.values(project.devices).filter((d) => isRackable(d) && !d.rackPlacement && d.kind !== 'blank-panel')
  const templates = useMemo(() => {
    const all = [...DEVICE_CATALOG, ...project.customTemplates.devices].filter((t) => t.formFactor === 'rack' || t.heightU)
    const needle = q.trim().toLowerCase()
    return needle ? all.filter((t) => `${t.name} ${DEVICE_KINDS[t.kind].label} ${t.model ?? ''}`.toLowerCase().includes(needle)) : all
  }, [project.customTemplates.devices, q])
  /** why a template does not fit the active rack (e.g. 19" device in a 10" rack) */
  const misfit = useMemo(() => {
    const m = new Map<string, string>()
    if (!activeRack) return m
    for (const t of templates) {
      const reason = widthProblem(activeRack, createDeviceFromTemplate(t))
      if (reason) m.set(t.id, reason)
    }
    return m
  }, [templates, activeRack])
  const fitting = templates.filter((t) => !misfit.has(t.id))
  const groups: [string, DeviceTemplate[]][] = [
    ['Server & Storage', fitting.filter((t) => DEVICE_KINDS[t.kind].category === 'server')],
    ['Netzwerk', fitting.filter((t) => DEVICE_KINDS[t.kind].category === 'network')],
    ['Strom', fitting.filter((t) => t.kind === 'ups' || t.kind === 'pdu')],
    ['Passiv', fitting.filter((t) => ['patch-panel', 'shelf', 'cable-management', 'blank-panel'].includes(t.kind))],
    ['Sonstiges', fitting.filter((t) => !['server', 'network'].includes(DEVICE_KINDS[t.kind].category) && !['ups', 'pdu', 'patch-panel', 'shelf', 'cable-management', 'blank-panel'].includes(t.kind))],
  ]
  const misfits = templates.filter((t) => misfit.has(t.id))
  const createRack = () => {
    const id = addRackFromPreset(preset)
    if (!id) return
    set({ activeRackId: id })
    select({ type: 'rack', id })
  }
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
              <span className="text-xs text-muted-foreground">
                {RACK_STANDARD_LABEL[rackStandardOf(r)]} · {r.heightU}U
              </span>
            </button>
          ))}
        </div>
        <div className="space-y-1">
          <NativeSelect value={preset} onChange={(e) => setPreset(e.target.value)} className="h-7 w-full text-xs" data-testid="rack-preset" aria-label="Rack-Vorlage">
            <optgroup label="19 Zoll">
              {RACK_PRESETS.filter((p) => p.standard === '19').map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="10 Zoll (Mini-Rack)">
              {RACK_PRESETS.filter((p) => p.standard === '10').map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </optgroup>
          </NativeSelect>
          <Button size="sm" variant="outline" className="w-full" onClick={createRack} data-testid="add-rack">
            <Plus /> Rack hinzufügen
          </Button>
          <div className="text-[10px] leading-snug text-muted-foreground">{RACK_PRESETS.find((p) => p.id === preset)?.description} – Größe, Breite und Gewicht später rechts im Inspector anpassen.</div>
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
        {activeRack && rackStandardOf(activeRack) === '10' && (
          <div className="mx-1 mb-1 rounded-md bg-primary/10 px-2 py-1.5 text-[11px] leading-snug text-primary">
            „{activeRack.name}“ ist ein 10-Zoll-Rack: Es werden nur Teile gezeigt, die hineinpassen. Tischgeräte (Mini-PC, Raspberry Pi, NAS) stehen auf einem Einlegeboden.{' '}
            <button type="button" className="cursor-pointer font-medium underline underline-offset-2" onClick={() => openHelp('zehn-zoll')}>
              Mehr dazu
            </button>
          </div>
        )}
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
        {misfits.length > 0 && (
          <details className="mb-1">
            <summary className="cursor-pointer px-1.5 pb-0.5 pt-1 text-[11px] text-muted-foreground">Passt nicht in „{activeRack?.name}“ ({misfits.length})</summary>
            {misfits.map((t) => (
              <TemplateRow key={t.id} t={t} misfit={misfit.get(t.id)} />
            ))}
          </details>
        )}
        <div className="mx-1 mb-2 mt-3 space-y-1.5 rounded-md border border-dashed p-2" data-testid="rack-missing-part">
          <div className="text-[11px] font-medium">Passendes Teil nicht dabei?</div>
          <Button size="xs" variant="outline" className="w-full justify-start" onClick={() => openCustomDialog('device')}>
            <Plus /> Eigenes Rack-Gerät anlegen
          </Button>
          <Button size="xs" variant="outline" className="w-full justify-start" onClick={() => openDialog('chassisPicker')}>
            <Wrench /> Selbst bauen (z. B. HDD-Einschub)
          </Button>
          <button type="button" className="cursor-pointer px-0.5 text-[11px] text-primary underline underline-offset-2" onClick={() => openHelp('fehlende-teile')}>
            So geht's – Handbuch
          </button>
        </div>
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
    <div className="flex min-h-0 min-w-0 flex-1">
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
          <span className="ml-2 hidden min-w-0 flex-1 truncate text-xs text-muted-foreground 2xl:block">
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
            <HelpButton section="rack" />
          </div>
        </div>
        <div className="relative min-h-0 flex-1">
          <RackCanvas onApi={setApi} />
        </div>
      </div>
    </div>
  )
}
