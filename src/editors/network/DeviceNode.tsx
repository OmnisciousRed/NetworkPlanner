import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { Device, NetworkInterface } from '@/models'
import { RACK_PANEL_MM, U_MM, formatSpeed } from '@/models'
import { DEVICE_KINDS } from '@/data/deviceKinds'
import { DeviceIcon } from '@/components/icons'
import { DeviceFaceplate } from '@/components/rack/Faceplate'
import { buildOneLiner } from '@/utils/buildSummary'
import { getDeviceHeightU, getDevicePorts, type DevicePort } from '@/utils/device'
import { cn } from '@/lib/utils'
import { ANY_HANDLE, type DeviceNode as DeviceNodeT, type DeviceNodeData } from './graph'

export type NodeVariant = 'switch' | 'server' | 'client' | 'service' | 'cloud'

export function nodeVariant(d: Device): NodeVariant {
  if (d.kind === 'internet' || d.kind === 'cloud') return 'cloud'
  const cat = DEVICE_KINDS[d.kind].category
  if (cat === 'service') return 'service'
  if (['switch', 'managed-switch', 'poe-switch', 'patch-panel'].includes(d.kind)) return 'switch'
  if (!d.build && d.ports.length > 8) return 'switch'
  if (d.build || cat === 'server' || d.kind === 'firewall' || d.kind === 'router') return 'server'
  return 'client'
}

function portVlanColor(p: NetworkInterface, data: DeviceNodeData): string | undefined {
  if (!data.overlays.vlan) return undefined
  if (p.vlanMode === 'trunk') return undefined
  const v = p.vlanIds?.[0] ? data.vlans[p.vlanIds[0]] : undefined
  return v?.color
}

function portTitle(dp: DevicePort, data: DeviceNodeData) {
  const p = dp.port
  const vl = (p.vlanIds ?? []).map((id) => data.vlans[id]).filter(Boolean)
  return [
    `${p.name} – ${formatSpeed(p.speed)} ${p.connector}${p.poe ? ' PoE' : ''}`,
    vl.length ? `VLAN ${p.vlanMode === 'trunk' ? '(Trunk) ' : ''}${vl.map((v) => `${v.tag} ${v.name}`).join(', ')}` : '',
    p.ipAddress ? `IP ${p.ipAddress}` : '',
    dp.installed ? '' : '⚠ Bauteil nicht eingebaut',
    data.connected[p.id] ? 'verbunden' : 'frei',
  ]
    .filter(Boolean)
    .join('\n')
}

/** switch-style faceplate port */
function FacePort({ dp, data, side }: { dp: DevicePort; data: DeviceNodeData; side: 'top' | 'bottom' }) {
  const p = dp.port
  const connected = !!data.connected[p.id]
  const sfp = /SFP|QSFP/.test(p.connector)
  const vlanColor = portVlanColor(p, data)
  return (
    <div
      className={cn(
        'relative shrink-0 rounded-[3px] border',
        sfp ? 'h-[12px] w-[19px] border-zinc-400 bg-zinc-300' : 'h-[13px] w-[15px] border-zinc-600 bg-zinc-950',
      )}
      style={vlanColor ? { borderColor: vlanColor, boxShadow: `0 0 0 1px ${vlanColor}` } : p.vlanMode === 'trunk' && data.overlays.vlan ? { borderColor: '#e5e7eb', borderStyle: 'dashed' } : undefined}
      title={portTitle(dp, data)}
    >
      <span className={cn('absolute left-[2px] top-[2px] size-[4px] rounded-full', connected ? 'bg-green-400' : sfp ? 'bg-zinc-500' : 'bg-zinc-700')} />
      {sfp && connected && <span className="absolute inset-x-[3px] bottom-[2px] h-[4px] rounded-sm bg-blue-500" />}
      <Handle id={p.id} type="source" position={side === 'top' ? Position.Top : Position.Bottom} className="np-port-handle" isConnectableStart isConnectableEnd />
    </div>
  )
}

