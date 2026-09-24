import { useMemo, useState } from 'react'
import { Copy, Eye, EyeOff, Network, Plus, Server, Trash2, Wrench, X } from 'lucide-react'
import type { Device, Id, RackStandard, StaticRoute } from '@/models'
import { DEVICE_HEIGHTS_U, RACK_STANDARD_LABEL, uid } from '@/models'
import { useProjectStore } from '@/store/projectStore'
import { deleteDevices, duplicateDevices, setHiddenInNetwork, updateDevice } from '@/store/actions/devices'
import { placeDevice, placeDeviceAuto, unplaceDevice } from '@/store/actions/rack'
import { openInHardware, showInNetwork, showInRack } from '@/store/navigation'
import { DEVICE_KINDS, isServiceKind } from '@/data/deviceKinds'
import { DeviceIcon } from '@/components/icons'
import { InfoButton } from '@/components/InfoButton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { summarizeBuild, formatCapacity } from '@/utils/buildSummary'
import { getDeviceDepth, getDeviceHeightU, getDevicePower, getDeviceRackStandard, getDeviceWeight, isRackable, isShelfDevice } from '@/utils/device'
import { analyzeBuild, worstLevel } from '@/utils/compatibility'
import { canPlace } from '@/utils/rack'
import { isValidCidr, parseIp } from '@/utils/ip'
import { Field, KV, NumberField, Row, Section, SelectField, TextAreaField, TextField } from './fields'
import { PortOverview } from './PortOverview'
import { ISSUE_COLOR, ISSUE_ICON } from './IssueList'
import { cn } from '@/lib/utils'

function RackPlacementEditor({ device }: { device: Device }) {
  const project = useProjectStore((s) => s.project)
  const racks = Object.values(project.racks)
  const [rackId, setRackId] = useState<Id>(device.rackPlacement?.rackId ?? racks[0]?.id ?? '')
  const h = getDeviceHeightU(device)
  if (!isRackable(device)) return <div className="text-xs text-muted-foreground">Kein Rack-Gerät (keine Höheneinheiten). Für Desktop-Geräte kann unter „Physisch“ eine Höhe gesetzt werden (z. B. auf Einlegeboden).</div>
  if (device.rackPlacement) {
    const rack = project.racks[device.rackPlacement.rackId]
    const pos = device.rackPlacement.positionU
    return (
      <div className="space-y-2">
        <KV label="Rack">{rack?.name}</KV>
        <KV label="Position">{`U${pos}${h && h > 1 ? `–U${pos + h - 1}` : ''}`}</KV>
        <Row>
          <Field label="Position (U)">
            <NumberField
              value={pos}
              min={1}
              max={rack?.heightU ?? 48}
              onChange={(v) => canPlace(project, device.rackPlacement!.rackId, device, v).ok && placeDevice(device.id, device.rackPlacement!.rackId, v)}
            />
          </Field>
          <Field label="Montage">
            <SelectField
              value={device.rackPlacement.face}
              options={[
                { value: 'front', label: 'Vorne' },
                { value: 'rear', label: 'Hinten' },
              ]}
              onChange={(v) => placeDevice(device.id, device.rackPlacement!.rackId, pos, v)}
            />
          </Field>
        </Row>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => showInRack(device.id)}>
            <Server /> Im Rack zeigen
          </Button>
          <Button size="sm" variant="ghost" onClick={() => unplaceDevice(device.id)}>
            Aus Rack entfernen
          </Button>
        </div>
      </div>
    )
  }
  if (!racks.length) return <div className="text-xs text-muted-foreground">Noch kein Rack angelegt – im Rack Builder erstellen.</div>
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">Nicht im Rack ({h} HE)</div>
      <div className="flex gap-1.5">
        <SelectField value={rackId} options={racks.map((r) => ({ value: r.id, label: r.name }))} onChange={setRackId} />
        <Button size="sm" onClick={() => rackId && placeDeviceAuto(device.id, rackId)}>
          Einsetzen
        </Button>
      </div>
    </div>
  )
}

