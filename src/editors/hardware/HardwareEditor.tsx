import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowDownToLine,
  Box,
  Cable,
  ChevronDown,
  ChevronUp,
  Copy,
  Crosshair,
  Grid3x3,
  Group,
  Hand,
  LayoutGrid,
  Magnet,
  Maximize,
  MousePointer2,
  Plus,
  RotateCw,
  Tag,
  Trash2,
  Ungroup,
  Waypoints,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useProjectStore } from '@/store/projectStore'
import { useUiStore, type HardwareView } from '@/store/uiStore'
import {
  alignComponents,
  arrangeTray,
  autoInstallLoose,
  deleteComponents,
  duplicateComponents,
  groupComponents,
  installComponent,
  moveComponents,
  pasteComponents,
  rotateComponents,
  snapshotComponents,
  uninstallComponents,
  ungroupComponents,
  type AlignMode,
} from '@/store/actions/hardware'
import { analyzeBuild } from '@/utils/compatibility'
import { summarizeBuild, formatCapacity } from '@/utils/buildSummary'
import { isEditableTarget, isModKey } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tooltip } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { IssueList, ISSUE_COLOR, ISSUE_ICON } from '@/components/inspector/IssueList'
import { DEVICE_KINDS } from '@/data/deviceKinds'
import { cn } from '@/lib/utils'
import { ComponentLibrary } from './ComponentLibrary'
import { HardwareCanvas, type HardwareCanvasHandle, type HwTool } from './HardwareCanvas'
import { ExplodedView } from './ExplodedView'
import { BlockDiagram } from './BlockDiagram'
import { FaceView } from './FaceView'
import { HelpButton } from '@/components/HelpButton'
import { ChassisPickerPanel } from './ChassisPicker'

const VIEWS: { id: HardwareView; label: string }[] = [
  { id: 'interior', label: 'Innenansicht' },
  { id: 'exploded', label: 'Explosion' },
  { id: 'front', label: 'Front' },
  { id: 'rear', label: 'Rückseite' },
  { id: 'block', label: 'Blockdiagramm' },
]

function ToolButton({ tip, active, onClick, children, disabled, testId }: { tip: string; active?: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean; testId?: string }) {
  return (
    <Tooltip content={tip}>
      <Button size="icon-sm" variant="toggle" active={active} onClick={onClick} disabled={disabled} data-testid={testId}>
        {children}
      </Button>
    </Tooltip>
  )
}

