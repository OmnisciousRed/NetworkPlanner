import type { ChassisParams, Device, MainboardFormFactor, RackStandard } from '@/models'
import { DEVICE_HEIGHTS_U, INNER_MM } from '@/models'
import { updateChassisParams } from '@/store/actions/hardware'
import { Field, NumberField, Row, Section, SelectField, SwitchField, TextField } from './fields'
import { cn } from '@/lib/utils'

const FFS: MainboardFormFactor[] = ['Mini-ITX', 'mATX', 'ATX', 'E-ATX', 'SSI-EEB']

export function ChassisParamsForm({ params, onChange }: { params: ChassisParams; onChange: (patch: Partial<ChassisParams>) => void }) {
  const rack = params.formFactor === 'rack'
  const enclosure = !!params.driveEnclosure
  return (
    <div className="space-y-2.5">
      <SwitchField
        label="Nur Festplattengehäuse (ohne Mainboard)"
        hint="z. B. HDD-Einschub oder JBOD – die Laufwerke werden per Kabel mit einem Server verbunden"
        checked={enclosure}
        onChange={(v) =>
          onChange(
            v
              ? { driveEnclosure: true, psuBays: 0, expansionSlots: 0, bays35: Math.max(params.bays35, 4) }
              : { driveEnclosure: false, psuBays: Math.max(1, params.psuBays), mainboardFormFactors: params.mainboardFormFactors.length ? params.mainboardFormFactors : ['Mini-ITX', 'mATX', 'ATX'] },
          )
        }
      />
      <Row>
        <Field label="Bauform">
          <SelectField
            value={params.formFactor}
            options={[
              { value: 'rack', label: 'Rack' },
              { value: 'tower', label: 'Tower' },
            ]}
            onChange={(v) => onChange({ formFactor: v, heightU: v === 'rack' ? params.heightU || 2 : 0 })}
          />
        </Field>
        {rack ? (
          <Field label="Höhe">
            <SelectField value={params.heightU} options={DEVICE_HEIGHTS_U.map((u) => ({ value: u, label: `${u}U` }))} onChange={(v) => onChange({ heightU: v, heightMm: Math.round(v * 44.45 - 1) })} />
          </Field>
        ) : (
          <Field label="Höhe">
            <NumberField value={params.heightMm} unit="mm" min={200} max={800} onChange={(v) => onChange({ heightMm: v })} />
          </Field>
        )}
      </Row>
      {rack && (
        <Field label="Rackbreite" hint={params.rackStandard === '10' ? 'passt in 10"- und (mit Adapter) in 19"-Racks' : 'passt nur in 19"-Racks'}>
          <SelectField<RackStandard>
            value={params.rackStandard ?? '19'}
            options={[
              { value: '19', label: '19 Zoll (Standard-Server)' },
              { value: '10', label: '10 Zoll (Mini-Rack)' },
            ]}
            onChange={(v) =>
              onChange(
                v === '10'
                  ? { rackStandard: v, widthMm: Math.min(params.widthMm, INNER_MM['10']), depthMm: Math.min(params.depthMm, 300) }
                  : { rackStandard: v, widthMm: Math.max(params.widthMm, 430) },
              )
            }
          />
        </Field>
      )}
      <Row>
        <Field label="Breite">
          <NumberField value={params.widthMm} unit="mm" min={100} max={rack ? INNER_MM[params.rackStandard ?? '19'] : 600} onChange={(v) => onChange({ widthMm: v })} />
        </Field>
        <Field label="Tiefe">
          <NumberField value={params.depthMm} unit="mm" min={150} max={1200} onChange={(v) => onChange({ depthMm: v })} />
        </Field>
      </Row>
      <Row className="grid-cols-3">
        <Field label='3.5"-Schächte'>
          <NumberField value={params.bays35} min={0} max={36} onChange={(v) => onChange({ bays35: v })} />
        </Field>
        <Field label='2.5"-Schächte'>
          <NumberField value={params.bays25} min={0} max={48} onChange={(v) => onChange({ bays25: v, nvmeBays: Math.min(params.nvmeBays, v) })} />
        </Field>
        <Field label="davon NVMe">
          <NumberField value={params.nvmeBays} min={0} max={params.bays25} onChange={(v) => onChange({ nvmeBays: v })} />
        </Field>
      </Row>
      <Row className="grid-cols-3">
        <Field label="Netzteile">
          <NumberField value={params.psuBays} min={enclosure ? 0 : 1} max={4} onChange={(v) => onChange({ psuBays: v })} />
        </Field>
        <Field label="Lüfter">
          <NumberField value={params.fanSlots} min={0} max={12} onChange={(v) => onChange({ fanSlots: v })} />
        </Field>
        <Field label="Lüftergröße">
          <SelectField value={params.fanSizeMm} options={[40, 60, 80, 92, 120, 140].map((x) => ({ value: x, label: `${x}` }))} onChange={(v) => onChange({ fanSizeMm: v })} />
        </Field>
      </Row>
      {!enclosure && (
        <>
          <Field label="Mainboard-Formfaktoren">
            <div className="flex flex-wrap gap-1">
              {FFS.map((f) => {
                const on = params.mainboardFormFactors.includes(f)
                return (
                  <button
                    key={f}
                    type="button"
                    className={cn('cursor-pointer rounded border px-1.5 py-0.5 text-xs', on ? 'border-primary bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent')}
                    onClick={() => {
                      const next = on ? params.mainboardFormFactors.filter((x) => x !== f) : [...params.mainboardFormFactors, f]
                      if (next.length) onChange({ mainboardFormFactors: next })
                    }}
                  >
                    {f}
                  </button>
                )
              })}
            </div>
          </Field>
          <Row>
            <Field label="Kartenhöhe">
              <SelectField
                value={params.maxCardHeight}
                options={[
                  { value: 'full', label: 'Full Height' },
                  { value: 'low-profile', label: 'nur Low Profile' },
                ]}
                onChange={(v) => onChange({ maxCardHeight: v })}
              />
            </Field>
            <Field label="Max. Kartenlänge">
              <NumberField value={params.maxCardLengthMm} unit="mm" min={100} max={400} onChange={(v) => onChange({ maxCardLengthMm: v })} />
            </Field>
          </Row>
          <Row>
            <Field label="Erweiterungsslots">
              <NumberField value={params.expansionSlots} min={0} max={11} onChange={(v) => onChange({ expansionSlots: v })} />
            </Field>
            <Field label="Max. CPU-TDP">
              <NumberField value={params.maxCpuTdpW} unit="W" min={35} max={600} onChange={(v) => onChange({ maxCpuTdpW: v })} />
            </Field>
          </Row>
        </>
      )}
      <Row>
        <Field label="Leergewicht">
          <NumberField value={params.weightKg} unit="kg" step={0.5} min={0.5} onChange={(v) => onChange({ weightKg: v })} />
        </Field>
        <div className="flex items-end pb-1.5">
          <SwitchField label="Hot-Swap" checked={params.hotSwap} onChange={(v) => onChange({ hotSwap: v })} />
        </div>
      </Row>
    </div>
  )
}

export function ChassisSection({ device }: { device: Device }) {
  const chassis = device.build!.chassis
  return (
    <Section title="Gehäuse" defaultOpen={false}>
      <Field label="Bezeichnung">
        <TextField value={chassis.name} onChange={(v) => updateChassisParams(device.id, {}, v)} />
      </Field>
      <ChassisParamsForm params={chassis.params} onChange={(patch) => updateChassisParams(device.id, patch)} />
    </Section>
  )
}