function RoutesEditor({ device }: { device: Device }) {
  const routes = device.routes ?? []
  const set = (next: StaticRoute[]) => updateDevice(device.id, (d) => (d.routes = next), 'Routen geändert', `routes-${device.id}`)
  return (
    <div className="space-y-1.5">
      {routes.map((r, i) => (
        <div key={r.id} className="flex items-center gap-1">
          <TextField className="h-7 text-xs" value={r.destination} invalid={!!r.destination && !isValidCidr(r.destination)} placeholder="10.0.0.0/8" onChange={(v) => set(routes.map((x, k) => (k === i ? { ...x, destination: v } : x)))} />
          <span className="text-xs text-muted-foreground">via</span>
          <TextField className="h-7 text-xs" value={r.gateway} invalid={!!r.gateway && parseIp(r.gateway) === null} placeholder="Gateway" onChange={(v) => set(routes.map((x, k) => (k === i ? { ...x, gateway: v } : x)))} />
          <Button size="icon-xs" variant="ghost" onClick={() => set(routes.filter((_, k) => k !== i))}>
            <X />
          </Button>
        </div>
      ))}
      <Button size="xs" variant="outline" onClick={() => set([...routes, { id: uid('rt'), destination: '', gateway: '' }])}>
        <Plus /> Statische Route
      </Button>
    </div>
  )
}

