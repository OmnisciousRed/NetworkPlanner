import { memo } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import type { ConnEdge } from './graph'

function ConnectionEdgeImpl({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected }: EdgeProps<ConnEdge>) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.35 })
  if (!data) return null
  const dash = data.hosted ? '3 5' : data.medium === 'wireless' ? '7 5' : data.medium === 'virtual' ? '2 4' : undefined
  const width = data.hosted ? 1.2 : data.medium === 'fiber' ? 3 : 2.2
  const color = selected ? 'var(--primary)' : data.warn ? '#ef4444' : data.color
  const o = data.overlays
  const showMid = !data.hosted && ((o.speed && data.speedLabel) || (o.vlan && data.vlanTags.length) || data.label)
  const along = (t: number) => ({ x: sourceX + (targetX - sourceX) * t, y: sourceY + (targetY - sourceY) * t })
  const pa = along(0.14)
  const pb = along(0.86)
  return (
    <>
      <BaseEdge id={id} path={path} style={{ stroke: color, strokeWidth: selected ? width + 1.5 : width, strokeDasharray: dash, opacity: data.hosted ? 0.7 : 1 }} className="np-edge-path" interactionWidth={16} />
      {data.medium === 'fiber' && !selected && <path d={path} fill="none" stroke="#fff7ed" strokeWidth={0.8} opacity={0.8} style={{ pointerEvents: 'none' }} />}
      <EdgeLabelRenderer>
        {showMid && (
          <div
            className="nodrag nopan pointer-events-auto absolute flex items-center gap-0.5 rounded-md border bg-card/95 px-1 py-[1px] text-[9px] font-semibold shadow-sm"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, borderColor: color }}
          >
            {o.speed && data.speedLabel && <span>{data.speedLabel}</span>}
            {o.vlan &&
              data.vlanTags.slice(0, 5).map((v) => (
                <span key={v.tag} className="rounded px-[3px] text-white" style={{ background: v.color }}>
                  {v.tag}
                </span>
              ))}
            {data.vlanTags.length > 5 && o.vlan && <span className="text-muted-foreground">+{data.vlanTags.length - 5}</span>}
            {data.label && <span className="font-normal text-muted-foreground">{data.label}</span>}
          </div>
        )}
        {data.hosted && (
          <div className="pointer-events-none absolute text-[9px] italic text-muted-foreground" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
            läuft auf
          </div>
        )}
        {o.ports && data.portA && (
          <div className="pointer-events-none absolute rounded bg-background/90 px-[3px] text-[8px] text-muted-foreground" style={{ transform: `translate(-50%, -50%) translate(${pa.x}px, ${pa.y}px)` }}>
            {data.portA}
          </div>
        )}
        {o.ports && data.portB && (
          <div className="pointer-events-none absolute rounded bg-background/90 px-[3px] text-[8px] text-muted-foreground" style={{ transform: `translate(-50%, -50%) translate(${pb.x}px, ${pb.y}px)` }}>
            {data.portB}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  )
}

export const ConnectionEdge = memo(ConnectionEdgeImpl)
