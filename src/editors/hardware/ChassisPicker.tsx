import { useMemo, useState } from 'react'
import { Check, Server } from 'lucide-react'
import type { ChassisParams, ChassisTemplate, DeviceKind } from '@/models'
import { uid } from '@/models'
import { CHASSIS_CATALOG, DEFAULT_RACK_PARAMS } from '@/data/chassisCatalog'
import { BUILDABLE_KINDS, DEVICE_KINDS } from '@/data/deviceKinds'
import { useProjectStore } from '@/store/projectStore'
import { useUiStore } from '@/store/uiStore'
import { createBuiltDeviceAction, nextDeviceName } from '@/store/actions/devices'
import { addComponentFromTemplate } from '@/store/actions/hardware'
import { addCustomChassisTemplate } from '@/store/actions/project'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, SwitchField, TextField, SelectField } from '@/components/inspector/fields'
import { ChassisParamsForm } from '@/components/inspector/ChassisSection'
import { DeviceIcon } from '@/components/icons'
import { cn } from '@/lib/utils'

function ChassisThumb({ params }: { params: ChassisParams }) {
  if (params.formFactor === 'tower')
    return (
      <svg viewBox="0 0 60 90" className="h-20">
        <rect x={10} y={4} width={40} height={82} rx={4} fill="#2b3037" stroke="#11151a" />
        <rect x={16} y={20} width={28} height={58} rx={2} fill="url(#np-vent)" opacity={0.7} />
        <circle cx={30} cy={12} r={3} fill="#111" stroke="#6b7280" />
        <circle cx={30} cy={12} r={1} fill="#22c55e" />
      </svg>
    )
  const u = params.heightU
  const h = u * 14
  const bays = params.bays35 + params.bays25
  const cols = params.bays35 ? 4 : Math.min(24, params.bays25)
  const rows = Math.max(1, Math.ceil(bays / cols))
  return (
    <svg viewBox={`0 0 120 ${Math.max(h, 20) + 8}`} className="h-20 w-full">
      <rect x={2} y={4} width={116} height={h} rx={2} fill="#2b3037" stroke="#11151a" />
      <rect x={2} y={4} width={5} height={h} fill="#4b5563" />
      <rect x={113} y={4} width={5} height={h} fill="#4b5563" />
      {Array.from({ length: bays }, (_, i) => {
        const bw = (88 / cols) - 1
        const bh = (h - 4) / rows - 1
        return <rect key={i} x={10 + (i % cols) * (bw + 1)} y={6 + Math.floor(i / cols) * (bh + 1)} width={bw} height={bh} rx={0.5} fill="#4b5563" />
      })}
      <circle cx={106} cy={4 + h / 2} r={2} fill="#22c55e" />
    </svg>
  )
}

