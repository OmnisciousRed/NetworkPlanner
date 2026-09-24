import { ArrowLeftRight, Trash2, TriangleAlert } from 'lucide-react'
import type { Connection, ConnectionEndpoint, Id } from '@/models'
import { CABLE_CATEGORIES, CONNECTION_TYPE_LABELS, MEDIUM_LABELS, SPEED_OPTIONS, formatSpeed, formatSpeedLong } from '@/models'
import { useProjectStore } from '@/store/projectStore'
import { deleteConnections, setConnectionEndpointPort, setConnectionVlans, updateConnection } from '@/store/actions/network'
import { showInNetwork } from '@/store/navigation'
import { connectionVlans, connectionsOfPort, connectorCompatibility, effectiveSpeed, findPort, getDevicePorts, isSharedPort } from '@/utils/device'
import { Button } from '@/components/ui/button'
import { DeviceIcon } from '@/components/icons'
import { Field, KV, NumberField, Row, Section, SelectField, TextAreaField, TextField } from './fields'
import { VlanChips } from './PortOverview'

function EndpointEditor({ conn, side }: { conn: Connection; side: 'a' | 'b' }) {
  const project = useProjectStore((s) => s.project)
  const end: ConnectionEndpoint = conn[side]
  const dev = project.devices[end.deviceId]
  if (!dev) return null
  const ports = getDevicePorts(dev)
  return (
    <div className="space-y-1.5 rounded-md border p-2">
      <button type="button" className="flex w-full cursor-pointer items-center gap-2 text-left text-sm font-semibold hover:text-primary" onClick={() => showInNetwork(dev.id)}>
        <DeviceIcon kind={dev.kind} className="size-4 text-muted-foreground" />
        {dev.name}
      </button>
      <SelectField
        value={end.portId ?? ''}
        options={[
          { value: '', label: '– Gerät (ohne Port) –' },
          ...ports.map((p) => {
            const used = !isSharedPort(p.port) && connectionsOfPort(project, dev.id, p.port.id).some((c) => c.id !== conn.id)
            return { value: p.port.id, label: `${p.port.name} · ${formatSpeed(p.port.speed)} ${p.port.connector}${used ? ' (belegt)' : ''}${p.installed ? '' : ' (nicht eingebaut)'}` }
          }),
        ]}
        onChange={(v) => setConnectionEndpointPort(conn.id, side, (v as Id) || undefined)}
      />
    </div>
  )
}

