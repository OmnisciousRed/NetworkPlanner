import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { GroupNode as GroupNodeT, ZoneNode as ZoneNodeT } from './graph'

function GroupNodeImpl({ data, selected }: NodeProps<GroupNodeT>) {
  const g = data.group
  return (
    <div
      className="h-full w-full rounded-2xl border-2 border-dashed"
      style={{ borderColor: g.color, background: `${g.color}10`, boxShadow: selected ? `0 0 0 2px ${g.color}` : undefined }}
    >
      <div className="absolute -top-3 left-4 rounded-md px-2 py-0.5 text-xs font-semibold text-white shadow" style={{ background: g.color }}>
        {g.name}
      </div>
    </div>
  )
}

function ZoneNodeImpl({ data }: NodeProps<ZoneNodeT>) {
  const v = data.vlan
  return (
    <div className="pointer-events-none h-full w-full rounded-3xl border-2" style={{ borderColor: `${v.color}aa`, background: `${v.color}14` }}>
      <div className="absolute -top-6 left-3 flex items-center gap-2 whitespace-nowrap text-xs font-semibold" style={{ color: v.color }}>
        <span className="rounded px-1.5 py-0.5 text-white" style={{ background: v.color }}>
          VLAN {v.tag}
        </span>
        {v.name}
        {v.subnet && <span className="font-mono font-normal opacity-80">{v.subnet}</span>}
      </div>
    </div>
  )
}

export const GroupNode = memo(GroupNodeImpl)
export const ZoneNode = memo(ZoneNodeImpl)
