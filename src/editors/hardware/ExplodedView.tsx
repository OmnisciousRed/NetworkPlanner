import { useEffect, useMemo } from 'react'
import type { Device, Id } from '@/models'
import { ChassisGraphic, ComponentGraphic, HardwareDefs, SlotGraphic } from '@/components/hardware/graphics'
import { resolveBuild } from '@/utils/buildLayout'
import { apply, mul, toSvg, type Mat } from '@/utils/geometry'
import { useUiStore } from '@/store/uiStore'
import { useViewport } from '../useViewport'

const COS = Math.cos(Math.PI / 6)
const SIN = Math.sin(Math.PI / 6)
const ISO: Mat = [COS * 0.9, SIN * 0.9, -COS * 0.9, SIN * 0.9, 0, 0]

const LAYER_NAMES = ['Gehäuse, Laufwerke, Netzteile, Lüfter', 'Mainboard', 'CPU, RAM, M.2', 'Erweiterungskarten']

export function ExplodedView({ device }: { device: Device }) {
  const build = device.build!
  const explode = useUiStore((s) => s.hw.explode)
  const setHw = useUiStore((s) => s.setHw)
  const selection = useUiStore((s) => s.selection)
  const select = useUiStore((s) => s.select)
  const { vp, ref, fit } = useViewport({ minZoom: 0.1, maxZoom: 6 })
  const resolved = useMemo(() => resolveBuild(build), [build])
  const gap = 90 + explode * 260
  const selected = new Set(selection?.type === 'component' ? selection.ids : [])

  const layerOf = (id: Id): number => {
    const r = resolved.components.get(id)
    if (!r || !r.mounted) return -1
    const c = r.component
    if (c.kind === 'mainboard') return 1
    if (r.parentId === 'chassis') return 0
    if (c.kind === 'nic' || c.kind === 'gpu' || c.kind === 'hba' || c.kind === 'raid' || c.kind === 'pcie') return 3
    return 2
  }

  const layers: Id[][] = [[], [], [], []]
  for (const id of resolved.order) {
    const l = layerOf(id)
    if (l >= 0) layers[l].push(id)
  }

  const { w, h } = build.chassis.size
  const isoCorners = [
    apply(ISO, { x: 0, y: 0 }),
    apply(ISO, { x: w, y: 0 }),
    apply(ISO, { x: w, y: h }),
    apply(ISO, { x: 0, y: h }),
  ]
  const minX = Math.min(...isoCorners.map((p) => p.x)) - 40
  const maxX = Math.max(...isoCorners.map((p) => p.x)) + 260
  const minY = Math.min(...isoCorners.map((p) => p.y)) - 3 * gap - 60
  const maxY = Math.max(...isoCorners.map((p) => p.y)) + 40

  useEffect(() => {
    const t = requestAnimationFrame(() => fit({ x: minX, y: minY, w: maxX - minX, h: maxY - minY }, 30))
    return () => cancelAnimationFrame(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.id, explode])

  const layerMatrix = (l: number): Mat => mul([1, 0, 0, 1, 0, -l * gap], ISO)

  return (
    <div ref={ref} className="hw-canvas relative h-full w-full overflow-hidden bg-canvas" onPointerDown={(e) => e.target === e.currentTarget && select(null)}>
      <svg className="absolute inset-0 h-full w-full" onPointerDown={(e) => e.target === e.currentTarget && select(null)}>
        <HardwareDefs />
        <g transform={`translate(${vp.x} ${vp.y}) scale(${vp.zoom})`}>
          {[0, 1, 2, 3].map((l) => {
            const m = layerMatrix(l)
            const slab = mul([1, 0, 0, 1, 0, 6], m)
            return (
              <g key={l}>
                {/* slab shadow */}
                {l === 0 && (
                  <g transform={toSvg(slab)} opacity={0.35}>
                    <rect x={-8} y={-8} width={w + 16} height={h + 16} rx={10} fill="#000" />
                  </g>
                )}
                <g transform={toSvg(m)}>
                  {l === 0 && (
                    <>
                      <ChassisGraphic chassis={build.chassis} showLabels={false} />
                      {build.chassis.slots.map((s) => (
                        <g key={s.id} transform={`translate(${s.rect.x} ${s.rect.y})`} opacity={0.6}>
                          <SlotGraphic slot={s} showLabels={false} />
                        </g>
                      ))}
                    </>
                  )}
                  {layers[l].map((id) => {
                    const r = resolved.components.get(id)!
                    const isSel = selected.has(id)
                    return (
                      <g key={id}>
                        <g
                          transform={toSvg(r.matrix)}
                          style={{ cursor: 'pointer' }}
                          onPointerDown={(e) => {
                            e.stopPropagation()
                            select({ type: 'component', deviceId: device.id, ids: [id] })
                          }}
                        >
                          <ComponentGraphic c={r.component} w={r.w} h={r.h} showLabels={false} />
                          {isSel && <rect x={-2} y={-2} width={r.w + 4} height={r.h + 4} fill="none" stroke="var(--selection)" strokeWidth={3} rx={2} />}
                        </g>
                        {l === 1 &&
                          r.component.slots?.map((s) => {
                            const occupied = resolved.slots.find((x) => x.ownerId === id && x.slot.id === s.id)?.occupantIds.length
                            return (
                              <g key={s.id} transform={toSvg(resolved.slots.find((x) => x.ownerId === id && x.slot.id === s.id)!.matrix)} opacity={occupied ? 1 : 0.7}>
                                <SlotGraphic slot={s} showLabels={false} />
                              </g>
                            )
                          })}
                      </g>
                    )
                  })}
                </g>
                {/* layer label */}
                {(() => {
                  const p = apply(m, { x: w, y: 0 })
                  return (
                    <text x={p.x + 30} y={p.y} fontSize={14} fill="var(--label-muted)" fontWeight={600}>
                      {`Ebene ${l + 1}: ${LAYER_NAMES[l]}`}
                    </text>
                  )
                })()}
              </g>
            )
          })}
          {/* assembly lines: component → slot on the layer below */}
          {[2, 3].flatMap((l) =>
            layers[l].map((id) => {
              const r = resolved.components.get(id)!
              const c = apply(r.matrix, { x: r.w / 2, y: r.h / 2 })
              const top = apply(layerMatrix(l), c)
              const bottom = apply(layerMatrix(1), c)
              return <line key={`ln-${id}`} x1={top.x} y1={top.y} x2={bottom.x} y2={bottom.y} stroke="var(--selection)" strokeWidth={1} strokeDasharray="4 4" opacity={0.55} />
            }),
          )}
          {layers[1].map((id) => {
            const r = resolved.components.get(id)!
            const c = apply(r.matrix, { x: r.w / 2, y: r.h / 2 })
            const top = apply(layerMatrix(1), c)
            const bottom = apply(layerMatrix(0), c)
            return <line key={`lnb-${id}`} x1={top.x} y1={top.y} x2={bottom.x} y2={bottom.y} stroke="var(--selection)" strokeWidth={1.5} strokeDasharray="6 4" opacity={0.6} />
          })}
        </g>
      </svg>
      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg border bg-card/95 px-3 py-2 text-xs shadow">
        <span className="text-muted-foreground">Explosionsgrad</span>
        <input type="range" min={0} max={1} step={0.05} value={explode} onChange={(e) => setHw({ explode: Number(e.target.value) })} className="w-40 accent-[var(--primary)]" />
      </div>
    </div>
  )
}