export function ConnectionInspector({ id }: { id: Id }) {
  const project = useProjectStore((s) => s.project)
  const conn = project.connections[id]
  if (!conn) return null
  const pa = conn.a.portId ? findPort(project.devices[conn.a.deviceId], conn.a.portId)?.port : undefined
  const pb = conn.b.portId ? findPort(project.devices[conn.b.deviceId], conn.b.portId)?.port : undefined
  const compat = connectorCompatibility(pa, pb)
  const speed = effectiveSpeed(project, conn)
  const vlans = Object.values(project.vlans).sort((a, b) => a.tag - b.tag)
  const current = connectionVlans(project, conn)
  const upd = (patch: Partial<Connection>, key: string) => updateConnection(id, patch, `con-${id}-${key}`)
  const mismatch = pa && pb && pa.speed !== pb.speed
  return (
    <div>
      <div className="flex items-center gap-2 border-b px-3 py-3">
        <ArrowLeftRight className="size-5 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Verbindung</div>
          <div className="truncate text-xs text-muted-foreground">
            {project.devices[conn.a.deviceId]?.name} ↔ {project.devices[conn.b.deviceId]?.name}
          </div>
        </div>
        <Button size="icon-sm" variant="ghost" className="text-destructive" title="Verbindung löschen" onClick={() => deleteConnections([id])}>
          <Trash2 />
        </Button>
      </div>
      <Section title="Endpunkte">
        <EndpointEditor conn={conn} side="a" />
        <EndpointEditor conn={conn} side="b" />
        {compat && (
          <div className="flex gap-2 rounded-md bg-warning/15 px-2 py-1.5 text-xs">
            <TriangleAlert className="size-4 shrink-0" /> {compat}
          </div>
        )}
        {mismatch && (
          <div className="flex gap-2 rounded-md bg-warning/15 px-2 py-1.5 text-xs">
            <TriangleAlert className="size-4 shrink-0" /> Unterschiedliche Portgeschwindigkeiten ({formatSpeed(pa!.speed)} / {formatSpeed(pb!.speed)}) – Link läuft mit {formatSpeed(Math.min(pa!.speed, pb!.speed))}.
          </div>
        )}
      </Section>
      <Section title="Leitung">
        <Row>
          <Field label="Typ">
            <SelectField value={conn.type} options={Object.entries(CONNECTION_TYPE_LABELS).map(([value, label]) => ({ value: value as Connection['type'], label }))} onChange={(v) => upd({ type: v, medium: v === 'fiber' ? 'fiber' : v === 'wifi' ? 'wireless' : v === 'virtual' || v === 'service' ? 'virtual' : v === 'dac' ? 'copper' : conn.medium }, 'type')} />
          </Field>
          <Field label="Medium">
            <SelectField value={conn.medium} options={Object.entries(MEDIUM_LABELS).map(([value, label]) => ({ value: value as Connection['medium'], label }))} onChange={(v) => upd({ medium: v }, 'medium')} />
          </Field>
        </Row>
        <Row>
          <Field label="Geschwindigkeit" hint={!conn.speed && speed ? `automatisch: ${formatSpeedLong(speed)}` : undefined}>
            <SelectField value={conn.speed ?? 0} options={[{ value: 0, label: 'automatisch' }, ...SPEED_OPTIONS.map((s) => ({ value: s, label: formatSpeedLong(s) }))]} onChange={(v) => upd({ speed: v || undefined }, 'speed')} />
          </Field>
          <Field label="Kabel">
            <SelectField value={conn.cableCategory ?? ''} options={[{ value: '', label: '–' }, ...CABLE_CATEGORIES.map((c) => ({ value: c, label: c }))]} onChange={(v) => upd({ cableCategory: v || undefined }, 'cable')} />
          </Field>
        </Row>
        <Row>
          <Field label="Länge">
            <NumberField value={conn.lengthM} unit="m" min={0} step={0.5} onChange={(v) => upd({ lengthM: v }, 'len')} />
          </Field>
          <Field label="Kabel-Nr.">
            <TextField value={conn.cableLabel} placeholder="C-001" onChange={(v) => upd({ cableLabel: v || undefined }, 'clabel')} />
          </Field>
        </Row>
        <Field label="Beschriftung">
          <TextField value={conn.label} placeholder="z. B. Uplink, LACP-Bond" onChange={(v) => upd({ label: v || undefined }, 'label')} />
        </Field>
      </Section>
      <Section title="VLAN">
        <VlanChips value={current} vlans={vlans} onChange={(v) => setConnectionVlans(id, v)} />
        <div className="text-[11px] text-muted-foreground">
          {pa || pb
            ? 'Wird an beiden Ports gespeichert: 1 VLAN = Access-Port, mehrere = Trunk.'
            : 'Logische Verbindung – VLANs werden an der Verbindung gespeichert.'}
        </div>
        {pa && <KV label={`Port A (${pa.name})`}>{pa.vlanMode === 'trunk' ? 'Trunk' : 'Access'}</KV>}
        {pb && <KV label={`Port B (${pb.name})`}>{pb.vlanMode === 'trunk' ? 'Trunk' : 'Access'}</KV>}
      </Section>
      <Section title="Notizen" defaultOpen={!!conn.notes}>
        <TextAreaField value={conn.notes} onChange={(v) => upd({ notes: v }, 'notes')} />
      </Section>
    </div>
  )
}
