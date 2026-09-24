import { useMemo } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Copy, Plus, RotateCw, Trash2, X } from 'lucide-react'
import type { ComponentOf, Device, HardwareComponent, Id, MainboardSpecs, OnboardNicSpec, PcieSlotSpec, M2SlotSpec } from '@/models'
import { SPEED_OPTIONS, formatSpeed } from '@/models'
import { COMPONENT_CATALOG } from '@/data/componentCatalog'
import { useProjectStore } from '@/store/projectStore'
import { useUiStore } from '@/store/uiStore'
import {
  addComponentFromTemplate,
  deleteComponents,
  duplicateComponents,
  installComponent,
  removeInternalLink,
  rotateComponents,
  setDriveController,
  uninstallComponents,
  updateComponent,
  updateComponentSpecs,
} from '@/store/actions/hardware'
import { analyzeBuild, checkFit, controllerSupports, issuesForComponent, slotAcceptsKind, storageControllers } from '@/utils/compatibility'
import { createComponent } from '@/utils/factory'
import { getSlot } from '@/utils/buildOps'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ComponentIcon, COMPONENT_KIND_LABELS } from '@/components/icons'
import { InfoButton } from '@/components/InfoButton'
import { Field, KV, NumberField, Row, Section, SelectField, SwitchField, TextAreaField, TextField } from './fields'
import { SPEC_FIELDS, type SpecField } from './specFields'
import { PortEditor } from './PortOverview'
import { IssueList } from './IssueList'
import { cn } from '@/lib/utils'

function SpecEditor({ device, c }: { device: Device; c: HardwareComponent }) {
  const fields = SPEC_FIELDS[c.kind]
  const specs = c.specs as unknown as Record<string, unknown>
  const set = (key: string, value: unknown) => updateComponentSpecs(device.id, c.id, { [key]: value } as never, `spec-${c.id}-${key}`)
  const render = (f: SpecField) => {
    const v = specs[f.key]
    switch (f.type) {
      case 'number':
        return <NumberField value={v as number | undefined} min={f.min} max={f.max} step={f.step} unit={f.unit} onChange={(x) => set(f.key, x)} />
      case 'text':
        return <TextField value={(v as string) ?? ''} onChange={(x) => set(f.key, x)} />
      case 'select':
        return <SelectField value={v as string | number} options={f.options} onChange={(x) => set(f.key, x)} />
      case 'bool':
        return null
      case 'list': {
        const arr = (v as string[] | undefined) ?? []
        return (
          <div className="flex flex-wrap gap-1">
            {f.options.map((o) => {
              const on = arr.includes(o)
              return (
                <button
                  key={o}
                  type="button"
                  className={cn('cursor-pointer rounded border px-1.5 py-0.5 text-xs', on ? 'border-primary bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent')}
                  onClick={() => set(f.key, on ? arr.filter((x) => x !== o) : [...arr, o])}
                >
                  {o}
                </button>
              )
            })}
          </div>
        )
      }
    }
  }
  const normal = fields.filter((f) => f.type !== 'bool')
  const bools = fields.filter((f) => f.type === 'bool')
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {normal.map((f) => (
          <Field key={f.key} label={f.label} className={f.type === 'list' || f.type === 'text' ? 'col-span-2' : undefined}>
            {render(f)}
          </Field>
        ))}
      </div>
      {bools.map((f) => (
        <SwitchField key={f.key} label={f.label} checked={!!specs[f.key]} onChange={(x) => set(f.key, x)} />
      ))}
    </>
  )
}