export function HardwareEditor() {
  const project = useProjectStore((s) => s.project)
  const deviceId = useUiStore((s) => s.hardwareDeviceId)
  const hardwareView = useUiStore((s) => s.hardwareView)
  const set = useUiStore((s) => s.set)
  const hw = useUiStore((s) => s.hw)
  const setHw = useUiStore((s) => s.setHw)
  const selection = useUiStore((s) => s.selection)
  const select = useUiStore((s) => s.select)
  const openDialog = useUiStore((s) => s.openDialog)
  const [tool, setTool] = useState<HwTool>('select')
  const [api, setApi] = useState<HardwareCanvasHandle | null>(null)
  const [panelOpen, setPanelOpen] = useState(true)

  const built = useMemo(() => Object.values(project.devices).filter((d) => d.build), [project.devices])
  const device = deviceId ? project.devices[deviceId] : undefined

  // pick a device automatically
  useEffect(() => {
    if ((!device || !device.build) && built.length) set({ hardwareDeviceId: built[0].id })
  }, [device, built, set])

  const build = device?.build
  const issues = useMemo(() => (build ? analyzeBuild(build) : []), [build])
  const summary = useMemo(() => (build ? summarizeBuild(build) : null), [build])
  const selectedIds = selection?.type === 'component' && selection.deviceId === device?.id ? selection.ids : []
  const onApi = useCallback((a: HardwareCanvasHandle) => setApi(a), [])

  // keyboard shortcuts
  useEffect(() => {
    if (!device?.build) return
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target) || document.querySelector('[role="dialog"]')) return
      const ids = (() => {
        const s = useUiStore.getState().selection
        return s?.type === 'component' && s.deviceId === device.id ? s.ids : []
      })()
      const mod = isModKey(e)
      const key = e.key.toLowerCase()
      if ((e.key === 'Delete' || e.key === 'Backspace') && ids.length) {
        e.preventDefault()
        deleteComponents(device.id, ids)
        select(null)
      } else if (mod && key === 'c' && ids.length) {
        e.preventDefault()
        set({ clipboard: { kind: 'components', items: snapshotComponents(device.build!, ids) } })
      } else if (mod && key === 'x' && ids.length) {
        e.preventDefault()
        set({ clipboard: { kind: 'components', items: snapshotComponents(device.build!, ids) } })
        deleteComponents(device.id, ids)
      } else if (mod && key === 'v') {
        const cb = useUiStore.getState().clipboard
        if (cb?.kind === 'components') {
          e.preventDefault()
          const newIds = pasteComponents(device.id, cb.items)
          select({ type: 'component', deviceId: device.id, ids: newIds })
        }
      } else if (mod && key === 'd' && ids.length) {
        e.preventDefault()
        const newIds = duplicateComponents(device.id, ids)
        select({ type: 'component', deviceId: device.id, ids: newIds })
      } else if (mod && key === 'a' && hardwareView === 'interior') {
        e.preventDefault()
        select({ type: 'component', deviceId: device.id, ids: device.build!.components.map((c) => c.id) })
      } else if (mod && key === 'g' && ids.length) {
        e.preventDefault()
        if (e.shiftKey) ungroupComponents(device.id, ids)
        else groupComponents(device.id, ids)
      } else if (!mod && key === 'r' && ids.length) {
        rotateComponents(device.id, ids, e.shiftKey ? -90 : 90)
      } else if (!mod && key === 'i' && ids.length) {
        ids.forEach((id) => installComponent(device.id, id))
      } else if (!mod && key === 'u' && ids.length) {
        uninstallComponents(device.id, ids)
      } else if (!mod && key === 'v') setTool('select')
      else if (!mod && key === 'h') setTool('pan')
      else if (!mod && key === 'c') setTool('link')
      else if (!mod && (key === '+' || key === '=')) api?.zoomIn()
      else if (!mod && key === '-') api?.zoomOut()
      else if (!mod && key === '0') api?.fit()
      else if (e.key === 'Escape') select(null)
      else if (e.key.startsWith('Arrow') && ids.length) {
        e.preventDefault()
        const step = (e.shiftKey ? 10 : 1) * (hw.snap ? hw.grid : 1)
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        const loose = device.build!.components.filter((c) => ids.includes(c.id) && !c.mount)
        if (loose.length) moveComponents(device.id, Object.fromEntries(loose.map((c) => [c.id, { ...c.placement, x: c.placement.x + dx, y: c.placement.y + dy }])), 'Bauteile verschoben')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [device, api, hw.snap, hw.grid, hardwareView, select, set])

  if (!device || !build) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto bg-canvas p-8 scroll-thin">
          <div className="w-full max-w-5xl rounded-xl border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Neuen Server erstellen</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Wähle ein leeres Gehäuse. Danach ziehst du Mainboard, CPU, RAM, Festplatten, Netzwerkkarten und Netzteile aus der Bibliothek hinein – wie bei einem Baukasten.
            </p>
            <ChassisPickerPanel />
          </div>
        </div>
      </div>
    )
  }

  const errors = issues.filter((i) => i.level === 'error').length
  const warnings = issues.filter((i) => i.level === 'warning').length
  const oks = issues.filter((i) => i.level === 'ok').length
  const align = (m: AlignMode) => alignComponents(device.id, selectedIds, m)
  const looseCount = build.components.filter((c) => !c.mount).length

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <ComponentLibrary deviceId={device.id} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* toolbar */}
        <div className="flex flex-wrap items-center gap-1 border-b bg-card px-2 py-1.5">
          <NativeSelect
            value={device.id}
            onChange={(e) => set({ hardwareDeviceId: e.target.value, selection: null })}
            className="h-7 w-44 text-xs font-medium"
            data-testid="hw-device-select"
          >
            {built.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({DEVICE_KINDS[d.kind].label})
              </option>
            ))}
          </NativeSelect>
          <Tooltip content="Neues Gerät bauen">
            <Button size="icon-sm" variant="outline" onClick={() => openDialog('chassisPicker')} data-testid="hw-new-device">
              <Plus />
            </Button>
          </Tooltip>
          <Separator orientation="vertical" className="mx-1" />
          <div className="flex rounded-md bg-muted p-0.5">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => set({ hardwareView: v.id })}
                className={cn(
                  'cursor-pointer rounded px-2 py-1 text-xs font-medium text-muted-foreground transition-colors',
                  hardwareView === v.id && 'bg-card text-foreground shadow-sm',
                )}
                data-testid={`hw-view-${v.id}`}
              >
                {v.label}
              </button>
            ))}
          </div>
          {hardwareView === 'interior' && (
            <>
              <Separator orientation="vertical" className="mx-1" />
              <ToolButton tip="Auswählen & verschieben (V)" active={tool === 'select'} onClick={() => setTool('select')}>
                <MousePointer2 />
              </ToolButton>
              <ToolButton tip="Ansicht verschieben (H / Leertaste)" active={tool === 'pan'} onClick={() => setTool('pan')}>
                <Hand />
              </ToolButton>
              <ToolButton tip="Interne Verbindung ziehen, z. B. HDD → HBA (C)" active={tool === 'link'} onClick={() => setTool('link')}>
                <Cable />
              </ToolButton>
              <Separator orientation="vertical" className="mx-1" />
              <ToolButton tip="Am Raster einrasten" active={hw.snap} onClick={() => setHw({ snap: !hw.snap })}>
                <Magnet />
              </ToolButton>
              <Tooltip content="Rastergröße">
                <NativeSelect value={hw.grid} onChange={(e) => setHw({ grid: Number(e.target.value) })} className="h-7 w-16 px-1 text-xs">
                  {[1, 2, 5, 10, 20].map((g) => (
                    <option key={g} value={g}>
                      {g} mm
                    </option>
                  ))}
                </NativeSelect>
              </Tooltip>
              <ToolButton tip="Intelligente Hilfslinien (Alt beim Ziehen deaktiviert)" active={hw.guides} onClick={() => setHw({ guides: !hw.guides })}>
                <Crosshair />
              </ToolButton>
              <ToolButton tip="Interne Verbindungen anzeigen" active={hw.showLinks} onClick={() => setHw({ showLinks: !hw.showLinks })}>
                <Waypoints />
              </ToolButton>
              <ToolButton tip="Beschriftungen" active={hw.showLabels} onClick={() => setHw({ showLabels: !hw.showLabels })}>
                <Tag />
              </ToolButton>
              <Separator orientation="vertical" className="mx-1" />
              <DropdownMenu>
                <Tooltip content="Ausrichten & verteilen">
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" disabled={!selectedIds.length}>
                      <AlignStartVertical /> <ChevronDown className="size-3" />
                    </Button>
                  </DropdownMenuTrigger>
                </Tooltip>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Ausrichten</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => align('left')}>
                    <AlignStartVertical /> Links
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => align('hcenter')}>
                    <AlignCenterVertical /> Horizontal zentrieren
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => align('right')}>
                    <AlignEndVertical /> Rechts
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => align('top')}>
                    <AlignStartHorizontal /> Oben
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => align('vcenter')}>
                    <AlignCenterHorizontal /> Vertikal zentrieren
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => align('bottom')}>
                    <AlignEndHorizontal /> Unten
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => align('distribute-h')}>
                    <AlignHorizontalDistributeCenter /> Horizontal gleich verteilen
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => align('distribute-v')}>
                    <AlignVerticalDistributeCenter /> Vertikal gleich verteilen
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => align('center-chassis')}>
                    <Box /> Im Gehäuse zentrieren
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <ToolButton tip="Drehen 90° (R)" disabled={!selectedIds.length} onClick={() => rotateComponents(device.id, selectedIds, 90)}>
                <RotateCw />
              </ToolButton>
              <ToolButton tip="Duplizieren (Strg+D)" disabled={!selectedIds.length} onClick={() => select({ type: 'component', deviceId: device.id, ids: duplicateComponents(device.id, selectedIds) })}>
                <Copy />
              </ToolButton>
              <ToolButton tip="Gruppieren (Strg+G)" disabled={selectedIds.length < 2} onClick={() => groupComponents(device.id, selectedIds)}>
                <Group />
              </ToolButton>
              <ToolButton tip="Gruppierung aufheben (Strg+Umschalt+G)" disabled={!selectedIds.length} onClick={() => ungroupComponents(device.id, selectedIds)}>
                <Ungroup />
              </ToolButton>
              <ToolButton tip="Löschen (Entf)" disabled={!selectedIds.length} onClick={() => deleteComponents(device.id, selectedIds)}>
                <Trash2 />
              </ToolButton>
              <Separator orientation="vertical" className="mx-1" />
              <ToolButton tip={`Lose Bauteile automatisch einbauen (${looseCount})`} disabled={!looseCount} onClick={() => autoInstallLoose(device.id)} testId="hw-auto-install">
                <ArrowDownToLine />
              </ToolButton>
              <ToolButton tip="Ablage aufräumen (Auto-Layout)" disabled={!looseCount} onClick={() => arrangeTray(device.id)}>
                <LayoutGrid />
              </ToolButton>
            </>
          )}
          <div className="ml-auto">
            <HelpButton section="hardware" />
          </div>
        </div>

        {/* canvas / views */}
        <div className="relative min-h-0 flex-1">
          {hardwareView === 'interior' && <HardwareCanvas device={device} issues={issues} tool={tool} onViewportApi={onApi} />}
          {hardwareView === 'interior' && (
            <div className="absolute bottom-3 right-3 flex items-center gap-0.5 rounded-lg border bg-card/95 p-0.5 shadow-md">
              <ToolButton tip="Verkleinern (-)" onClick={() => api?.zoomOut()}>
                <ZoomOut />
              </ToolButton>
              <span className="w-11 text-center text-xs tabular-nums text-muted-foreground">{Math.round((api?.zoom ?? 1) * 100)}%</span>
              <ToolButton tip="Vergrößern (+)" onClick={() => api?.zoomIn()}>
                <ZoomIn />
              </ToolButton>
              <ToolButton tip="Alles einpassen (0)" onClick={() => api?.fit()}>
                <Maximize />
              </ToolButton>
            </div>
          )}
          {hardwareView === 'exploded' && <ExplodedView device={device} />}
          {hardwareView === 'front' && <FaceView device={device} face="front" />}
          {hardwareView === 'rear' && <FaceView device={device} face="rear" />}
          {hardwareView === 'block' && <BlockDiagram device={device} />}
          {hardwareView === 'interior' && !build.components.length && (
            <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-lg border bg-card/95 px-4 py-2 text-sm shadow">
              <Grid3x3 className="mr-1.5 inline size-4 text-primary" />
              Leeres Gehäuse – ziehe zuerst ein <b>Mainboard</b> aus der Bibliothek hinein.
            </div>
          )}
        </div>

        {/* compatibility & summary */}
        <div className="border-t bg-card">
          <button type="button" className="flex w-full cursor-pointer items-center gap-3 px-3 py-1.5 text-xs" onClick={() => setPanelOpen((o) => !o)} data-testid="compat-toggle">
            <span className="font-semibold">Kompatibilität</span>
            <span className={cn('flex items-center gap-1', ISSUE_COLOR.error)}>
              {(() => {
                const I = ISSUE_ICON.error
                return <I className="size-3.5" />
              })()}
              {errors}
            </span>
            <span className={cn('flex items-center gap-1', ISSUE_COLOR.warning)}>
              {(() => {
                const I = ISSUE_ICON.warning
                return <I className="size-3.5" />
              })()}
              {warnings}
            </span>
            <span className={cn('flex items-center gap-1', ISSUE_COLOR.ok)}>
              {(() => {
                const I = ISSUE_ICON.ok
                return <I className="size-3.5" />
              })()}
              {oks}
            </span>
            {summary && (
              <span className="ml-3 hidden gap-4 text-muted-foreground md:flex">
                <span>
                  <b className="text-foreground">{summary.cores}</b> Kerne
                </span>
                <span>
                  <b className="text-foreground">{summary.ramGB}</b> GB RAM
                </span>
                <span>
                  <b className="text-foreground">{formatCapacity(summary.storageGB)}</b> Speicher
                </span>
                <span>
                  <b className="text-foreground">~{summary.power.typicalW}</b> W typ. / {summary.power.maxW} W max
                </span>
                <span>
                  <b className="text-foreground">{summary.weightKg}</b> kg
                </span>
              </span>
            )}
            <span className="ml-auto text-muted-foreground">{panelOpen ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}</span>
          </button>
          {panelOpen && (
            <div className="max-h-44 overflow-y-auto px-2 pb-2 scroll-thin" data-testid="compat-panel">
              <div className="columns-1 gap-4 lg:columns-2">
                <IssueList issues={issues} deviceId={device.id} dense />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