export function ChassisPickerPanel({ onDone, compact }: { onDone?: () => void; compact?: boolean }) {
  const customChassis = useProjectStore((s) => s.project.customTemplates.chassis)
  const set = useUiStore((s) => s.set)
  const [kind, setKind] = useState<DeviceKind>('server')
  const [name, setName] = useState('')
  const [choice, setChoice] = useState<string>('ch-2u')
  const [customParams, setCustomParams] = useState<ChassisParams>({ ...DEFAULT_RACK_PARAMS, bays35: 8, bays25: 4 })
  const [customName, setCustomName] = useState('Eigenes Gehäuse')
  const [saveTemplate, setSaveTemplate] = useState(false)
  const [basics, setBasics] = useState(true)
  const templates: (ChassisTemplate | { id: 'custom'; name: string; description: string; params: ChassisParams })[] = useMemo(
    () => [...CHASSIS_CATALOG, ...customChassis, { id: 'custom', name: 'Custom', description: 'Eigene Maße, Schächte und Lüfter festlegen.', params: customParams }],
    [customChassis, customParams],
  )
  const selected = templates.find((t) => t.id === choice) ?? templates[0]

  const create = () => {
    const isCustom = selected.id === 'custom'
    const params = isCustom ? customParams : selected.params
    const chassisName = isCustom ? customName : selected.name
    if (isCustom && saveTemplate) addCustomChassisTemplate({ id: uid('chs'), name: customName, description: 'Eigenes Gehäuse', params })
    const id = createBuiltDeviceAction(kind, name.trim() || nextDeviceName(kind), chassisName, params, isCustom ? undefined : selected.id)
    if (basics) {
      const rack = params.formFactor === 'rack'
      const psu = rack ? (params.heightU >= 2 ? 'psu-crps-1600' : 'psu-crps-800') : 'psu-atx-850'
      const fan = rack ? (params.fanSizeMm >= 80 ? 'fan-80' : params.fanSizeMm >= 60 ? 'fan-60' : 'fan-40') : 'fan-120'
      for (let i = 0; i < (rack ? params.psuBays : 1); i++) addComponentFromTemplate(id, psu, { auto: true })
      for (let i = 0; i < params.fanSlots; i++) addComponentFromTemplate(id, fan, { auto: true })
    }
    set({ hardwareDeviceId: id, view: 'hardware', hardwareView: 'interior', selection: null })
    onDone?.()
  }

  return (
    <div className="space-y-4">
      <div className={cn('grid gap-3', compact ? 'grid-cols-1' : 'grid-cols-[1fr_1fr]')}>
        <Field label="Gerätetyp">
          <SelectField value={kind} options={BUILDABLE_KINDS.map((k) => ({ value: k, label: DEVICE_KINDS[k].label }))} onChange={setKind} />
        </Field>
        <Field label="Name">
          <TextField value={name} placeholder={nextDeviceName(kind)} onChange={setName} data-testid="new-device-name" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setChoice(t.id)}
            data-testid={`chassis-${t.id}`}
            className={cn(
              'relative flex cursor-pointer flex-col items-center gap-1 rounded-lg border bg-card p-2 text-center transition-colors hover:border-primary/60',
              choice === t.id && 'border-primary ring-2 ring-primary/30',
            )}
          >
            {choice === t.id && <Check className="absolute right-1.5 top-1.5 size-4 text-primary" />}
            <ChassisThumb params={t.params} />
            <div className="text-sm font-semibold">{t.id === 'custom' ? 'Custom' : t.name.replace(' Rack', ' Rack')}</div>
            <div className="line-clamp-2 text-[10px] leading-tight text-muted-foreground">{t.description}</div>
          </button>
        ))}
      </div>
      {selected.id === 'custom' && (
        <div className="rounded-lg border p-3">
          <Field label="Bezeichnung des Gehäuses">
            <TextField value={customName} onChange={setCustomName} />
          </Field>
          <div className="mt-2.5">
            <ChassisParamsForm params={customParams} onChange={(p) => setCustomParams((c) => ({ ...c, ...p }))} />
          </div>
          <div className="mt-2.5">
            <SwitchField label="Als Vorlage speichern" checked={saveTemplate} onChange={setSaveTemplate} />
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SwitchField label="Grundausstattung einsetzen (Netzteile & Lüfter)" checked={basics} onChange={setBasics} />
        <Button onClick={create} data-testid="create-device">
          <DeviceIcon kind={kind} /> {DEVICE_KINDS[kind].label} erstellen
        </Button>
      </div>
    </div>
  )
}

export function ChassisPickerDialog() {
  const open = useUiStore((s) => s.dialogs.chassisPicker)
  const openDialog = useUiStore((s) => s.openDialog)
  return (
    <Dialog open={open} onOpenChange={(o) => openDialog('chassisPicker', o)}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="size-4" /> Neues Gerät bauen
          </DialogTitle>
          <DialogDescription>Gehäuse wählen – danach Mainboard, CPU, RAM, Laufwerke und Karten per Drag & Drop einsetzen.</DialogDescription>
        </DialogHeader>
        <ChassisPickerPanel onDone={() => openDialog('chassisPicker', false)} />
      </DialogContent>
    </Dialog>
  )
}
