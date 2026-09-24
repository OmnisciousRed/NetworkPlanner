import { useState } from 'react'
import { ArrowRight, ChevronRight, Plus, Shuffle, Sparkles, Trash2 } from 'lucide-react'
import type { Device, Id, NetworkInterface, Vlan } from '@/models'
import { CONNECTORS, SPEED_OPTIONS, formatSpeed } from '@/models'
import { useProjectStore } from '@/store/projectStore'
import { addDevicePort, removeDevicePort, updatePort } from '@/store/actions/devices'
import { assignNextIp } from '@/store/actions/network'
import { showConnection } from '@/store/navigation'
import { connectionsOfPort, findPort, getDevicePorts, otherEnd, type DevicePort } from '@/utils/device'
import { ipVlanOf, parseIp, randomMac } from '@/utils/ip'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, NumberField, Row, SelectField, TextField } from './fields'

export function VlanBadge({ vlan, className }: { vlan: Vlan; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white', className)}
      style={{ background: vlan.color }}
      title={`VLAN ${vlan.tag} – ${vlan.name}`}
    >
      {vlan.tag}
    </span>
  )
}

export function VlanChips({ value, onChange, vlans }: { value: Id[]; onChange: (v: Id[]) => void; vlans: Vlan[] }) {
  if (!vlans.length) return <div className="text-xs text-muted-foreground">Noch keine VLANs angelegt (Netze & IP).</div>
  return (
    <div className="flex flex-wrap gap-1">
      {vlans.map((v) => {
        const on = value.includes(v.id)
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== v.id) : [...value, v.id])}
            className={cn(
              'cursor-pointer rounded-md border px-1.5 py-0.5 text-[11px] font-medium transition-colors',
              on ? 'border-transparent text-white' : 'text-muted-foreground hover:bg-accent',
            )}
            style={on ? { background: v.color } : undefined}
          >
            {v.tag} {v.name}
          </button>
        )
      })}
    </div>
  )
}

function PortStatus({ device, dp }: { device: Device; dp: DevicePort }) {
  const project = useProjectStore((s) => s.project)
  const conns = connectionsOfPort(project, device.id, dp.port.id)
  if (!dp.installed) return <span className="text-warning">nicht eingebaut</span>
  if (!conns.length) return <span className="text-muted-foreground">Nicht verbunden</span>
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      {conns.slice(0, 3).map((c) => {
        const o = otherEnd(c, device.id, dp.port.id)
        const od = project.devices[o.deviceId]
        const op = od && o.portId ? findPort(od, o.portId)?.port : undefined
        return (
          <button
            key={c.id}
            type="button"
            className="flex min-w-0 cursor-pointer items-center gap-1 text-left text-success hover:underline"
            onClick={() => showConnection(c.id)}
            title="Im Netzwerk-Designer anzeigen"
          >
            <ArrowRight className="size-3 shrink-0" />
            <span className="truncate">
              {od?.name}
              {op ? ` ${op.name}` : ''}
            </span>
          </button>
        )
      })}
      {conns.length > 3 && <span className="text-muted-foreground">+{conns.length - 3} weitere</span>}
    </span>
  )
}

