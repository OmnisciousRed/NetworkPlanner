import { useEffect, useMemo, useRef, useState } from 'react'
import type { Device, Id, Point, Rack } from '@/models'
import { U_MM } from '@/models'
import { findDeviceTemplate } from '@/data/deviceCatalog'
import { DEVICE_KINDS } from '@/data/deviceKinds'
import { HardwareDefs } from '@/components/hardware/graphics'
import { DeviceFaceplate, RACK_W } from '@/components/rack/Faceplate'
import { useProjectStore } from '@/store/projectStore'
import { toast, useUiStore } from '@/store/uiStore'
import { addRackDeviceFromTemplate, placeDevice, unplaceDevice } from '@/store/actions/rack'
import { openInHardware } from '@/store/navigation'
import { createDeviceFromTemplate } from '@/utils/factory'
import { canPlace, devicesInRack, analyzeRack } from '@/utils/rack'
import { getDeviceHeightU, getDevicePower } from '@/utils/device'
import { useViewport } from '../useViewport'

const POST = 38
export const FRAME_W = RACK_W + POST * 2
const TOP = 70
const GAP = 280

export function rackX(i: number) {
  return i * (FRAME_W + GAP)
}

interface DropTarget {
  rackId: Id
  positionU: number
  ok: boolean
  reason?: string
  height: number
}

type DragState = {
  deviceId: Id
  grabUnit: number
  pointer: Point
  target: DropTarget | null
  moved: boolean
  start: Point
}

export interface RackCanvasHandle {
  fit: () => void
  zoomIn: () => void
  zoomOut: () => void
}

