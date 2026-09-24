import { useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import type { Id, NetworkGroup, Vlan } from '@/models'
import { useProjectStore } from '@/store/projectStore'
import { deleteVlan, ungroup, updateGroup, updateVlan } from '@/store/actions/network'
import { showInNetwork } from '@/store/navigation'
import { collectIpam, formatIp, isValidCidr, maskToString, parseCidr, parseIp, subnetUsage } from '@/utils/ip'
import { Button } from '@/components/ui/button'
import { Field, KV, NumberField, Row, Section, SwitchField, TextAreaField, TextField } from './fields'

export function VlanEditorFields({ vlan }: { vlan: Vlan }) {
  const upd = (patch: Partial<Vlan>) => updateVlan(vlan.id, patch)
  const cidr = parseCidr(vlan.subnet)
  return (
    <>
      <Row>
        <Field label="VLAN-ID (Tag)">
          <NumberField value={vlan.tag} min={1} max={4094} onChange={(v) => upd({ tag: v })} />
        </Field>
        <Field label="Farbe">
          <input type="color" value={vlan.color} onChange={(e) => upd({ color: e.target.value })} className="h-8 w-full cursor-pointer rounded-md border bg-card" />
        </Field>
      </Row>
      <Field label="Name">
        <TextField value={vlan.name} onChange={(v) => upd({ name: v })} />
      </Field>
      <Row>
        <Field label="Subnetz (CIDR)">
          <TextField value={vlan.subnet} invalid={!!vlan.subnet && !isValidCidr(vlan.subnet)} placeholder="192.168.10.0/24" onChange={(v) => upd({ subnet: v })} />
        </Field>
        <Field label="Gateway">
          <TextField value={vlan.gateway} invalid={!!vlan.gateway && parseIp(vlan.gateway) === null} placeholder="192.168.10.1" onChange={(v) => upd({ gateway: v })} />
        </Field>
      </Row>
      {cidr && (
        <div className="rounded-md bg-muted/60 p-2 text-xs">
          <KV label="Netz / Maske">{`${formatIp(cidr.network)} / ${maskToString(cidr.mask)}`}</KV>
          <KV label="Hosts">{`${formatIp(cidr.first)} – ${formatIp(cidr.last)} (${cidr.hosts.toLocaleString('de-DE')})`}</KV>
          <KV label="Broadcast">{formatIp(cidr.broadcast)}</KV>
        </div>
      )}
      <SwitchField label="DHCP aktiv" checked={!!vlan.dhcp?.enabled} onChange={(v) => upd({ dhcp: { ...(vlan.dhcp ?? {}), enabled: v } })} />
      {vlan.dhcp?.enabled && (
        <Row>
          <Field label="DHCP von">
            <TextField value={vlan.dhcp.rangeStart} invalid={!!vlan.dhcp.rangeStart && parseIp(vlan.dhcp.rangeStart) === null} onChange={(v) => upd({ dhcp: { ...vlan.dhcp!, rangeStart: v } })} />
          </Field>
          <Field label="bis">
            <TextField value={vlan.dhcp.rangeEnd} invalid={!!vlan.dhcp.rangeEnd && parseIp(vlan.dhcp.rangeEnd) === null} onChange={(v) => upd({ dhcp: { ...vlan.dhcp!, rangeEnd: v } })} />
          </Field>
        </Row>
      )}
      <Row>
        <Field label="DNS-Server">
          <TextField value={(vlan.dnsServers ?? []).join(', ')} placeholder="192.168.20.53" onChange={(v) => upd({ dnsServers: v.split(/[,\s]+/).filter(Boolean) })} />
        </Field>
        <Field label="Domain">
          <TextField value={vlan.domain} placeholder="home.lan" onChange={(v) => upd({ domain: v })} />
        </Field>
      </Row>
      <Field label="Beschreibung">
        <TextAreaField value={vlan.description} rows={2} onChange={(v) => upd({ description: v })} />
      </Field>
    </>
  )
}

export function VlanInspector({ id }: { id: Id }) {
  const project = useProjectStore((s) => s.project)
  const vlan = project.vlans[id]
  const members = useMemo(() => collectIpam(project).filter((e) => e.vlanId === id), [project, id])
  if (!vlan) return null
  const usage = subnetUsage(project, vlan)
  return (
    <div>
      <div className="flex items-center gap-2 border-b px-3 py-3">
        <span className="size-4 rounded" style={{ background: vlan.color }} />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">VLAN {vlan.tag}</div>
          <div className="font-semibold">{vlan.name}</div>
        </div>
        <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => deleteVlan(id)} title="VLAN löschen">
          <Trash2 />
        </Button>
      </div>
      <Section title="Konfiguration">
        <VlanEditorFields vlan={vlan} />
      </Section>
      <Section title={`Mitglieder (${members.length})`}>
        <KV label="Belegte Adressen">{`${usage.used} / ${usage.total}`}</KV>
        <ul className="space-y-0.5">
          {members.map((m) => (
            <li key={m.portId}>
              <button type="button" className="flex w-full cursor-pointer justify-between gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-accent" onClick={() => showInNetwork(m.deviceId)}>
                <span className="truncate">
                  {m.deviceName} · {m.portName}
                </span>
                <span className="font-mono">{m.ip ?? (m.mode === 'dhcp' ? 'DHCP' : '—')}</span>
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}

export function GroupInspector({ id }: { id: Id }) {
  const project = useProjectStore((s) => s.project)
  const g: NetworkGroup | undefined = project.groups[id]
  if (!g) return null
  const members = Object.values(project.devices).filter((d) => d.layout.groupId === id)
  return (
    <div>
      <div className="border-b px-3 py-3">
        <div className="text-xs text-muted-foreground">Gruppe</div>
        <div className="font-semibold">{g.name}</div>
      </div>
      <Section title="Eigenschaften">
        <Field label="Name">
          <TextField value={g.name} onChange={(v) => updateGroup(id, { name: v })} />
        </Field>
        <Field label="Farbe">
          <input type="color" value={g.color} onChange={(e) => updateGroup(id, { color: e.target.value })} className="h-8 w-full cursor-pointer rounded-md border bg-card" />
        </Field>
        <Button size="sm" variant="outline" onClick={() => ungroup(id)}>
          Gruppe auflösen
        </Button>
      </Section>
      <Section title={`Mitglieder (${members.length})`}>
        <ul className="space-y-0.5 text-sm">
          {members.map((m) => (
            <li key={m.id}>{m.name}</li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
