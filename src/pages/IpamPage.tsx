import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Search, Sparkles, Trash2, TriangleAlert } from 'lucide-react'
import type { DnsRecord, FirewallEndpoint, FirewallRule, Id, Vlan } from '@/models'
import { uid } from '@/models'
import { useProjectStore } from '@/store/projectStore'
import { useUiStore } from '@/store/uiStore'
import { addFirewallRule, addVlan, assignNextIp, deleteFirewallRule, deleteVlan, evaluateFirewall, moveFirewallRule, updateFirewallRule } from '@/store/actions/network'
import { updatePort, updateDevice } from '@/store/actions/devices'
import { updateProjectMeta } from '@/store/actions/project'
import { commit } from '@/store/projectStore'
import { showInNetwork } from '@/store/navigation'
import { collectIpam, isValidCidr, parseCidr, parseIp, subnetUsage, formatIp } from '@/utils/ip'
import { getDevicePorts } from '@/utils/device'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ask } from '@/components/layout/AskDialog'
import { Input, NativeSelect } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { SelectField, TextField, Section } from '@/components/inspector/fields'
import { VlanEditorFields } from '@/components/inspector/VlanInspector'
import { HelpButton } from '@/components/HelpButton'
import { cn } from '@/lib/utils'

function VlanTab() {
  const project = useProjectStore((s) => s.project)
  const selection = useUiStore((s) => s.selection)
  const select = useUiStore((s) => s.select)
  const vlans = Object.values(project.vlans).sort((a, b) => a.tag - b.tag)
  const selectedId = selection?.type === 'vlan' && project.vlans[selection.id] ? selection.id : vlans[0]?.id
  const selected = selectedId ? project.vlans[selectedId] : undefined
  const members = useMemo(() => (selectedId ? collectIpam(project).filter((e) => e.vlanId === selectedId) : []), [project, selectedId])
  const trunks = useMemo(() => {
    if (!selectedId) return []
    const out: { device: string; port: string; id: Id }[] = []
    for (const d of Object.values(project.devices))
      for (const p of getDevicePorts(d)) if (p.port.vlanMode === 'trunk' && p.port.vlanIds?.includes(selectedId)) out.push({ device: d.name, port: p.port.name, id: d.id })
    return out
  }, [project, selectedId])
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[340px_1fr] gap-4 overflow-hidden">
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-1 scroll-thin">
        {vlans.map((v) => {
          const u = subnetUsage(project, v)
          const c = parseCidr(v.subnet)
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => select({ type: 'vlan', id: v.id })}
              className={cn('cursor-pointer rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/50', v.id === selectedId && 'border-primary ring-2 ring-primary/20')}
              data-testid={`vlan-card-${v.tag}`}
            >
              <div className="flex items-center gap-2">
                <span className="rounded px-1.5 py-0.5 text-xs font-bold text-white" style={{ background: v.color }}>
                  VLAN {v.tag}
                </span>
                <span className="font-semibold">{v.name}</span>
                {v.dhcp?.enabled && <Badge variant="secondary" className="ml-auto">DHCP</Badge>}
              </div>
              <div className="mt-1.5 flex items-center justify-between font-mono text-xs text-muted-foreground">
                <span>{v.subnet ?? '–'}</span>
                <span>GW {v.gateway ?? '–'}</span>
              </div>
              {c && (
                <div className="mt-2">
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (u.used / Math.max(1, u.total)) * 100)}%`, background: v.color }} />
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {u.used} von {u.total} Adressen statisch belegt
                  </div>
                </div>
              )}
            </button>
          )
        })}
        <Button variant="outline" onClick={() => select({ type: 'vlan', id: addVlan() })} data-testid="add-vlan">
          <Plus /> VLAN hinzufügen
        </Button>
      </div>
      <div className="min-h-0 overflow-y-auto rounded-lg border bg-card scroll-thin">
        {selected ? (
          <div className="grid gap-0 lg:grid-cols-2">
            <div className="border-r">
              <div className="flex items-center gap-2 border-b px-3 py-3">
                <span className="size-4 rounded" style={{ background: selected.color }} />
                <span className="font-semibold">
                  VLAN {selected.tag} · {selected.name}
                </span>
                <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => deleteVlan(selected.id)}>
                  <Trash2 /> Löschen
                </Button>
              </div>
              <div className="space-y-2.5 p-3">
                <VlanEditorFields vlan={selected} />
              </div>
            </div>
            <div>
              <Section title={`Endgeräte / Access-Ports (${members.length})`}>
                <table className="w-full text-xs">
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.portId} className="border-b last:border-0">
                        <td className="py-1">
                          <button type="button" className="cursor-pointer font-medium hover:text-primary" onClick={() => showInNetwork(m.deviceId)}>
                            {m.deviceName}
                          </button>
                        </td>
                        <td className="py-1 text-muted-foreground">{m.portName}</td>
                        <td className="py-1 text-right font-mono">{m.ip ?? (m.mode === 'dhcp' ? 'DHCP' : '–')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!members.length && <div className="text-xs text-muted-foreground">Noch keine Ports in diesem VLAN.</div>}
              </Section>
              <Section title={`Trunks, die dieses VLAN tragen (${trunks.length})`}>
                <ul className="space-y-0.5 text-xs">
                  {trunks.map((t, i) => (
                    <li key={i}>
                      {t.device} · <span className="text-muted-foreground">{t.port}</span>
                    </li>
                  ))}
                </ul>
                {!trunks.length && <div className="text-xs text-muted-foreground">Kein Trunk-Port trägt dieses VLAN.</div>}
              </Section>
            </div>
          </div>
        ) : (
          <div className="p-6 text-sm text-muted-foreground">Noch keine VLANs – „VLAN hinzufügen“ klicken.</div>
        )}
      </div>
    </div>
  )
}

function IpTab() {
  const project = useProjectStore((s) => s.project)
  const [q, setQ] = useState('')
  const [vlanFilter, setVlanFilter] = useState<string>('')
  const entries = useMemo(() => collectIpam(project), [project])
  const vlans = Object.values(project.vlans).sort((a, b) => a.tag - b.tag)
  const filtered = entries
    .filter((e) => !vlanFilter || e.vlanId === vlanFilter)
    .filter((e) => !q || `${e.deviceName} ${e.portName} ${e.ip ?? ''} ${e.mac ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (parseIp(a.ip) ?? Infinity) - (parseIp(b.ip) ?? Infinity))
  const conflicts = entries.filter((e) => e.issues.length).length
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Gerät, Port, IP, MAC …" className="pl-7" />
        </div>
        <NativeSelect value={vlanFilter} onChange={(e) => setVlanFilter(e.target.value)} className="w-56">
          <option value="">Alle VLANs</option>
          {vlans.map((v) => (
            <option key={v.id} value={v.id}>
              VLAN {v.tag} – {v.name}
            </option>
          ))}
        </NativeSelect>
        <span className="text-sm text-muted-foreground">{filtered.length} Einträge</span>
        {conflicts > 0 ? (
          <Badge variant="warning" className="ml-auto">
            <TriangleAlert /> {conflicts} Hinweise
          </Badge>
        ) : (
          <Badge variant="success" className="ml-auto">
            Keine Konflikte
          </Badge>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card scroll-thin">
        <table className="w-full text-sm" data-testid="ipam-table">
          <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Gerät</th>
              <th className="px-3 py-2 font-medium">Interface</th>
              <th className="px-3 py-2 font-medium">VLAN</th>
              <th className="px-3 py-2 font-medium">Modus</th>
              <th className="px-3 py-2 font-medium">IP-Adresse</th>
              <th className="px-3 py-2 font-medium">MAC</th>
              <th className="px-3 py-2 font-medium">Hinweise</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              const v = e.vlanId ? project.vlans[e.vlanId] : undefined
              return (
                <tr key={e.portId} className="border-t hover:bg-accent/40">
                  <td className="px-3 py-1.5">
                    <button type="button" className="cursor-pointer font-medium hover:text-primary" onClick={() => showInNetwork(e.deviceId)}>
                      {e.deviceName}
                    </button>
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">{e.portName}</td>
                  <td className="px-3 py-1.5">
                    {v ? (
                      <span className="rounded px-1.5 py-0.5 text-xs font-semibold text-white" style={{ background: v.color }}>
                        {v.tag} {v.name}
                      </span>
                    ) : (
                      '–'
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <SelectField
                      className="h-7 w-24 text-xs"
                      value={e.mode ?? 'none'}
                      options={[
                        { value: 'none', label: 'keine' },
                        { value: 'dhcp', label: 'DHCP' },
                        { value: 'static', label: 'statisch' },
                      ]}
                      onChange={(m) => updatePort(e.deviceId, e.portId, { ipMode: m })}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex gap-1">
                      <TextField
                        className="h-7 w-36 font-mono text-xs"
                        value={e.ip}
                        invalid={e.issues.length > 0}
                        placeholder={e.mode === 'dhcp' ? 'dynamisch' : ''}
                        onChange={(ip) => updatePort(e.deviceId, e.portId, { ipAddress: ip || undefined, ipMode: ip ? 'static' : e.mode }, 'IP geändert', `ip-${e.portId}`)}
                      />
                      {e.vlanId && !e.ip && (
                        <Button size="icon-sm" variant="ghost" title="Nächste freie IP" onClick={() => assignNextIp(e.deviceId, e.portId, e.vlanId!)}>
                          <Sparkles />
                        </Button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{e.mac ?? '–'}</td>
                  <td className="px-3 py-1.5 text-xs">
                    {e.issues.map((i) => (
                      <div key={i} className="flex items-center gap-1 text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]">
                        <TriangleAlert className="size-3" /> {i}
                      </div>
                    ))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FirewallTab() {
  const project = useProjectStore((s) => s.project)
  const vlans = Object.values(project.vlans).sort((a, b) => a.tag - b.tag)
  const endpoints: { value: FirewallEndpoint; label: string }[] = [
    { value: 'any', label: 'Alle' },
    { value: 'internet', label: 'Internet' },
    ...vlans.map((v) => ({ value: v.id as FirewallEndpoint, label: `VLAN ${v.tag} ${v.name}` })),
  ]
  const zones: (Vlan | 'internet')[] = [...vlans, 'internet']
  const upd = (id: Id, patch: Partial<FirewallRule>) => updateFirewallRule(id, patch)
  return (
    <div className="grid min-h-0 flex-1 gap-4 overflow-auto xl:grid-cols-[1fr_auto] scroll-thin">
      <div className="min-w-0 rounded-lg border bg-card">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <span className="font-semibold">Regeln</span>
          <span className="text-xs text-muted-foreground">(von oben nach unten, erste passende Regel gilt)</span>
          <Button size="sm" className="ml-auto" onClick={() => addFirewallRule()}>
            <Plus /> Regel
          </Button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-2 font-medium">#</th>
              <th className="px-2 py-2 font-medium">Aktiv</th>
              <th className="px-2 py-2 font-medium">Name</th>
              <th className="px-2 py-2 font-medium">Aktion</th>
              <th className="px-2 py-2 font-medium">Quelle</th>
              <th className="px-2 py-2 font-medium">Ziel</th>
              <th className="px-2 py-2 font-medium">Protokoll</th>
              <th className="px-2 py-2 font-medium">Ports</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {project.firewallRules.map((r, i) => (
              <tr key={r.id} className={cn('border-t', !r.enabled && 'opacity-50')}>
                <td className="px-2 py-1 text-xs text-muted-foreground">{i + 1}</td>
                <td className="px-2 py-1">
                  <input type="checkbox" checked={r.enabled} onChange={(e) => upd(r.id, { enabled: e.target.checked })} className="size-4 cursor-pointer accent-[var(--primary)]" />
                </td>
                <td className="px-2 py-1">
                  <TextField className="h-7 text-xs" value={r.name} onChange={(v) => upd(r.id, { name: v })} />
                </td>
                <td className="px-2 py-1">
                  <SelectField
                    className={cn('h-7 w-24 text-xs font-semibold', r.action === 'allow' ? 'text-success' : 'text-destructive')}
                    value={r.action}
                    options={[
                      { value: 'allow', label: 'Erlauben' },
                      { value: 'deny', label: 'Blockieren' },
                    ]}
                    onChange={(v) => upd(r.id, { action: v })}
                  />
                </td>
                <td className="px-2 py-1">
                  <SelectField className="h-7 text-xs" value={r.source} options={endpoints} onChange={(v) => upd(r.id, { source: v })} />
                </td>
                <td className="px-2 py-1">
                  <SelectField className="h-7 text-xs" value={r.destination} options={endpoints} onChange={(v) => upd(r.id, { destination: v })} />
                </td>
                <td className="px-2 py-1">
                  <SelectField className="h-7 w-20 text-xs" value={r.protocol} options={['any', 'tcp', 'udp', 'icmp'] as const} onChange={(v) => upd(r.id, { protocol: v })} />
                </td>
                <td className="px-2 py-1">
                  <TextField className="h-7 w-28 text-xs" value={r.ports} placeholder="443, 8000-8100" onChange={(v) => upd(r.id, { ports: v })} />
                </td>
                <td className="whitespace-nowrap px-1 py-1">
                  <Button size="icon-xs" variant="ghost" onClick={() => moveFirewallRule(r.id, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button size="icon-xs" variant="ghost" onClick={() => moveFirewallRule(r.id, 1)}>
                    <ArrowDown />
                  </Button>
                  <Button size="icon-xs" variant="ghost" onClick={() => deleteFirewallRule(r.id)}>
                    <Trash2 />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center gap-2 border-t px-3 py-2 text-sm">
          Standard-Richtlinie zwischen VLANs:
          <SelectField
            className="h-7 w-36 text-xs"
            value={project.settings.interVlanDefault}
            options={[
              { value: 'deny', label: 'Blockieren' },
              { value: 'allow', label: 'Erlauben' },
            ]}
            onChange={(v) => updateProjectMeta({ settings: { interVlanDefault: v } })}
          />
        </div>
      </div>
      <div className="rounded-lg border bg-card p-3">
        <div className="mb-2 font-semibold">Zugriffsmatrix</div>
        <div className="mb-2 text-xs text-muted-foreground">Zeile = Quelle, Spalte = Ziel (vereinfachte Auswertung)</div>
        <table className="text-xs" data-testid="fw-matrix">
          <thead>
            <tr>
              <th />
              {zones.map((z) => (
                <th key={z === 'internet' ? 'inet' : z.id} className="px-1 pb-1 font-semibold">
                  {z === 'internet' ? 'WAN' : <span className="rounded px-1 text-white" style={{ background: z.color }}>{z.tag}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {zones.map((from) => (
              <tr key={from === 'internet' ? 'inet' : from.id}>
                <th className="pr-2 text-right font-semibold">{from === 'internet' ? 'Internet' : `${from.tag} ${from.name}`}</th>
                {zones.map((to) => {
                  const res = evaluateFirewall(project, from === 'internet' ? 'internet' : from.id, to === 'internet' ? 'internet' : to.id)
                  const same = from === to
                  return (
                    <td key={to === 'internet' ? 'inet' : to.id} className="p-0.5">
                      <div
                        className={cn('flex size-8 items-center justify-center rounded font-bold', same ? 'bg-muted text-muted-foreground' : res.action === 'allow' ? 'bg-success/20 text-success' : 'bg-destructive/15 text-destructive')}
                        title={res.rule ? `Regel: ${res.rule.name}` : same ? 'Innerhalb des VLANs' : 'Standard-Richtlinie'}
                      >
                        {same ? '·' : res.action === 'allow' ? '✓' : '✕'}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ServicesTab() {
  const project = useProjectStore((s) => s.project)
  const vlans = Object.values(project.vlans).sort((a, b) => a.tag - b.tag)
  const l3 = Object.values(project.devices).filter((d) => ['router', 'firewall', 'gateway', 'vpn-gateway'].includes(d.kind))
  const autoDns = useMemo(() => {
    const out: { name: string; ip: string; device: string }[] = []
    for (const d of Object.values(project.devices)) {
      const p = getDevicePorts(d).find((x) => x.port.ipAddress && x.port.role !== 'management') ?? getDevicePorts(d).find((x) => x.port.ipAddress)
      if (!p) continue
      const vlan = p.port.vlanIds?.[0] ? project.vlans[p.port.vlanIds[0]] : undefined
      const host = d.hostname ?? d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      out.push({ name: `${host}${vlan?.domain ? `.${vlan.domain}` : ''}`, ip: p.port.ipAddress!, device: d.name })
    }
    return out.sort((a, b) => (parseIp(a.ip) ?? 0) - (parseIp(b.ip) ?? 0))
  }, [project])
  const setRecords = (records: DnsRecord[]) =>
    commit('DNS-Einträge geändert', (d) => {
      d.dnsRecords = records
    }, { mergeKey: 'dns' })

  return (
    <div className="grid min-h-0 flex-1 gap-4 overflow-auto lg:grid-cols-2 scroll-thin">
      <div className="rounded-lg border bg-card">
        <div className="border-b px-3 py-2 font-semibold">DHCP-Bereiche</div>
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">VLAN</th>
              <th className="px-3 py-1.5 font-medium">Bereich</th>
              <th className="px-3 py-1.5 font-medium">Adressen</th>
              <th className="px-3 py-1.5 font-medium">DNS</th>
            </tr>
          </thead>
          <tbody>
            {vlans.map((v) => {
              const s = parseIp(v.dhcp?.rangeStart)
              const e = parseIp(v.dhcp?.rangeEnd)
              return (
                <tr key={v.id} className="border-t">
                  <td className="px-3 py-1.5">
                    <span className="rounded px-1.5 py-0.5 text-xs font-semibold text-white" style={{ background: v.color }}>
                      {v.tag}
                    </span>{' '}
                    {v.name}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs">{v.dhcp?.enabled ? `${v.dhcp.rangeStart} – ${v.dhcp.rangeEnd}` : <span className="text-muted-foreground">aus</span>}</td>
                  <td className="px-3 py-1.5 text-xs">{v.dhcp?.enabled && s !== null && e !== null ? e - s + 1 : '–'}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{(v.dnsServers ?? []).join(', ') || '–'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="rounded-lg border bg-card">
        <div className="border-b px-3 py-2 font-semibold">Routing (Layer-3-Geräte)</div>
        <div className="space-y-3 p-3">
          {l3.map((d) => (
            <div key={d.id} className="rounded-md border p-2">
              <div className="mb-1 font-medium">{d.name}</div>
              <div className="mb-1 text-xs text-muted-foreground">Direkt verbundene Netze (Gateways):</div>
              <ul className="mb-2 space-y-0.5 font-mono text-xs">
                {vlans
                  .filter((v) => getDevicePorts(d).some((p) => p.port.vlanIds?.includes(v.id) || p.port.nativeVlanId === v.id))
                  .map((v) => (
                    <li key={v.id}>
                      {v.subnet} → {v.gateway} <span className="text-muted-foreground">(VLAN {v.tag})</span>
                    </li>
                  ))}
              </ul>
              <div className="text-xs text-muted-foreground">Statische Routen:</div>
              <ul className="space-y-1 text-xs">
                {(d.routes ?? []).map((r) => (
                  <li key={r.id} className="font-mono">
                    {r.destination} via {r.gateway}
                  </li>
                ))}
              </ul>
              <Button
                size="xs"
                variant="outline"
                className="mt-1"
                onClick={async () => {
                  const r = await ask({
                    title: `Statische Route für ${d.name}`,
                    description: 'Pakete für das Zielnetz werden an das Gateway weitergeleitet (z. B. ein VPN-Netz hinter einem anderen Router).',
                    confirmLabel: 'Route hinzufügen',
                    fields: [
                      { key: 'dest', label: 'Zielnetz (CIDR)', placeholder: '10.8.0.0/24', validate: (v) => (isValidCidr(v.trim()) ? null : 'Format: 10.8.0.0/24') },
                      { key: 'gw', label: 'Gateway (IP-Adresse)', placeholder: '192.168.10.254', validate: (v) => (parseIp(v.trim()) !== null ? null : 'Gültige IPv4-Adresse eingeben, z. B. 192.168.10.254') },
                    ],
                  })
                  if (r) updateDevice(d.id, (x) => (x.routes = [...(x.routes ?? []), { id: uid('rt'), destination: r.dest.trim(), gateway: r.gw.trim() }]), 'Route hinzugefügt')
                }}
              >
                <Plus /> Route
              </Button>
            </div>
          ))}
          {!l3.length && <div className="text-sm text-muted-foreground">Kein Router / keine Firewall im Projekt.</div>}
        </div>
      </div>
      <div className="rounded-lg border bg-card lg:col-span-2">
        <div className="flex items-center border-b px-3 py-2">
          <span className="font-semibold">DNS</span>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setRecords([...project.dnsRecords, { id: uid('dns'), name: 'host.home.lan', type: 'A', value: '' }])}>
            <Plus /> Eintrag
          </Button>
        </div>
        <div className="grid gap-4 p-3 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Automatisch aus Hostnamen & IPs</div>
            <table className="w-full text-xs">
              <tbody>
                {autoDns.map((r) => (
                  <tr key={r.name + r.ip} className="border-b last:border-0">
                    <td className="py-1 font-mono">{r.name}</td>
                    <td className="py-1 text-muted-foreground">A</td>
                    <td className="py-1 text-right font-mono">{r.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Manuelle Einträge</div>
            {project.dnsRecords.map((r, i) => (
              <div key={r.id} className="mb-1 flex gap-1">
                <TextField className="h-7 font-mono text-xs" value={r.name} onChange={(v) => setRecords(project.dnsRecords.map((x, k) => (k === i ? { ...x, name: v } : x)))} />
                <SelectField className="h-7 w-20 text-xs" value={r.type} options={['A', 'AAAA', 'CNAME', 'TXT'] as const} onChange={(v) => setRecords(project.dnsRecords.map((x, k) => (k === i ? { ...x, type: v } : x)))} />
                <TextField className="h-7 font-mono text-xs" value={r.value} onChange={(v) => setRecords(project.dnsRecords.map((x, k) => (k === i ? { ...x, value: v } : x)))} />
                <Button size="icon-sm" variant="ghost" onClick={() => setRecords(project.dnsRecords.filter((_, k) => k !== i))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            {!project.dnsRecords.length && <div className="text-xs text-muted-foreground">Keine manuellen Einträge.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

function SubnetCalculator() {
  const [cidr, setCidr] = useState('192.168.20.0/24')
  const c = parseCidr(cidr)
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm">
      <span className="font-semibold">Subnetzrechner</span>
      <TextField className="h-7 w-44 font-mono text-xs" value={cidr} invalid={!c} onChange={setCidr} />
      {c && (
        <span className="font-mono text-xs text-muted-foreground">
          Netz {formatIp(c.network)} · Maske {formatIp(c.mask)} · Hosts {formatIp(c.first)}–{formatIp(c.last)} ({c.hosts.toLocaleString('de-DE')}) · Broadcast {formatIp(c.broadcast)}
        </span>
      )}
    </div>
  )
}

export function IpamPage() {
  const [tab, setTab] = useState('vlans')
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden bg-canvas p-4" data-testid="ipam-page">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">VLAN- & IP-Planung</h1>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="vlans">VLANs & Subnetze</TabsTrigger>
            <TabsTrigger value="ips" data-testid="tab-ips">
              IP-Adressen
            </TabsTrigger>
            <TabsTrigger value="firewall" data-testid="tab-firewall">
              Firewall
            </TabsTrigger>
            <TabsTrigger value="services">DHCP, DNS & Routing</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="ml-auto flex items-center gap-1">
          <SubnetCalculator />
          <HelpButton section="ipam" />
        </div>
      </div>
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsContent value="vlans" className="flex min-h-0 flex-1 flex-col">
          <VlanTab />
        </TabsContent>
        <TabsContent value="ips" className="flex min-h-0 flex-1 flex-col">
          <IpTab />
        </TabsContent>
        <TabsContent value="firewall" className="flex min-h-0 flex-1 flex-col">
          <FirewallTab />
        </TabsContent>
        <TabsContent value="services" className="flex min-h-0 flex-1 flex-col">
          <ServicesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
