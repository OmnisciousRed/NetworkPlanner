import { useMemo } from 'react'
import { Battery, Gauge, Thermometer, Trash2, TriangleAlert, Weight, Zap } from 'lucide-react'
import type { Id, Rack, RackStandard } from '@/models'
import { RACK_HEIGHTS, RACK_STANDARD_LABEL, rackStandardOf } from '@/models'
import { useProjectStore } from '@/store/projectStore'
import { deleteRack, fillWithBlanks, removeBlanks, updateRack } from '@/store/actions/rack'
import { analyzeRack } from '@/utils/rack'
import { Button } from '@/components/ui/button'
import { Field, KV, NumberField, Row, Section, SelectField, TextAreaField, TextField } from './fields'
import { cn } from '@/lib/utils'

function Bar({ value, max, warnAt = 0.8 }: { value: number; max: number; warnAt?: number }) {
  const pct = max > 0 ? Math.min(1, value / max) : 0
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn('h-full rounded-full', pct > 1 || value > max ? 'bg-destructive' : pct > warnAt ? 'bg-warning' : 'bg-primary')} style={{ width: `${pct * 100}%` }} />
    </div>
  )
}

export function RackAnalysisPanel({ rack }: { rack: Rack }) {
  const project = useProjectStore((s) => s.project)
  const a = useMemo(() => analyzeRack(project, rack), [project, rack])
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md border p-2">
          <div className="text-lg font-semibold leading-none">{a.heightU}U</div>
          <div className="mt-1 text-[11px] text-muted-foreground">Höhe</div>
        </div>
        <div className="rounded-md border p-2">
          <div className="text-lg font-semibold leading-none">{a.usedU}U</div>
          <div className="mt-1 text-[11px] text-muted-foreground">Belegt</div>
        </div>
        <div className="rounded-md border p-2">
          <div className="text-lg font-semibold leading-none text-success">{a.freeU}U</div>
          <div className="mt-1 text-[11px] text-muted-foreground">Frei</div>
        </div>
      </div>
      <div className="space-y-1">
        <KV label="Belegung">{`${Math.round((a.usedU / a.heightU) * 100)} % · größter freier Block ${a.largestFreeBlock}U`}</KV>
        <Bar value={a.usedU} max={a.heightU} warnAt={0.9} />
      </div>
      <div className="space-y-1">
        <KV label="Leistung (typ. / max.)">
          <span className="inline-flex items-center gap-1">
            <Zap className="size-3.5 text-warning" />
            {`${(a.powerTypicalW / 1000).toFixed(2)} kW / ${(a.powerMaxW / 1000).toFixed(2)} kW`}
          </span>
        </KV>
        <Bar value={a.powerMaxW} max={rack.maxPowerW} />
        <div className="text-[11px] text-muted-foreground">Verfügbar: {(rack.maxPowerW / 1000).toFixed(2)} kW{a.pduCapacityW ? ` · PDU ${(a.pduCapacityW / 1000).toFixed(2)} kW` : ''}</div>
      </div>
      <div className="space-y-1">
        <KV label="Gewicht">
          <span className="inline-flex items-center gap-1">
            <Weight className="size-3.5 text-muted-foreground" />
            {`${a.weightKg} kg`}
          </span>
        </KV>
        <Bar value={a.weightKg - rack.emptyWeightKg} max={rack.maxLoadKg} />
        <div className="text-[11px] text-muted-foreground">inkl. Rack ({rack.emptyWeightKg} kg) · Zuladung max. {rack.maxLoadKg} kg</div>
      </div>
      <KV label="Abwärme">
        <span className="inline-flex items-center gap-1">
          <Thermometer className="size-3.5 text-destructive" />
          {`${a.heatBtuH.toLocaleString('de-DE')} BTU/h`}
        </span>
      </KV>
      <KV label="Temperatur (geschätzt)">{`+${a.deltaTC} °C Abluft ggü. Zuluft`}</KV>
      <KV label="Energie / Jahr">{`${a.energyKWhYear.toLocaleString('de-DE')} kWh ≈ ${a.costYear.toLocaleString('de-DE')} €`}</KV>
      {a.ups.map((u) => (
        <div key={u.deviceId} className="space-y-1 rounded-md border p-2">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Battery className="size-4 text-success" /> {u.name}
          </div>
          <KV label="Last">{`${u.loadW} W von ${u.capacityW} W (${u.loadPct} %)`}</KV>
          <Bar value={u.loadW} max={u.capacityW} />
          <KV label="Überbrückung (geschätzt)">
            <span className="inline-flex items-center gap-1">
              <Gauge className="size-3.5" />
              {Number.isFinite(u.runtimeMin) ? `~${u.runtimeMin} min` : '–'}
            </span>
          </KV>
        </div>
      ))}
      {!a.ups.length && <div className="text-xs text-muted-foreground">Keine USV im Rack – Laufzeit kann nicht berechnet werden.</div>}
      {a.warnings.length > 0 && (
        <ul className="space-y-1">
          {a.warnings.map((w) => (
            <li key={w} className="flex gap-2 rounded-md bg-warning/15 px-2 py-1.5 text-xs">
              <TriangleAlert className="size-3.5 shrink-0" />
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function RackInspector({ id }: { id: Id }) {
  const rack = useProjectStore((s) => s.project.racks[id])
  if (!rack) return null
  const upd = (patch: Partial<Rack>, key: string) => updateRack(id, patch, `rack-${id}-${key}`)
  return (
    <div>
      <div className="flex items-center gap-2 border-b px-3 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">Rack</div>
          <div className="font-semibold">{rack.name}</div>
        </div>
        <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => deleteRack(id)} title="Rack löschen">
          <Trash2 />
        </Button>
      </div>
      <Section title="Rack-Analyse">
        <RackAnalysisPanel rack={rack} />
      </Section>
      <Section title="Eigenschaften">
        <Field label="Name">
          <TextField value={rack.name} onChange={(v) => upd({ name: v }, 'name')} />
        </Field>
        <Row>
          <Field label="Rackbreite" hint="10 Zoll = Mini-Rack">
            <SelectField<RackStandard>
              value={rackStandardOf(rack)}
              options={(['19', '10'] as const).map((v) => ({ value: v, label: RACK_STANDARD_LABEL[v] }))}
              onChange={(v) => upd({ standard: v }, 'std')}
            />
          </Field>
          <Field label="Höhe">
            <SelectField
              value={rack.heightU}
              options={[...new Set([...RACK_HEIGHTS, rack.heightU])].sort((a, b) => a - b).map((h) => ({ value: h, label: `${h} HE` }))}
              onChange={(v) => upd({ heightU: v }, 'h')}
            />
          </Field>
        </Row>
        <Row>
          <Field label="Tiefe (innen)">
            <NumberField value={rack.depthMm} unit="mm" min={100} max={1400} step={10} onChange={(v) => upd({ depthMm: v }, 'd')} />
          </Field>
          <Field label="Außenbreite">
            <NumberField value={rack.widthMm} unit="mm" min={100} max={1200} step={10} onChange={(v) => upd({ widthMm: v }, 'w')} />
          </Field>
        </Row>
        <Row>
          <Field label="Leergewicht" hint="leeres Rack">
            <NumberField value={rack.emptyWeightKg} unit="kg" min={0} step={0.1} onChange={(v) => upd({ emptyWeightKg: v }, 'empty')} />
          </Field>
          <Field label="Max. Zuladung" hint="alle Geräte zusammen">
            <NumberField value={rack.maxLoadKg} unit="kg" min={1} onChange={(v) => upd({ maxLoadKg: v }, 'load')} />
          </Field>
        </Row>
        <Row>
          <Field label="Verfügbare Leistung" hint="Schuko 16 A ≈ 3680 W">
            <NumberField value={rack.maxPowerW} unit="W" min={100} step={100} onChange={(v) => upd({ maxPowerW: v }, 'pw')} />
          </Field>
          <Field label="Luftstrom">
            <NumberField value={rack.airflowM3h} unit="m³/h" min={0} step={50} onChange={(v) => upd({ airflowM3h: v }, 'air')} />
          </Field>
        </Row>
        <Field label="Standort">
          <TextField value={rack.location} placeholder="Keller" onChange={(v) => upd({ location: v }, 'loc')} />
        </Field>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Button size="sm" variant="outline" onClick={() => fillWithBlanks(id)}>
            Leere HE mit Blindblenden füllen
          </Button>
          <Button size="sm" variant="ghost" onClick={() => removeBlanks(id)}>
            Blindblenden entfernen
          </Button>
        </div>
      </Section>
      <Section title="Notizen" defaultOpen={!!rack.notes}>
        <TextAreaField value={rack.notes} onChange={(v) => upd({ notes: v }, 'notes')} />
      </Section>
    </div>
  )
}