export function PortEditor({ device, port, editableHardware }: { device: Device; port: NetworkInterface; editableHardware: boolean }) {
  const vlans = Object.values(useProjectStore((s) => s.project.vlans)).sort((a, b) => a.tag - b.tag)
  const upd = (patch: Partial<NetworkInterface>, key?: string) => updatePort(device.id, port.id, patch, 'Port geändert', key ? `port-${port.id}-${key}` : undefined)
  const ipVlan = ipVlanOf(port)
  const ipInvalid = !!port.ipAddress && parseIp(port.ipAddress) === null
  return (
    <div className="space-y-2 rounded-md border bg-muted/40 p-2">
      <Row>
        <Field label="Name">
          <TextField value={port.name} onChange={(v) => upd({ name: v }, 'name')} />
        </Field>
        <Field label="Beschreibung">
          <TextField value={port.description} onChange={(v) => upd({ description: v }, 'desc')} placeholder="z. B. Uplink" />
        </Field>
      </Row>
      {editableHardware && (
        <Row>
          <Field label="Geschwindigkeit">
            <SelectField value={port.speed} options={[...new Set([...SPEED_OPTIONS, port.speed])].map((s) => ({ value: s, label: formatSpeed(s) }))} onChange={(v) => upd({ speed: v })} />
          </Field>
          <Field label="Anschluss">
            <SelectField value={port.connector} options={CONNECTORS} onChange={(v) => upd({ connector: v })} />
          </Field>
        </Row>
      )}
      <Row>
        <Field label="VLAN-Modus">
          <SelectField
            value={port.vlanMode ?? 'access'}
            options={[
              { value: 'access', label: 'Access (untagged)' },
              { value: 'trunk', label: 'Trunk (tagged)' },
            ]}
            onChange={(v) => upd({ vlanMode: v, vlanIds: v === 'access' ? (port.vlanIds ?? []).slice(0, 1) : port.vlanIds })}
          />
        </Field>
        {port.vlanMode === 'trunk' ? (
          <Field label="Native VLAN">
            <SelectField
              value={port.nativeVlanId ?? ''}
              options={[{ value: '', label: '– keins –' }, ...vlans.map((v) => ({ value: v.id, label: `${v.tag} ${v.name}` }))]}
              onChange={(v) => upd({ nativeVlanId: v || undefined })}
            />
          </Field>
        ) : (
          <Field label="VLAN">
            <SelectField
              value={port.vlanIds?.[0] ?? ''}
              options={[{ value: '', label: '– keins –' }, ...vlans.map((v) => ({ value: v.id, label: `${v.tag} ${v.name}` }))]}
              onChange={(v) => upd({ vlanIds: v ? [v] : [] })}
            />
          </Field>
        )}
      </Row>
      {port.vlanMode === 'trunk' && (
        <Field label="Getaggte VLANs">
          <VlanChips value={port.vlanIds ?? []} vlans={vlans} onChange={(v) => upd({ vlanIds: v })} />
        </Field>
      )}
      <Row>
        <Field label="IP-Konfiguration">
          <SelectField
            value={port.ipMode ?? 'none'}
            options={[
              { value: 'none', label: 'keine' },
              { value: 'dhcp', label: 'DHCP' },
              { value: 'static', label: 'statisch' },
            ]}
            onChange={(v) => upd({ ipMode: v, ipAddress: v === 'static' ? port.ipAddress : v === 'none' ? undefined : port.ipAddress })}
          />
        </Field>
        <Field label="IP-Adresse">
          <div className="flex gap-1">
            <TextField value={port.ipAddress} invalid={ipInvalid} placeholder="192.168.x.y" onChange={(v) => upd({ ipAddress: v || undefined, ipMode: v ? 'static' : port.ipMode }, 'ip')} />
            <Button
              size="icon"
              variant="outline"
              title={ipVlan ? 'Nächste freie IP im VLAN vergeben' : 'Zuerst ein VLAN zuweisen'}
              disabled={!ipVlan}
              onClick={() => ipVlan && assignNextIp(device.id, port.id, ipVlan)}
            >
              <Sparkles />
            </Button>
          </div>
        </Field>
      </Row>
      <Field label="MAC-Adresse">
        <div className="flex gap-1">
          <TextField value={port.macAddress} placeholder="aa:bb:cc:dd:ee:ff" className="font-mono text-xs" onChange={(v) => upd({ macAddress: v || undefined }, 'mac')} />
          <Button size="icon" variant="outline" title="Zufällige MAC erzeugen" onClick={() => upd({ macAddress: randomMac() })}>
            <Shuffle />
          </Button>
        </div>
      </Field>
    </div>
  )
}