export function DeviceInspector({ device }: { device: Device }) {
  const project = useProjectStore((s) => s.project)
  const info = DEVICE_KINDS[device.kind]
  const summary = useMemo(() => (device.build ? summarizeBuild(device.build) : null), [device.build])
  const issues = useMemo(() => (device.build ? analyzeBuild(device.build) : []), [device.build])
  const worst = worstLevel(issues.filter((i) => i.level !== 'ok'))
  const upd = (recipe: (d: Device) => void, key: string) => updateDevice(device.id, recipe, 'Gerät geändert', `dev-${device.id}-${key}`)
  const service = isServiceKind(device.kind)
  const hosts = Object.values(project.devices).filter((d) => d.id !== device.id && (['server', 'nas', 'mini-pc', 'raspberry-pi', 'workstation', 'docker', 'vm', 'kubernetes', 'pc'].includes(d.kind)))
  const WorstIcon = ISSUE_ICON[worst]

  return (
    <div>
      <div className="flex items-start gap-2.5 border-b px-3 py-3">
        <div className="rounded-md p-2 text-white" style={{ background: info.color }}>
          <DeviceIcon kind={device.kind} className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold" data-testid="inspector-title">{device.name}</div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {info.label}
            <InfoButton device={device.kind} label />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 border-b px-3 py-2">
        {device.build && (
          <Button size="xs" variant="outline" onClick={() => openInHardware(device.id)}>
            <Wrench /> Hardware
          </Button>
        )}
        {isRackable(device) && (
          <Button size="xs" variant="outline" onClick={() => showInRack(device.id)}>
            <Server /> Rack
          </Button>
        )}
        <Button size="xs" variant="outline" onClick={() => showInNetwork(device.id)}>
          <Network /> Netzwerk
        </Button>
        <Button size="xs" variant="ghost" title={device.hiddenInNetwork ? 'Im Netzwerk einblenden' : 'Im Netzwerk ausblenden'} onClick={() => setHiddenInNetwork([device.id], !device.hiddenInNetwork)}>
          {device.hiddenInNetwork ? <EyeOff /> : <Eye />}
        </Button>
        <Button size="xs" variant="ghost" title="Duplizieren" onClick={() => duplicateDevices([device.id])}>
          <Copy />
        </Button>
        <Button size="xs" variant="ghost" className="text-destructive" title="Löschen" onClick={() => deleteDevices([device.id])}>
          <Trash2 />
        </Button>
      </div>

      <Section title="Allgemein">
        <Field label="Name">
          <TextField value={device.name} onChange={(v) => upd((d) => (d.name = v), 'name')} data-testid="device-name-input" />
        </Field>
        <Row>
          <Field label="Typ">
            <SelectField
              value={device.kind}
              options={Object.entries(DEVICE_KINDS)
                .filter(([, k]) => k.category === info.category || (device.build && k.buildable))
                .map(([value, k]) => ({ value: value as Device['kind'], label: k.label }))}
              onChange={(v) => upd((d) => (d.kind = v), 'kind')}
            />
          </Field>
          <Field label="Hostname">
            <TextField value={device.hostname} placeholder="z. B. pve01" onChange={(v) => upd((d) => (d.hostname = v || undefined), 'host')} />
          </Field>
        </Row>
        <Row>
          <Field label="Hersteller">
            <TextField value={device.manufacturer} onChange={(v) => upd((d) => (d.manufacturer = v), 'mf')} />
          </Field>
          <Field label="Modell">
            <TextField value={device.model} onChange={(v) => upd((d) => (d.model = v), 'model')} />
          </Field>
        </Row>
        {service && (
          <Field label="Läuft auf" hint="Host, auf dem der Dienst / die VM betrieben wird">
            <SelectField
              value={device.hostDeviceId ?? ''}
              options={[{ value: '', label: '– kein Host –' }, ...hosts.map((h) => ({ value: h.id, label: h.name }))]}
              onChange={(v) => upd((d) => (d.hostDeviceId = v || undefined), 'hostdev')}
            />
          </Field>
        )}
      </Section>

      {!service && (
        <Section title="Physisch" defaultOpen={!device.build}>
          {device.build ? (
            <>
              <KV label="Gehäuse">{device.build.chassis.name}</KV>
              <KV label="Höhe">{device.build.chassis.params.formFactor === 'rack' ? `${device.build.chassis.params.heightU} HE · ${RACK_STANDARD_LABEL[getDeviceRackStandard(device)]}` : `${device.build.chassis.params.heightMm} mm (Tower)`}</KV>
              <KV label="Breite × Tiefe">{`${device.build.chassis.params.widthMm} × ${getDeviceDepth(device)} mm`}</KV>
              <KV label="Gewicht (berechnet)">{`${getDeviceWeight(device)} kg`}</KV>
            </>
          ) : (
            <>
              <Row>
                <Field label="Höhe (HE)">
                  <SelectField
                    value={device.heightU ?? (device.formFactor === 'rack' ? 1 : 0)}
                    options={[...(device.formFactor === 'rack' ? [] : [{ value: 0, label: '– kein Rack –' }]), ...DEVICE_HEIGHTS_U.map((x) => ({ value: x, label: `${x} HE` }))]}
                    onChange={(v) => upd((d) => (d.heightU = v || undefined), 'hu')}
                  />
                </Field>
                <Field label="Tiefe">
                  <NumberField value={device.depthMm} unit="mm" min={0} onChange={(v) => upd((d) => (d.depthMm = v), 'depth')} />
                </Field>
              </Row>
              {device.formFactor === 'rack' ? (
                <Field label="Rackbreite" hint={getDeviceRackStandard(device) === '10' ? 'passt in 10"-Racks und mit Adapter in 19"-Racks' : 'passt nur in 19"-Racks'}>
                  <SelectField<RackStandard>
                    value={getDeviceRackStandard(device)}
                    options={[
                      { value: '19', label: '19 Zoll' },
                      { value: '10', label: '10 Zoll (Mini-Rack)' },
                    ]}
                    onChange={(v) => upd((d) => (d.rackStandard = v), 'std')}
                  />
                </Field>
              ) : (
                isShelfDevice(device) &&
                device.heightU && (
                  <Field label="Breite" hint="Tischgerät – steht im Rack auf einem Einlegeboden">
                    <NumberField value={device.widthMm} unit="mm" min={0} onChange={(v) => upd((d) => (d.widthMm = v || undefined), 'width')} />
                  </Field>
                )
              )}
              <Row>
                <Field label="Gewicht">
                  <NumberField value={device.weightKg} unit="kg" step={0.1} min={0} onChange={(v) => upd((d) => (d.weightKg = v), 'kg')} />
                </Field>
                <Field label="Leistung (typ.)">
                  <NumberField value={device.powerW} unit="W" min={0} onChange={(v) => upd((d) => (d.powerW = v), 'pw')} />
                </Field>
              </Row>
            </>
          )}
        </Section>
      )}

      {summary && device.build && (
        <Section title="Hardware">
          <KV label="Mainboard">{summary.mainboard ?? '—'}</KV>
          <KV label="CPU">{summary.cpuCount ? `${summary.cpuCount}× ${summary.cpuModels.join(', ')}` : '—'}</KV>
          <KV label="Kerne / Threads">{summary.cores ? `${summary.cores} / ${summary.threads}` : '—'}</KV>
          <KV label="RAM">{summary.ramGB ? `${summary.ramGB} GB (${summary.ramModules}/${summary.dimmSlots} Slots) ${summary.ramType ?? ''}` : '—'}</KV>
          <KV label="Storage">{summary.storageCount ? `${formatCapacity(summary.storageGB)} (${Object.entries(summary.storageByType).map(([k, v]) => `${v.count}× ${k}`).join(', ')})` : '—'}</KV>
          {summary.gpus.length > 0 && <KV label="GPU">{summary.gpus.join(', ')}</KV>}
          {summary.controllers.length > 0 && <KV label="Controller">{summary.controllers.join(', ')}</KV>}
          <KV label="Netzwerk">{summary.ports.map((p) => `${p.count}× ${p.label}`).join(', ') || '—'}</KV>
          <button type="button" className={cn('flex w-full cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs hover:bg-accent')} onClick={() => openInHardware(device.id)}>
            <WorstIcon className={cn('size-4', ISSUE_COLOR[worst])} />
            {worst === 'ok' ? 'Alle Komponenten kompatibel' : `${issues.filter((i) => i.level === 'error' || i.level === 'warning').length} Hinweise zur Kompatibilität`}
            <span className="ml-auto text-muted-foreground">Im Builder öffnen →</span>
          </button>
        </Section>
      )}

      <Section title={`Netzwerk & Ports (${device.ports.length + (device.build?.components.reduce((s, c) => s + (c.ports?.length ?? 0), 0) ?? 0)})`}>
        <PortOverview device={device} />
      </Section>

      {['router', 'firewall', 'gateway', 'vpn-gateway', 'managed-switch'].includes(device.kind) && (
        <Section title="Routing" defaultOpen={!!device.routes?.length}>
          <RoutesEditor device={device} />
        </Section>
      )}

      {!service && (
        <Section title="Strom">
          {summary ? (
            <>
              <KV label="Netzteile">{summary.power.psuCount ? `${summary.power.psuCount}× (${summary.power.psuTotalW} W gesamt${summary.power.redundant ? ', redundant' : ''})` : '—'}</KV>
              <KV label="Leerlauf">{`~${summary.power.idleW} W`}</KV>
              <KV label="Typisch">{`~${summary.power.typicalW} W`}</KV>
              <KV label="Maximal">{`~${summary.power.maxW} W`}</KV>
            </>
          ) : (
            <KV label="Geschätzter Verbrauch">{`~${getDevicePower(device)} W`}</KV>
          )}
          {device.ups && (
            <>
              <KV label="USV-Kapazität">{`${device.ups.capacityVA} VA / ${device.ups.capacityW} W`}</KV>
              <KV label="Batterie">{`${device.ups.batteryWh} Wh`}</KV>
            </>
          )}
          {device.pdu && <KV label="PDU">{`${device.pdu.outlets} Ausgänge, max. ${device.pdu.maxW} W`}</KV>}
          <KV label="Kosten / Jahr">{`~${Math.round(((getDevicePower(device) * 24 * 365) / 1000) * project.settings.energyPrice)} €`}</KV>
        </Section>
      )}

      {!service && (
        <Section title="Rack">
          <RackPlacementEditor device={device} />
        </Section>
      )}

      <Section title="Notizen" defaultOpen={!!device.notes}>
        <TextAreaField value={device.notes} onChange={(v) => upd((d) => (d.notes = v), 'notes')} placeholder="Standort, Seriennummer, Zugangsdaten-Hinweis, Wartung …" />
      </Section>
      {device.hiddenInNetwork && (
        <div className="px-3 py-2">
          <Badge variant="secondary">Im Netzwerk-Designer ausgeblendet</Badge>
        </div>
      )}
    </div>
  )
}