function SwitchBody({ data, ports }: { data: DeviceNodeData; ports: DevicePort[] }) {
  const copper = ports.filter((p) => !/SFP|QSFP/.test(p.port.connector) && p.port.connector !== 'WiFi')
  const fiber = ports.filter((p) => /SFP|QSFP/.test(p.port.connector))
  const renderGrid = (list: DevicePort[]) => {
    const cols: DevicePort[][] = []
    for (let i = 0; i < list.length; i += 2) cols.push(list.slice(i, i + 2))
    return (
      <div className="flex gap-[2px]">
        {cols.map((col, ci) => (
          <div key={ci} className={cn('flex flex-col gap-[3px]', ci > 0 && ci % 6 === 0 && 'ml-[5px]')}>
            {col.map((dp, ri) => (
              <FacePort key={dp.port.id} dp={dp} data={data} side={data.portSide[dp.port.id] ?? (ri === 0 ? 'top' : 'bottom')} />
            ))}
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-3 rounded-md bg-gradient-to-b from-zinc-800 to-zinc-900 px-2.5 py-2 shadow-inner">
      {copper.length > 0 && renderGrid(copper)}
      {fiber.length > 0 && <div className="border-l border-zinc-700 pl-3">{renderGrid(fiber)}</div>}
      <div className="ml-auto flex flex-col gap-1 pl-1">
        <span className="size-[5px] rounded-full bg-green-400" />
        <span className="size-[5px] rounded-full bg-zinc-600" />
      </div>
    </div>
  )
}

/** chip-style port for servers/clients/services */
function PortChip({ dp, data, side }: { dp: DevicePort; data: DeviceNodeData; side: 'top' | 'bottom' }) {
  const p = dp.port
  const connected = !!data.connected[p.id]
  const vlanColor = portVlanColor(p, data)
  const wifi = p.connector === 'WiFi'
  return (
    <div
      className={cn(
        'relative flex items-center gap-1 rounded border bg-background px-1.5 py-[2px] text-[9px] font-medium leading-tight shadow-sm',
        !dp.installed && 'border-dashed opacity-50',
        connected && 'border-green-500/70',
      )}
      style={vlanColor ? { borderLeft: `3px solid ${vlanColor}` } : undefined}
      title={portTitle(dp, data)}
    >
      <span className={cn('size-[5px] shrink-0 rounded-full', connected ? 'bg-green-500' : 'bg-muted-foreground/40')} />
      <span className="whitespace-nowrap">
        {p.name}
        {data.overlays.speed && <span className="text-muted-foreground"> {wifi ? 'WLAN' : formatSpeed(p.speed)}</span>}
      </span>
      <Handle id={p.id} type="source" position={side === 'top' ? Position.Top : Position.Bottom} className="np-port-handle" />
    </div>
  )
}

function portsBySide(ports: DevicePort[], data: DeviceNodeData) {
  const sides = data.portSide
  const top: DevicePort[] = []
  const bottom: DevicePort[] = []
  for (const dp of ports) {
    const s = sides[dp.port.id] ?? (dp.port.connector === 'WiFi' ? 'bottom' : 'top')
    ;(s === 'top' ? top : bottom).push(dp)
  }
  return { top, bottom }
}

function IpLines({ d, data }: { d: Device; data: DeviceNodeData }) {
  if (!data.overlays.ip && !data.overlays.vlan) return null
  const ports = getDevicePorts(d).filter((p) => p.port.ipAddress || (p.port.vlanIds?.length && p.port.vlanMode !== 'trunk'))
  if (!ports.length) return null
  const ips = ports.filter((p) => p.port.ipAddress).slice(0, 3)
  const vlanIds = [...new Set(ports.flatMap((p) => (p.port.vlanMode === 'trunk' ? [] : p.port.vlanIds ?? [])))]
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {data.overlays.vlan &&
        vlanIds.map((id) => {
          const v = data.vlans[id]
          if (!v) return null
          return (
            <span key={id} className="rounded px-1 text-[9px] font-semibold leading-[14px] text-white" style={{ background: v.color }}>
              {v.tag}
            </span>
          )
        })}
      {data.overlays.ip &&
        ips.map((p) => (
          <span key={p.port.id} className="font-mono text-[10px] text-muted-foreground">
            {p.port.ipAddress}
          </span>
        ))}
    </div>
  )
}

function MiniFace({ d }: { d: Device }) {
  const h = getDeviceHeightU(d)
  if (!h || !(d.formFactor === 'rack' || d.build?.chassis.params.formFactor === 'rack')) return null
  return (
    <svg viewBox={`0 0 ${RACK_PANEL_MM} ${h * U_MM}`} className="mb-1.5 block w-full rounded-sm" style={{ height: Math.min(56, h * 22) }}>
      <DeviceFaceplate device={d} face="front" />
    </svg>
  )
}

function DeviceNodeImpl({ data, selected }: NodeProps<DeviceNodeT>) {
  const d = data.device
  const info = DEVICE_KINDS[d.kind]
  const variant = nodeVariant(d)
  const ports = data.compact ? [] : getDevicePorts(d).filter((p) => p.port.role !== 'patch' || variant === 'switch')
  const ring = selected ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''
  const zoneStyle = data.view === 'logical' && data.vlanColor ? { boxShadow: `0 0 0 3px ${data.vlanColor}55` } : undefined

  if (variant === 'cloud') {
    return (
      <div className={cn('relative flex h-[92px] w-[170px] items-center justify-center', selected && 'drop-shadow-[0_0_6px_var(--primary)]')} data-testid={`node-${d.name}`}>
        <svg viewBox="0 0 170 92" className="absolute inset-0">
          <path d="M40 80 Q10 80 12 58 Q12 38 36 38 Q40 12 72 14 Q96 2 114 22 Q146 16 150 44 Q166 50 160 66 Q156 80 136 80 Z" fill="var(--card)" stroke={info.color} strokeWidth={2.5} />
        </svg>
        <div className="relative flex flex-col items-center">
          <DeviceIcon kind={d.kind} className="size-5" />
          <span className="text-sm font-semibold">{d.name}</span>
        </div>
        <Handle id={ANY_HANDLE} type="source" position={Position.Bottom} className="np-any-handle" style={{ bottom: 8 }} />
        {ports.map((dp) => (
          <Handle key={dp.port.id} id={dp.port.id} type="source" position={Position.Bottom} className="np-any-handle" />
        ))}
      </div>
    )
  }

  const { top, bottom } = portsBySide(ports, data)

  if (variant === 'switch' && !data.compact) {
    return (
      <div className={cn('rounded-lg border bg-card p-2 shadow-md', ring)} style={zoneStyle} data-testid={`node-${d.name}`}>
        <Handle id={ANY_HANDLE} type="source" position={Position.Top} className="np-any-handle" />
        <div className="mb-1.5 flex items-center gap-2 px-0.5">
          <div className="flex size-6 items-center justify-center rounded text-white" style={{ background: info.color }}>
            <DeviceIcon kind={d.kind} className="size-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold leading-tight">{d.name}</div>
            <div className="truncate text-[10px] leading-tight text-muted-foreground">
              {info.label}
              {d.model ? ` · ${d.model}` : ''}
            </div>
          </div>
          <IpLines d={d} data={data} />
        </div>
        <SwitchBody data={data} ports={ports} />
      </div>
    )
  }

  const width = variant === 'server' ? 250 : variant === 'service' ? 190 : 170
  return (
    <div className="relative flex flex-col items-center" style={{ width }} data-testid={`node-${d.name}`}>
      {top.length > 0 && (
        <div className="relative z-10 -mb-[3px] flex max-w-full flex-wrap justify-center gap-[3px] px-1">
          {top.map((dp) => (
            <PortChip key={dp.port.id} dp={dp} data={data} side="top" />
          ))}
        </div>
      )}
      <div
        className={cn(
          'w-full border bg-card shadow-md',
          variant === 'service' ? 'rounded-2xl px-3 py-2' : 'rounded-lg p-2',
          ring,
        )}
        style={{ ...zoneStyle, borderTopColor: info.color, borderTopWidth: 3 }}
      >
        <Handle id={ANY_HANDLE} type="source" position={Position.Top} className="np-any-handle" />
        {variant === 'server' && <MiniFace d={d} />}
        <div className="flex items-center gap-2">
          <div className={cn('flex shrink-0 items-center justify-center text-white', variant === 'client' ? 'size-8 rounded-full' : 'size-7 rounded-md')} style={{ background: info.color }}>
            <DeviceIcon kind={d.kind} className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold leading-tight">{d.name}</div>
            <div className="truncate text-[10px] leading-tight text-muted-foreground">
              {variant === 'service' && data.hostName ? `auf ${data.hostName}` : d.build ? buildOneLiner(d) : [info.label, d.model].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
        <IpLines d={d} data={data} />
      </div>
      {bottom.length > 0 && (
        <div className="relative z-10 -mt-[3px] flex max-w-full flex-wrap justify-center gap-[3px] px-1">
          {bottom.map((dp) => (
            <PortChip key={dp.port.id} dp={dp} data={data} side="bottom" />
          ))}
        </div>
      )}
    </div>
  )
}

export const DeviceNode = memo(DeviceNodeImpl)