export function PortOverview({ device, compact, editable = true }: { device: Device; compact?: boolean; editable?: boolean }) {
  const project = useProjectStore((s) => s.project)
  const ports = getDevicePorts(device)
  const [open, setOpen] = useState<Id | null>(null)
  const [adding, setAdding] = useState(false)
  const [newPort, setNewPort] = useState({ count: 1, speed: 1000, connector: 'RJ45' as NetworkInterface['connector'], prefix: 'Port ' })

  if (!ports.length && compact) return <div className="text-sm text-muted-foreground">Keine Netzwerkports – Netzwerkkarte einbauen.</div>

  return (
    <div className="space-y-1">
      {compact && <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Netzwerkports · {device.name}</div>}
      <div className={cn(compact && 'grid gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3')}>
        {ports.map((dp) => {
          const p = dp.port
          const vl = (p.vlanIds ?? []).map((id) => project.vlans[id]).filter(Boolean)
          const isOpen = open === p.id
          return (
            <div key={p.id} className={cn('rounded-md', isOpen && 'bg-accent/40')} data-testid={`port-row-${p.name}`}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => editable && !compact && setOpen(isOpen ? null : p.id)}
                onKeyDown={(e) => e.key === 'Enter' && editable && !compact && setOpen(isOpen ? null : p.id)}
                className={cn('flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left text-xs', editable && !compact && 'cursor-pointer hover:bg-accent')}
              >
                {!compact && editable && <ChevronRight className={cn('mt-0.5 size-3 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-90')} />}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="font-semibold">{p.name}</span>
                    <span className="text-muted-foreground">
                      {formatSpeed(p.speed)} {p.connector}
                      {p.poe ? ' PoE' : ''}
                    </span>
                    {p.role === 'management' && <Badge variant="secondary">Mgmt</Badge>}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1">
                    {vl.map((v) => (
                      <VlanBadge key={v.id} vlan={v} />
                    ))}
                    {p.vlanMode === 'trunk' && <span className="text-[10px] text-muted-foreground">Trunk</span>}
                    {p.ipAddress && <span className="font-mono text-[11px]">{p.ipAddress}</span>}
                    {p.ipMode === 'dhcp' && !p.ipAddress && <span className="text-[11px] text-muted-foreground">DHCP</span>}
                  </span>
                  {dp.componentName && !compact && <span className="block truncate text-[10px] text-muted-foreground">{dp.componentName}</span>}
                </span>
                <span className="max-w-[48%] shrink-0 text-right text-[11px]" onClick={(e) => e.stopPropagation()}>
                  <PortStatus device={device} dp={dp} />
                </span>
              </div>
              {isOpen && (
                <div className="px-1.5 pb-2">
                  <PortEditor device={device} port={p} editableHardware={dp.source === 'device'} />
                  {dp.source === 'device' && (
                    <Button size="xs" variant="ghost" className="mt-1 text-destructive" onClick={() => removeDevicePort(device.id, p.id)}>
                      <Trash2 /> Port entfernen
                    </Button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {!ports.length && <div className="text-xs text-muted-foreground">Keine Netzwerkports.</div>}
      {editable && !compact && !device.build && (
        <div className="pt-1">
          {adding ? (
            <div className="space-y-2 rounded-md border p-2">
              <Row>
                <Field label="Anzahl">
                  <NumberField value={newPort.count} min={1} max={64} onChange={(v) => setNewPort({ ...newPort, count: v })} />
                </Field>
                <Field label="Präfix">
                  <TextField value={newPort.prefix} onChange={(v) => setNewPort({ ...newPort, prefix: v })} />
                </Field>
              </Row>
              <Row>
                <Field label="Geschwindigkeit">
                  <SelectField value={newPort.speed} options={SPEED_OPTIONS.map((s) => ({ value: s, label: formatSpeed(s) }))} onChange={(v) => setNewPort({ ...newPort, speed: v })} />
                </Field>
                <Field label="Anschluss">
                  <SelectField value={newPort.connector} options={CONNECTORS} onChange={(v) => setNewPort({ ...newPort, connector: v })} />
                </Field>
              </Row>
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                  Abbrechen
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const start = device.ports.length + 1
                    for (let i = 0; i < newPort.count; i++)
                      addDevicePort(device.id, { name: `${newPort.prefix}${start + i}`.trim(), speed: newPort.speed, connector: newPort.connector, ipMode: 'none' })
                    setAdding(false)
                  }}
                >
                  Hinzufügen
                </Button>
              </div>
            </div>
          ) : (
            <Button size="xs" variant="outline" onClick={() => setAdding(true)}>
              <Plus /> Port hinzufügen
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