function MainboardLayoutEditor({ device, c }: { device: Device; c: ComponentOf<'mainboard'> }) {
  const s = c.specs
  const set = (patch: Partial<MainboardSpecs>) => updateComponentSpecs<'mainboard'>(device.id, c.id, patch)
  const setPcie = (i: number, patch: Partial<PcieSlotSpec>) => set({ pcieSlots: s.pcieSlots.map((p, k) => (k === i ? { ...p, ...patch } : p)) })
  const setM2 = (i: number, patch: Partial<M2SlotSpec>) => set({ m2Slots: s.m2Slots.map((p, k) => (k === i ? { ...p, ...patch } : p)) })
  const setNic = (i: number, patch: Partial<OnboardNicSpec>) => set({ onboardNics: s.onboardNics.map((p, k) => (k === i ? { ...p, ...patch } : p)) })
  const laneOpts = [1, 4, 8, 16].map((x) => ({ value: x as 1 | 4 | 8 | 16, label: `x${x}` }))
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
          PCIe-Steckplätze
          <Button size="xs" variant="ghost" onClick={() => set({ pcieSlots: [...s.pcieSlots, { physical: 16, lanes: 16, gen: 4 }] })}>
            <Plus /> Slot
          </Button>
        </div>
        {s.pcieSlots.map((p, i) => (
          <div key={i} className="mb-1 flex items-center gap-1 text-xs">
            <span className="w-5 text-muted-foreground">{i + 1}</span>
            <SelectField className="h-7 text-xs" value={p.physical} options={laneOpts} onChange={(v) => setPcie(i, { physical: v, lanes: Math.min(p.lanes, v) as 1 | 4 | 8 | 16 })} />
            <span className="text-muted-foreground">@</span>
            <SelectField className="h-7 text-xs" value={p.lanes} options={laneOpts.filter((o) => o.value <= p.physical)} onChange={(v) => setPcie(i, { lanes: v })} />
            <SelectField className="h-7 text-xs" value={p.gen} options={[3, 4, 5].map((g) => ({ value: g, label: `Gen${g}` }))} onChange={(v) => setPcie(i, { gen: v })} />
            {s.sockets > 1 && <SelectField className="h-7 text-xs" value={p.cpu ?? 0} options={[{ value: 0, label: 'CPU1' }, { value: 1, label: 'CPU2' }]} onChange={(v) => setPcie(i, { cpu: v })} />}
            <Button size="icon-xs" variant="ghost" onClick={() => set({ pcieSlots: s.pcieSlots.filter((_, k) => k !== i) })}>
              <X />
            </Button>
          </div>
        ))}
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
          M.2-Steckplätze
          <Button size="xs" variant="ghost" onClick={() => set({ m2Slots: [...s.m2Slots, { maxLength: 80, interfaces: ['NVMe'], pcieGen: 4 }] })}>
            <Plus /> Slot
          </Button>
        </div>
        {s.m2Slots.map((m, i) => (
          <div key={i} className="mb-1 flex items-center gap-1 text-xs">
            <span className="w-5 text-muted-foreground">{i + 1}</span>
            <SelectField className="h-7 text-xs" value={m.maxLength} options={[42, 60, 80, 110].map((l) => ({ value: l, label: `22${l}` }))} onChange={(v) => setM2(i, { maxLength: v })} />
            <SelectField
              className="h-7 text-xs"
              value={m.interfaces.join('+')}
              options={[
                { value: 'NVMe', label: 'NVMe' },
                { value: 'NVMe+SATA', label: 'NVMe + SATA' },
                { value: 'SATA', label: 'SATA' },
              ]}
              onChange={(v) => setM2(i, { interfaces: v.split('+') as M2SlotSpec['interfaces'] })}
            />
            <Button size="icon-xs" variant="ghost" onClick={() => set({ m2Slots: s.m2Slots.filter((_, k) => k !== i) })}>
              <X />
            </Button>
          </div>
        ))}
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
          Onboard-Netzwerk
          <Button size="xs" variant="ghost" onClick={() => set({ onboardNics: [...s.onboardNics, { name: `LAN ${s.onboardNics.length + 1}`, speed: 1000, connector: 'RJ45' }] })}>
            <Plus /> Port
          </Button>
        </div>
        {s.onboardNics.map((n, i) => (
          <div key={i} className="mb-1 flex items-center gap-1 text-xs">
            <TextField className="h-7 text-xs" value={n.name} onChange={(v) => setNic(i, { name: v })} />
            <SelectField className="h-7 text-xs" value={n.speed} options={SPEED_OPTIONS.map((x) => ({ value: x, label: formatSpeed(x) }))} onChange={(v) => setNic(i, { speed: v })} />
            <SelectField className="h-7 text-xs" value={n.connector} options={['RJ45', 'SFP+', 'SFP28']} onChange={(v) => setNic(i, { connector: v as OnboardNicSpec['connector'] })} />
            <Button size="icon-xs" variant="ghost" onClick={() => set({ onboardNics: s.onboardNics.filter((_, k) => k !== i) })}>
              <X />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

function DriveController({ device, c }: { device: Device; c: ComponentOf<'storage'> }) {
  const build = device.build!
  if (c.mount?.parentId !== 'chassis') return null
  const link = build.links.find((l) => l.fromId === c.id && ['sata', 'sas', 'nvme'].includes(l.kind))
  const ctrls = storageControllers(build)
  return (
    <Field label="Angeschlossen an" hint={!link ? '⚠ Laufwerk ist mit keinem Controller verbunden' : undefined}>
      <SelectField
        value={link?.toId ?? ''}
        options={[
          { value: '', label: '– nicht verbunden –' },
          ...ctrls.map((x) => ({
            value: x.id,
            label: `${x.name} (${x.used}/${x.capacity})${controllerSupports(x, c) ? '' : ' – inkompatibel'}`,
          })),
        ]}
        onChange={(v) => setDriveController(device.id, c.id, v || null)}
      />
    </Field>
  )
}

export function ComponentInspector({ device, ids }: { device: Device; ids: Id[] }) {
  const build = device.build!
  const issues = useMemo(() => analyzeBuild(build), [build])
  const comps = ids.map((id) => build.components.find((c) => c.id === id)).filter((c): c is HardwareComponent => !!c)
  if (!comps.length) return null
  if (comps.length > 1) {
    return (
      <div>
        <Section title={`${comps.length} Bauteile ausgewählt`}>
          <ul className="space-y-1 text-sm">
            {comps.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <ComponentIcon kind={c.kind} className="size-4 text-muted-foreground" />
                <span className="truncate">{c.name}</span>
                {!c.mount && <Badge variant="warning">lose</Badge>}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Button size="sm" variant="outline" onClick={() => comps.forEach((c) => !c.mount && installComponent(device.id, c.id))}>
              <ArrowDownToLine /> Einbauen
            </Button>
            <Button size="sm" variant="outline" onClick={() => uninstallComponents(device.id, ids)}>
              <ArrowUpFromLine /> Ausbauen
            </Button>
            <Button size="sm" variant="outline" onClick={() => duplicateComponents(device.id, ids)}>
              <Copy /> Duplizieren
            </Button>
            <Button size="sm" variant="outline" className="text-destructive" onClick={() => deleteComponents(device.id, ids)}>
              <Trash2 /> Löschen
            </Button>
          </div>
        </Section>
      </div>
    )
  }
  const c = comps[0]
  const slot = c.mount ? getSlot(build, { ownerId: c.mount.parentId, slotId: c.mount.slotId }) : undefined
  const parent = c.mount && c.mount.parentId !== 'chassis' ? build.components.find((x) => x.id === c.mount!.parentId) : undefined
  const own = issuesForComponent(issues, c.id)
  const links = build.links.filter((l) => l.fromId === c.id || l.toId === c.id || l.toId.startsWith(`${c.id}:`))
  const upd = (recipe: (x: HardwareComponent) => void, key: string) => updateComponent(device.id, c.id, recipe, 'Bauteil geändert', `cmp-${c.id}-${key}`)

  return (
    <div>
      <div className="flex items-start gap-2.5 border-b px-3 py-3">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <ComponentIcon kind={c.kind} className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{c.name}</div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {COMPONENT_KIND_LABELS[c.kind]}
            <InfoButton component={c.kind} label />
          </div>
        </div>
      </div>
      <Section title="Einbauort">
        {c.mount && slot ? (
          <>
            <KV label="Steckplatz">{slot.label}</KV>
            <KV label="In">{parent ? parent.name : build.chassis.name}</KV>
          </>
        ) : (
          <div className="rounded-md bg-warning/15 px-2 py-1.5 text-xs">Nicht eingebaut – liegt lose in der Ablage. Auf einen passenden Steckplatz ziehen oder automatisch einbauen.</div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {c.mount ? (
            <Button size="sm" variant="outline" onClick={() => uninstallComponents(device.id, [c.id])}>
              <ArrowUpFromLine /> Ausbauen
            </Button>
          ) : (
            <Button size="sm" onClick={() => installComponent(device.id, c.id)}>
              <ArrowDownToLine /> Automatisch einbauen
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => duplicateComponents(device.id, [c.id])}>
            <Copy /> Duplizieren
          </Button>
          {!c.mount && (
            <Button size="sm" variant="outline" onClick={() => rotateComponents(device.id, [c.id], 90)}>
              <RotateCw /> 90°
            </Button>
          )}
          <Button size="sm" variant="outline" className="text-destructive" onClick={() => deleteComponents(device.id, [c.id])}>
            <Trash2 /> Löschen
          </Button>
        </div>
        {!c.mount && (
          <Row className="grid-cols-3">
            <Field label="X">
              <NumberField value={Math.round(c.placement.x)} onChange={(v) => upd((x) => (x.placement.x = v), 'x')} unit="mm" />
            </Field>
            <Field label="Y">
              <NumberField value={Math.round(c.placement.y)} onChange={(v) => upd((x) => (x.placement.y = v), 'y')} unit="mm" />
            </Field>
            <Field label="Drehung">
              <NumberField value={c.placement.rotation} onChange={(v) => upd((x) => (x.placement.rotation = ((v % 360) + 360) % 360), 'r')} unit="°" />
            </Field>
          </Row>
        )}
      </Section>
      {own.length > 0 && (
        <Section title="Kompatibilität">
          <IssueList issues={own} deviceId={device.id} />
        </Section>
      )}
      <Section title="Allgemein">
        <Field label="Bezeichnung">
          <TextField value={c.name} onChange={(v) => upd((x) => (x.name = v), 'name')} />
        </Field>
        <Row>
          <Field label="Hersteller">
            <TextField value={c.manufacturer} onChange={(v) => upd((x) => (x.manufacturer = v), 'mf')} />
          </Field>
          <Field label="Modell">
            <TextField value={c.model} onChange={(v) => upd((x) => (x.model = v), 'model')} />
          </Field>
        </Row>
        <Row>
          <Field label="Leistungsaufnahme">
            <NumberField value={c.kind === 'cpu' ? c.specs.tdpW : c.powerW} unit="W" min={0} onChange={(v) => (c.kind === 'cpu' ? updateComponentSpecs<'cpu'>(device.id, c.id, { tdpW: v }) : upd((x) => (x.powerW = v), 'pw'))} />
          </Field>
          <Field label="Gewicht">
            <NumberField value={c.weightKg} unit="kg" step={0.05} min={0} onChange={(v) => upd((x) => (x.weightKg = v), 'kg')} />
          </Field>
        </Row>
      </Section>
      <Section title="Eigenschaften">
        <SpecEditor device={device} c={c} />
        {c.kind === 'storage' && <DriveController device={device} c={c} />}
      </Section>
      {c.kind === 'mainboard' && (
        <Section title="Steckplätze & Anschlüsse" defaultOpen={false}>
          <MainboardLayoutEditor device={device} c={c} />
        </Section>
      )}
      {!!c.ports?.length && (
        <Section title={`Netzwerkports (${c.ports.length})`}>
          {c.ports.map((p) => (
            <div key={p.id}>
              <div className="mb-1 text-xs font-semibold">
                {p.name} <span className="font-normal text-muted-foreground">· {formatSpeed(p.speed)} {p.connector}</span>
              </div>
              <PortEditor device={device} port={p} editableHardware={false} />
            </div>
          ))}
        </Section>
      )}
      {links.length > 0 && (
        <Section title="Interne Verbindungen">
          {links.map((l) => {
            const otherId = l.fromId === c.id ? l.toId : l.fromId
            const other = build.components.find((x) => x.id === otherId.split(':')[0])
            return (
              <div key={l.id} className="flex items-center gap-2 text-sm">
                <Badge variant="secondary">{l.kind.toUpperCase()}</Badge>
                <span className="flex-1 truncate">{other ? `${other.name}${otherId.includes(':') ? ` (${otherId.split(':')[1].toUpperCase()})` : ''}` : otherId}</span>
                <Button size="icon-xs" variant="ghost" onClick={() => removeInternalLink(device.id, l.id)}>
                  <X />
                </Button>
              </div>
            )
          })}
        </Section>
      )}
      <Section title="Notizen" defaultOpen={!!c.notes}>
        <TextAreaField value={c.notes} onChange={(v) => upd((x) => (x.notes = v), 'notes')} placeholder="Seriennummer, Kaufdatum, Garantie …" />
      </Section>
    </div>
  )
}

export function SlotInspector({ device, ownerId, slotId }: { device: Device; ownerId: Id | 'chassis'; slotId: Id }) {
  const build = device.build!
  const custom = useProjectStore((s) => s.project.customTemplates.components)
  const select = useUiStore((s) => s.select)
  const slot = getSlot(build, { ownerId, slotId })
  const occupant = build.components.find((c) => c.mount?.parentId === ownerId && c.mount.slotId === slotId)
  const candidates = useMemo(() => {
    if (!slot) return []
    return [...COMPONENT_CATALOG, ...custom]
      .map((t) => {
        const c = createComponent(t)
        if (!slotAcceptsKind(slot, c)) return null
        return { t, fit: checkFit(build, ownerId, slot, c) }
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => ({ ok: 0, info: 1, warning: 2, error: 3 })[a.fit.level] - ({ ok: 0, info: 1, warning: 2, error: 3 })[b.fit.level])
  }, [slot, build, ownerId, custom])
  if (!slot) return null
  const meta = slot.meta
  return (
    <div>
      <div className="border-b px-3 py-3">
        <div className="text-xs text-muted-foreground">Steckplatz</div>
        <div className="font-semibold">{slot.label}</div>
      </div>
      <Section title="Eigenschaften">
        {meta.socket && <KV label="Sockel">{meta.socket}</KV>}
        {meta.memoryType && <KV label="Speicher">{`${meta.memoryType} ${meta.memoryModule ?? ''}`}</KV>}
        {meta.cpuIndex !== undefined && <KV label="Gehört zu">CPU {meta.cpuIndex + 1}</KV>}
        {meta.physical && <KV label="PCIe">{`x${meta.physical} (elektrisch x${meta.lanes}) Gen${meta.pcieGen}`}</KV>}
        {meta.maxLength && <KV label="M.2 max.">{`22${meta.maxLength} · ${meta.interfaces?.join('/')}`}</KV>}
        {meta.formFactors && <KV label="Formfaktoren">{meta.formFactors.join(', ')}</KV>}
        {meta.hotSwap !== undefined && <KV label="Hot-Swap">{meta.hotSwap ? 'ja' : 'nein'}</KV>}
        {meta.nvme !== undefined && <KV label="NVMe (U.2)">{meta.nvme ? 'ja' : 'nein'}</KV>}
        {meta.fanSize && <KV label="Lüftergröße">{meta.fanSize} mm</KV>}
        <KV label="Belegt">{occupant ? occupant.name : 'frei'}</KV>
        {occupant && (
          <Button size="sm" variant="outline" onClick={() => select({ type: 'component', deviceId: device.id, ids: [occupant.id] })}>
            Bauteil auswählen
          </Button>
        )}
      </Section>
      <Section title="Passende Bauteile einsetzen">
        <div className="space-y-1">
          {candidates.map(({ t, fit }) => (
            <div key={t.id} className={cn('flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs', fit.level === 'error' && 'opacity-55')}>
              <span className={cn('size-2 shrink-0 rounded-full', fit.level === 'error' ? 'bg-destructive' : fit.level === 'warning' ? 'bg-warning' : 'bg-success')} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{t.name}</div>
                {fit.messages.length > 0 && fit.level !== 'ok' && <div className="truncate text-muted-foreground" title={fit.messages.join(' · ')}>{fit.messages[0]}</div>}
              </div>
              <Button
                size="xs"
                variant={fit.level === 'error' ? 'ghost' : 'outline'}
                disabled={fit.level === 'error'}
                onClick={() => {
                  const id = addComponentFromTemplate(device.id, t.id, { target: { ownerId, slotId } })
                  if (id) select({ type: 'component', deviceId: device.id, ids: [id] })
                }}
              >
                Einsetzen
              </Button>
            </div>
          ))}
          {!candidates.length && <div className="text-xs text-muted-foreground">Keine passenden Bauteile in der Bibliothek.</div>}
        </div>
      </Section>
    </div>
  )
}