export function RackCanvas({ onApi }: { onApi?: (api: RackCanvasHandle) => void }) {
  const project = useProjectStore((s) => s.project)
  const face = useUiStore((s) => s.rackFace)
  const selection = useUiStore((s) => s.selection)
  const select = useUiStore((s) => s.select)
  const set = useUiStore((s) => s.set)
  const activeRackId = useUiStore((s) => s.activeRackId)
  const payload = useUiStore((s) => s.drag)
  const focus = useUiStore((s) => s.focus)
  const { vp, setVp, ref, screenToWorld, zoomAt, fit, centerOn } = useViewport({ minZoom: 0.08, maxZoom: 5 })
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const [libTarget, setLibTarget] = useState<DropTarget | null>(null)
  const [pan, setPan] = useState<{ start: Point; origin: Point } | null>(null)
  const [hover, setHover] = useState<Id | null>(null)

  const racks = useMemo(() => Object.values(project.racks).sort((a, b) => a.name.localeCompare(b.name)), [project.racks])
  const maxH = Math.max(12, ...racks.map((r) => r.heightU))
  const bounds = { x: -80, y: 0, w: Math.max(1, racks.length) * (FRAME_W + GAP) + 40, h: TOP + maxH * U_MM + 90 }

  const doFit = () => fit(bounds, 30)
  const fitRef = useRef(doFit)
  fitRef.current = doFit
  useEffect(() => {
    const t = requestAnimationFrame(() => fitRef.current())
    return () => cancelAnimationFrame(t)
  }, [racks.length])
  useEffect(() => {
    onApi?.({ fit: () => fitRef.current(), zoomIn: () => zoomAt(1.2), zoomOut: () => zoomAt(0.83) })
  }, [onApi, zoomAt])
  useEffect(() => {
    if (focus?.type !== 'rackDevice') return
    const d = project.devices[focus.id]
    const idx = racks.findIndex((r) => r.id === d?.rackPlacement?.rackId)
    if (!d || idx < 0) return
    const rack = racks[idx]
    const h = getDeviceHeightU(d) ?? 1
    const y = TOP + (rack.heightU - (d.rackPlacement!.positionU + h - 1)) * U_MM + (h * U_MM) / 2
    centerOn({ x: rackX(idx) + FRAME_W / 2, y }, Math.max(vp.zoom, 1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce])

  const targetAt = (world: Point, device: Device | null, heightU: number, grabUnit: number): DropTarget | null => {
    const idx = racks.findIndex((_, i) => world.x >= rackX(i) - 40 && world.x <= rackX(i) + FRAME_W + 40)
    if (idx < 0) return null
    const rack = racks[idx]
    const unitFromTop = Math.floor((world.y - TOP) / U_MM)
    const topU = rack.heightU - unitFromTop + grabUnit
    const positionU = Math.max(1, Math.min(rack.heightU - heightU + 1, topU - heightU + 1))
    if (!device) return { rackId: rack.id, positionU, ok: false, height: heightU }
    const check = canPlace(project, rack.id, device, positionU)
    return { rackId: rack.id, positionU, ok: check.ok, reason: check.reason, height: heightU }
  }

  const selectedIds = selection?.type === 'device' ? selection.ids : []

  /* ---------------- pointer drag of placed devices ---------------- */

  const onDevicePointerDown = (e: React.PointerEvent, d: Device, rack: Rack) => {
    if (e.button !== 0) return
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    select({ type: 'device', ids: [d.id] })
    set({ activeRackId: rack.id })
    const world = screenToWorld(e.clientX, e.clientY)
    const h = getDeviceHeightU(d) ?? 1
    const topU = d.rackPlacement!.positionU + h - 1
    const unitFromTop = Math.floor((world.y - TOP) / U_MM)
    const pointerU = rack.heightU - unitFromTop
    const st: DragState = { deviceId: d.id, grabUnit: topU - pointerU, pointer: world, target: null, moved: false, start: world }
    dragRef.current = st
    setDrag(st)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (pan) {
      setVp((v) => ({ ...v, x: pan.origin.x + e.clientX - pan.start.x, y: pan.origin.y + e.clientY - pan.start.y }))
      return
    }
    const d = dragRef.current
    if (!d) return
    const world = screenToWorld(e.clientX, e.clientY)
    const moved = d.moved || Math.abs(world.y - d.start.y) * vp.zoom > 4 || Math.abs(world.x - d.start.x) * vp.zoom > 4
    const device = project.devices[d.deviceId]
    const target = moved ? targetAt(world, device, getDeviceHeightU(device) ?? 1, d.grabUnit) : null
    const next = { ...d, pointer: world, target, moved }
    dragRef.current = next
    setDrag(next)
  }

  const onPointerUp = () => {
    setPan(null)
    const d = dragRef.current
    dragRef.current = null
    setDrag(null)
    if (!d || !d.moved) return
    const device = project.devices[d.deviceId]
    if (!d.target) {
      unplaceDevice(d.deviceId)
      toast(`${device.name} aus dem Rack genommen`, 'info', { label: 'Rückgängig', run: () => useProjectStore.getState().undo() })
      return
    }
    if (!d.target.ok) {
      toast(d.target.reason ?? 'Platz belegt', 'error')
      return
    }
    if (d.target.rackId === device.rackPlacement?.rackId && d.target.positionU === device.rackPlacement.positionU) return
    placeDevice(d.deviceId, d.target.rackId, d.target.positionU, device.rackPlacement?.face ?? 'front')
  }

  /* ---------------- HTML5 drop from the library ---------------- */

  const payloadDevice = useMemo((): Device | null => {
    if (payload?.source === 'device') return project.devices[payload.deviceId] ?? null
    if (payload?.source === 'device-template') {
      const t = findDeviceTemplate(payload.templateId, project.customTemplates.devices)
      return t ? createDeviceFromTemplate(t) : null
    }
    return null
  }, [payload, project.devices, project.customTemplates.devices])

  const onDragOver = (e: React.DragEvent) => {
    if (!payloadDevice) return
    e.preventDefault()
    const h = getDeviceHeightU(payloadDevice)
    if (h === null) {
      setLibTarget(null)
      return
    }
    const world = screenToWorld(e.clientX, e.clientY)
    setLibTarget(targetAt(world, payloadDevice, h, Math.floor((h - 1) / 2)))
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const t = libTarget
    setLibTarget(null)
    const p = payload
    set({ drag: null })
    if (!p || !payloadDevice) return
    if (getDeviceHeightU(payloadDevice) === null) {
      toast(`${payloadDevice.name} ist nicht rackfähig – Höhe (HE) im Inspector setzen oder auf einen Einlegeboden stellen`, 'error')
      return
    }
    if (!t) return
    if (!t.ok) {
      toast(t.reason ?? 'Platz belegt', 'error')
      return
    }
    if (p.source === 'device') {
      placeDevice(p.deviceId, t.rackId, t.positionU)
      select({ type: 'device', ids: [p.deviceId] })
    } else if (p.source === 'device-template') {
      const id = addRackDeviceFromTemplate(p.templateId, t.rackId, t.positionU)
      if (id) select({ type: 'device', ids: [id] })
    }
    set({ activeRackId: t.rackId })
  }

  const ghost = drag?.target ?? libTarget
  const ghostDevice = drag ? project.devices[drag.deviceId] : payloadDevice

  return (
    <div
      ref={ref}
      className="relative h-full w-full overflow-hidden bg-canvas select-none"
      style={{ cursor: pan ? 'grabbing' : undefined, touchAction: 'none' }}
      onDragOver={onDragOver}
      onDragLeave={() => setLibTarget(null)}
      onDrop={onDrop}
      data-testid="rack-canvas"
    >
      <svg
        className="absolute inset-0 h-full w-full"
        onPointerDown={(e) => {
          if (e.button === 1 || e.button === 0) {
            ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
            setPan({ start: { x: e.clientX, y: e.clientY }, origin: { x: vp.x, y: vp.y } })
            if (e.button === 0) select(null)
          }
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <HardwareDefs />
        <g transform={`translate(${vp.x} ${vp.y}) scale(${vp.zoom})`}>
          {racks.map((rack, i) => (
            <RackGraphic
              key={rack.id}
              rack={rack}
              x={rackX(i)}
              face={face}
              active={rack.id === activeRackId}
              selectedIds={selectedIds}
              draggingId={drag?.moved ? drag.deviceId : null}
              hover={hover}
              setHover={setHover}
              onDevicePointerDown={onDevicePointerDown}
              onSelectRack={() => {
                set({ activeRackId: rack.id })
                select({ type: 'rack', id: rack.id })
              }}
              onDeviceDoubleClick={(d) => d.build && openInHardware(d.id)}
            />
          ))}
          {/* ghost */}
          {ghost && ghostDevice && (() => {
            const idx = racks.findIndex((r) => r.id === ghost.rackId)
            const rack = racks[idx]
            if (!rack) return null
            const y = TOP + (rack.heightU - (ghost.positionU + ghost.height - 1)) * U_MM
            return (
              <g transform={`translate(${rackX(idx) + POST} ${y})`} style={{ pointerEvents: 'none' }}>
                <g opacity={0.65}>
                  <DeviceFaceplate device={ghostDevice} face={face} />
                </g>
                <rect x={-3} y={-2} width={RACK_W + 6} height={ghost.height * U_MM + 3} rx={3} fill={ghost.ok ? '#22c55e' : '#ef4444'} fillOpacity={0.15} stroke={ghost.ok ? '#22c55e' : '#ef4444'} strokeWidth={3} />
                <text x={RACK_W + 14} y={(ghost.height * U_MM) / 2} fontSize={16} fontWeight={700} fill={ghost.ok ? '#16a34a' : '#dc2626'} dominantBaseline="central">
                  {`U${ghost.positionU}${ghost.height > 1 ? `–U${ghost.positionU + ghost.height - 1}` : ''}`} {ghost.ok ? '✓' : `✕ ${ghost.reason ?? ''}`}
                </text>
              </g>
            )
          })()}
        </g>
      </svg>
      {!racks.length && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Noch kein Rack – links „+ Rack“ klicken.</div>
      )}
      {drag?.moved && !drag.target && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md bg-foreground px-3 py-1 text-xs text-background">Loslassen, um das Gerät aus dem Rack zu nehmen</div>
      )}
    </div>
  )
}

function RackGraphic({
  rack,
  x,
  face,
  active,
  selectedIds,
  draggingId,
  hover,
  setHover,
  onDevicePointerDown,
  onSelectRack,
  onDeviceDoubleClick,
}: {
  rack: Rack
  x: number
  face: 'front' | 'rear'
  active: boolean
  selectedIds: Id[]
  draggingId: Id | null
  hover: Id | null
  setHover: (id: Id | null) => void
  onDevicePointerDown: (e: React.PointerEvent, d: Device, rack: Rack) => void
  onSelectRack: () => void
  onDeviceDoubleClick: (d: Device) => void
}) {
  const project = useProjectStore((s) => s.project)
  const devices = devicesInRack(project, rack.id)
  const analysis = useMemo(() => analyzeRack(project, rack), [project, rack])
  const H = rack.heightU * U_MM
  return (
    <g transform={`translate(${x} 0)`}>
      {/* header */}
      <g style={{ cursor: 'pointer' }} onPointerDown={(e) => { e.stopPropagation(); onSelectRack() }}>
        <rect x={0} y={0} width={FRAME_W} height={52} rx={8} fill={active ? 'var(--primary)' : 'var(--card)'} stroke="var(--border)" />
        <text x={16} y={22} fontSize={20} fontWeight={700} fill={active ? 'var(--primary-foreground)' : 'var(--label)'}>
          {rack.name}
        </text>
        <text x={16} y={42} fontSize={13} fill={active ? 'var(--primary-foreground)' : 'var(--label-muted)'} opacity={0.9}>
          {`${rack.heightU}U · ${analysis.usedU}U belegt · ${analysis.freeU}U frei · ${(analysis.powerTypicalW / 1000).toFixed(2)} kW · ${Math.round(analysis.weightKg)} kg`}
        </text>
        {analysis.warnings.length > 0 && (
          <g transform={`translate(${FRAME_W - 26} 26)`}>
            <circle r={11} fill="#f59e0b" />
            <text textAnchor="middle" dominantBaseline="central" fontSize={14} fontWeight={800} fill="white">
              !
            </text>
            <title>{analysis.warnings.join('\n')}</title>
          </g>
        )}
      </g>
      {/* frame */}
      <rect x={0} y={TOP - 16} width={FRAME_W} height={H + 32} rx={6} fill="#1a1d22" stroke={active ? 'var(--primary)' : '#0b0d10'} strokeWidth={active ? 3 : 1.5} />
      <rect x={POST} y={TOP} width={RACK_W} height={H} fill="#0f1114" />
      {/* posts with unit numbers */}
      {Array.from({ length: rack.heightU }, (_, i) => {
        const u = rack.heightU - i
        const y = TOP + i * U_MM
        return (
          <g key={u}>
            <line x1={POST} x2={POST + RACK_W} y1={y} y2={y} stroke="#1f242b" strokeWidth={0.8} />
            <text x={POST / 2} y={y + U_MM / 2} fontSize={12} fill="#9ca3af" textAnchor="middle" dominantBaseline="central" fontFamily="JetBrains Mono, monospace">
              {u}
            </text>
            <text x={FRAME_W - POST / 2} y={y + U_MM / 2} fontSize={12} fill="#9ca3af" textAnchor="middle" dominantBaseline="central" fontFamily="JetBrains Mono, monospace">
              {u}
            </text>
            {[0.2, 0.5, 0.8].map((f) => (
              <g key={f}>
                <rect x={POST - 7} y={y + U_MM * f - 2} width={4} height={4} fill="#374151" />
                <rect x={POST + RACK_W + 3} y={y + U_MM * f - 2} width={4} height={4} fill="#374151" />
              </g>
            ))}
          </g>
        )
      })}
      <text x={FRAME_W / 2} y={TOP + H + 40} fontSize={14} fill="var(--label-muted)" textAnchor="middle" fontWeight={600}>
        {face === 'front' ? 'Vorderansicht' : 'Rückansicht'}
      </text>
      {/* devices */}
      {devices.map((d) => {
        const h = getDeviceHeightU(d) ?? 1
        const y = TOP + (rack.heightU - (d.rackPlacement!.positionU + h - 1)) * U_MM
        const sel = selectedIds.includes(d.id)
        const other = d.rackPlacement!.face === 'rear' ? face === 'front' : false
        const showFace: 'front' | 'rear' = d.rackPlacement!.face === 'rear' ? (face === 'front' ? 'rear' : 'front') : face
        return (
          <g
            key={d.id}
            transform={`translate(${POST} ${y + 0.4})`}
            opacity={draggingId === d.id ? 0.3 : 1}
            style={{ cursor: 'grab' }}
            onPointerDown={(e) => onDevicePointerDown(e, d, rack)}
            onDoubleClick={() => onDeviceDoubleClick(d)}
            onPointerEnter={() => setHover(d.id)}
            onPointerLeave={() => setHover(null)}
            data-rack-device={d.id}
          >
            <g opacity={other ? 0.45 : 1}>
              <DeviceFaceplate device={d} face={showFace} />
            </g>
            {other && (
              <text x={RACK_W / 2} y={(h * U_MM) / 2} fontSize={11} fill="#e5e7eb" textAnchor="middle" dominantBaseline="central">
                (hinten montiert)
              </text>
            )}
            {(sel || hover === d.id) && (
              <rect x={-2} y={-1} width={RACK_W + 4} height={h * U_MM + 1} rx={2} fill="none" stroke="var(--selection)" strokeWidth={sel ? 3 : 1.5} />
            )}
          </g>
        )
      })}
      {/* labels on the right side */}
      {devices.map((d) => {
        const h = getDeviceHeightU(d) ?? 1
        if (d.kind === 'blank-panel') return null
        const y = TOP + (rack.heightU - (d.rackPlacement!.positionU + h - 1)) * U_MM + (h * U_MM) / 2
        const pos = d.rackPlacement!.positionU
        return (
          <g key={`lbl-${d.id}`} transform={`translate(${FRAME_W + 14} ${y})`} style={{ pointerEvents: 'none' }}>
            <line x1={-12} x2={-2} y1={0} y2={0} stroke="var(--label-muted)" strokeWidth={1} />
            <text x={0} y={-6} fontSize={13} fontWeight={600} fill="var(--label)" dominantBaseline="central">
              {d.name}
            </text>
            <text x={0} y={10} fontSize={11} fill="var(--label-muted)" dominantBaseline="central">
              {`U${pos}${h > 1 ? `–U${pos + h - 1}` : ''} · ${DEVICE_KINDS[d.kind].label}${getDevicePower(d) ? ` · ${getDevicePower(d)} W` : ''}`}
            </text>
          </g>
        )
      })}
    </g>
  )
}
