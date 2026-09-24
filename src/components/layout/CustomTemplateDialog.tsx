import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { ComponentKind, ComponentTemplate, DeviceKind, DeviceTemplate, MainboardSpecs, PortGroupSpec, RackStandard } from '@/models'
import { CONNECTORS, DEVICE_HEIGHTS_U, INNER_MM, SPEED_OPTIONS, formatSpeed, uid } from '@/models'
import { COMPONENT_CATALOG } from '@/data/componentCatalog'
import { DEVICE_KINDS } from '@/data/deviceKinds'
import { useUiStore, toast } from '@/store/uiStore'
import { addCustomComponentTemplate, addCustomDeviceTemplate } from '@/store/actions/project'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Field, NumberField, Row, SelectField, SwitchField, TextField } from '@/components/inspector/fields'
import { SPEC_FIELDS } from '@/components/inspector/specFields'
import { COMPONENT_KIND_LABELS } from '@/components/icons'
import { cpuSizeForSocket, pcieCardSize, storageNaturalSize } from '@/utils/generators'

const KINDS: ComponentKind[] = ['cpu', 'ram', 'storage', 'nic', 'gpu', 'hba', 'raid', 'pcie', 'psu', 'fan', 'bbu', 'custom']

function baseSpecs(kind: ComponentKind): Record<string, unknown> {
  if (kind === 'custom') return { category: 'Sonstiges', description: '' }
  const t = COMPONENT_CATALOG.find((x) => x.kind === kind)
  return structuredClone((t?.specs ?? {}) as Record<string, unknown>)
}

function SpecForm({ kind, specs, onChange }: { kind: ComponentKind; specs: Record<string, unknown>; onChange: (s: Record<string, unknown>) => void }) {
  const set = (k: string, v: unknown) => onChange({ ...specs, [k]: v })
  return (
    <div className="grid grid-cols-2 gap-2">
      {SPEC_FIELDS[kind].map((f) => {
        const v = specs[f.key]
        if (f.type === 'bool') return <div key={f.key} className="flex items-end pb-1"><SwitchField label={f.label} checked={!!v} onChange={(x) => set(f.key, x)} /></div>
        if (f.type === 'list')
          return (
            <Field key={f.key} label={f.label} className="col-span-2">
              <TextField value={((v as string[]) ?? []).join(', ')} onChange={(x) => set(f.key, x.split(/[,\s]+/).filter(Boolean))} />
            </Field>
          )
        return (
          <Field key={f.key} label={f.label}>
            {f.type === 'number' ? (
              <NumberField value={v as number} unit={f.unit} min={f.min} max={f.max} step={f.step} onChange={(x) => set(f.key, x)} />
            ) : f.type === 'select' ? (
              <SelectField value={v as string | number} options={f.options} onChange={(x) => set(f.key, x)} />
            ) : (
              <TextField value={(v as string) ?? ''} onChange={(x) => set(f.key, x)} />
            )}
          </Field>
        )
      })}
    </div>
  )
}

export function CustomTemplateDialog() {
  const open = useUiStore((s) => s.dialogs.customComponent)
  const openDialog = useUiStore((s) => s.openDialog)
  const initialTab = useUiStore((s) => s.customDialogTab)
  const [tab, setTab] = useState<string>(initialTab)
  useEffect(() => {
    if (open) setTab(initialTab)
  }, [open, initialTab])

  // component
  const [kind, setKind] = useState<ComponentKind>('custom')
  const [cName, setCName] = useState('Meine Komponente')
  const [cMf, setCMf] = useState('')
  const [cPower, setCPower] = useState(10)
  const [cWeight, setCWeight] = useState(0.2)
  const [cSize, setCSize] = useState({ w: 120, h: 60 })
  const [specs, setSpecs] = useState<Record<string, unknown>>(baseSpecs('custom'))

  // mainboard
  const [mbName, setMbName] = useState('Eigenes Mainboard')
  const [mb, setMb] = useState({ socket: 'AM5', sockets: 1, memoryType: 'DDR5' as MainboardSpecs['memoryType'], dimms: 4, module: 'UDIMM' as MainboardSpecs['memoryModule'], ff: 'ATX' as MainboardSpecs['formFactor'], x16: 2, x8: 0, x4: 1, x1: 0, gen: 4, m2: 3, sata: 4, nics: 1, nicSpeed: 2500, ipmi: false, ecc: false })

  // device
  const [dName, setDName] = useState('Mein Gerät')
  const [dKind, setDKind] = useState<DeviceKind>('server')
  const [dFf, setDFf] = useState<DeviceTemplate['formFactor']>('rack')
  const [dU, setDU] = useState(2)
  const [dStd, setDStd] = useState<RackStandard>('19')
  /** rack height of a desktop device standing on a shelf (0 = not for the rack) */
  const [dShelfU, setDShelfU] = useState(0)
  const [dBays, setDBays] = useState(4)
  const [dWidth, setDWidth] = useState(200)
  const [dDepth, setDDepth] = useState(600)
  const [dPower, setDPower] = useState(150)
  const [dWeight, setDWeight] = useState(12)
  const [groups, setGroups] = useState<PortGroupSpec[]>([
    { count: 2, speed: 10000, connector: 'SFP+', namePrefix: 'SFP+ ' },
    { count: 2, speed: 1000, connector: 'RJ45', namePrefix: 'LAN ' },
  ])

  const close = () => openDialog('customComponent', false)

  const createComponent = () => {
    const size =
      kind === 'cpu'
        ? cpuSizeForSocket(String(specs.socket))
        : kind === 'storage'
          ? storageNaturalSize(specs.formFactor as never)
          : ['nic', 'gpu', 'hba', 'raid', 'pcie'].includes(kind)
            ? pcieCardSize(Number(specs.lengthMm) || 150, !!specs.lowProfile)
            : kind === 'ram'
              ? { w: 133, h: 31 }
              : kind === 'fan'
                ? { w: Number(specs.sizeMm) || 80, h: Number(specs.sizeMm) || 80 }
                : kind === 'psu'
                  ? specs.formFactor === 'ATX' || specs.formFactor === 'SFX' ? { w: 150, h: 86 } : { w: 185, h: 73 }
                  : cSize
    const t = {
      id: uid('ctpl'),
      kind,
      group: 'Eigene',
      subgroup: COMPONENT_KIND_LABELS[kind],
      name: cName,
      manufacturer: cMf || undefined,
      powerW: kind === 'cpu' ? Number(specs.tdpW) || cPower : cPower,
      weightKg: cWeight,
      size,
      specs,
      resizable: kind === 'custom',
      custom: true,
    } as unknown as ComponentTemplate
    addCustomComponentTemplate(t)
    toast(`„${cName}“ in der Bibliothek unter „Eigene“ verfügbar`, 'success')
    close()
  }

  const createMainboard = () => {
    const pcie: MainboardSpecs['pcieSlots'] = [
      ...Array.from({ length: mb.x16 }, (_, i) => ({ physical: 16 as const, lanes: 16 as const, gen: mb.gen, cpu: mb.sockets > 1 ? i % 2 : 0 })),
      ...Array.from({ length: mb.x8 }, () => ({ physical: 8 as const, lanes: 8 as const, gen: mb.gen })),
      ...Array.from({ length: mb.x4 }, () => ({ physical: 4 as const, lanes: 4 as const, gen: mb.gen })),
      ...Array.from({ length: mb.x1 }, () => ({ physical: 1 as const, lanes: 1 as const, gen: mb.gen })),
    ]
    const t: ComponentTemplate = {
      id: uid('ctpl'),
      kind: 'mainboard',
      group: 'Eigene',
      subgroup: 'Mainboard',
      name: mbName,
      powerW: 25,
      weightKg: 1,
      custom: true,
      specs: {
        formFactor: mb.ff,
        socket: mb.socket,
        sockets: mb.sockets,
        memoryType: mb.memoryType,
        dimmsPerCpu: mb.dimms,
        memoryModule: mb.module,
        eccSupport: mb.ecc,
        maxMemoryGB: mb.dimms * mb.sockets * 64,
        pcieSlots: pcie,
        m2Slots: Array.from({ length: mb.m2 }, () => ({ maxLength: 80, interfaces: ['NVMe'], pcieGen: mb.gen })),
        sataPorts: mb.sata,
        onboardNics: [
          ...Array.from({ length: mb.nics }, (_, i) => ({ name: `LAN ${i + 1}`, speed: mb.nicSpeed, connector: 'RJ45' as const })),
          ...(mb.ipmi ? [{ name: 'IPMI', speed: 1000, connector: 'RJ45' as const, role: 'management' as const }] : []),
        ],
        ipmi: mb.ipmi,
      },
    }
    addCustomComponentTemplate(t)
    toast(`Mainboard „${mbName}“ angelegt – Slots wurden automatisch generiert`, 'success')
    close()
  }

  const hasBays = dKind === 'nas' || dKind === 'storage'
  const createDevice = () => {
    const t: DeviceTemplate = {
      id: uid('dtpl'),
      kind: dKind,
      name: dName,
      group: 'EIGENE',
      formFactor: dFf,
      rackStandard: dFf === 'rack' ? dStd : undefined,
      heightU: dFf === 'rack' ? dU : dShelfU || undefined,
      widthMm: dFf === 'rack' ? undefined : dWidth,
      depthMm: dDepth,
      weightKg: dWeight,
      powerW: dPower,
      driveBays: hasBays ? dBays : undefined,
      ports: groups,
      custom: true,
    }
    addCustomDeviceTemplate(t)
    toast(`Gerät „${dName}“ in Netzwerk- und Rack-Bibliothek verfügbar`, 'success')
    close()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => openDialog('customComponent', o)}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>+ Eigene Komponente</DialogTitle>
          <DialogDescription>Eigene Bauteile, Mainboards und Geräte definieren – sie erscheinen danach in den Bibliotheken unter „Eigene“.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="component">Bauteil</TabsTrigger>
            <TabsTrigger value="mainboard">Mainboard</TabsTrigger>
            <TabsTrigger value="device">Gerät</TabsTrigger>
          </TabsList>
          <TabsContent value="component" className="mt-3 space-y-3">
            <Row className="grid-cols-3">
              <Field label="Art">
                <SelectField
                  value={kind}
                  options={KINDS.map((k) => ({ value: k, label: COMPONENT_KIND_LABELS[k] }))}
                  onChange={(k) => {
                    setKind(k)
                    setSpecs(baseSpecs(k))
                  }}
                />
              </Field>
              <Field label="Name">
                <TextField value={cName} onChange={setCName} />
              </Field>
              <Field label="Hersteller">
                <TextField value={cMf} onChange={setCMf} />
              </Field>
            </Row>
            <Row className="grid-cols-4">
              <Field label="Leistung">
                <NumberField value={cPower} unit="W" min={0} onChange={setCPower} />
              </Field>
              <Field label="Gewicht">
                <NumberField value={cWeight} unit="kg" step={0.05} min={0} onChange={setCWeight} />
              </Field>
              {kind === 'custom' && (
                <>
                  <Field label="Breite (Grafik)">
                    <NumberField value={cSize.w} unit="mm" min={10} onChange={(w) => setCSize({ ...cSize, w })} />
                  </Field>
                  <Field label="Höhe (Grafik)">
                    <NumberField value={cSize.h} unit="mm" min={6} onChange={(h) => setCSize({ ...cSize, h })} />
                  </Field>
                </>
              )}
            </Row>
            <SpecForm kind={kind} specs={specs} onChange={setSpecs} />
            <DialogFooter>
              <Button onClick={createComponent}>Bauteil anlegen</Button>
            </DialogFooter>
          </TabsContent>
          <TabsContent value="mainboard" className="mt-3 space-y-3">
            <Row className="grid-cols-3">
              <Field label="Name">
                <TextField value={mbName} onChange={setMbName} />
              </Field>
              <Field label="CPU-Sockel">
                <SelectField value={mb.socket} options={['LGA4677', 'LGA4189', 'SP5', 'SP3', 'LGA1700', 'LGA1851', 'LGA1200', 'AM5', 'AM4']} onChange={(v) => setMb({ ...mb, socket: v })} />
              </Field>
              <Field label="Formfaktor">
                <SelectField value={mb.ff} options={['Mini-ITX', 'mATX', 'ATX', 'E-ATX', 'SSI-EEB'] as const} onChange={(v) => setMb({ ...mb, ff: v })} />
              </Field>
            </Row>
            <Row className="grid-cols-4">
              <Field label="Sockel">
                <SelectField value={mb.sockets} options={[1, 2]} onChange={(v) => setMb({ ...mb, sockets: v })} />
              </Field>
              <Field label="RAM-Slots je CPU">
                <NumberField value={mb.dimms} min={1} max={16} onChange={(v) => setMb({ ...mb, dimms: v })} />
              </Field>
              <Field label="Speichertyp">
                <SelectField value={mb.memoryType} options={['DDR4', 'DDR5'] as const} onChange={(v) => setMb({ ...mb, memoryType: v })} />
              </Field>
              <Field label="Modultyp">
                <SelectField value={mb.module} options={['UDIMM', 'RDIMM'] as const} onChange={(v) => setMb({ ...mb, module: v })} />
              </Field>
            </Row>
            <Row className="grid-cols-5">
              <Field label="PCIe x16">
                <NumberField value={mb.x16} min={0} max={8} onChange={(v) => setMb({ ...mb, x16: v })} />
              </Field>
              <Field label="PCIe x8">
                <NumberField value={mb.x8} min={0} max={8} onChange={(v) => setMb({ ...mb, x8: v })} />
              </Field>
              <Field label="PCIe x4">
                <NumberField value={mb.x4} min={0} max={8} onChange={(v) => setMb({ ...mb, x4: v })} />
              </Field>
              <Field label="PCIe x1">
                <NumberField value={mb.x1} min={0} max={8} onChange={(v) => setMb({ ...mb, x1: v })} />
              </Field>
              <Field label="PCIe-Gen">
                <SelectField value={mb.gen} options={[3, 4, 5]} onChange={(v) => setMb({ ...mb, gen: v })} />
              </Field>
            </Row>
            <Row className="grid-cols-4">
              <Field label="M.2-Slots">
                <NumberField value={mb.m2} min={0} max={6} onChange={(v) => setMb({ ...mb, m2: v })} />
              </Field>
              <Field label="SATA-Ports">
                <NumberField value={mb.sata} min={0} max={16} onChange={(v) => setMb({ ...mb, sata: v })} />
              </Field>
              <Field label="Onboard-LAN">
                <NumberField value={mb.nics} min={0} max={4} onChange={(v) => setMb({ ...mb, nics: v })} />
              </Field>
              <Field label="LAN-Speed">
                <SelectField value={mb.nicSpeed} options={SPEED_OPTIONS.slice(0, 5).map((s) => ({ value: s, label: formatSpeed(s) }))} onChange={(v) => setMb({ ...mb, nicSpeed: v })} />
              </Field>
            </Row>
            <div className="flex gap-6">
              <SwitchField label="IPMI / BMC" checked={mb.ipmi} onChange={(v) => setMb({ ...mb, ipmi: v })} />
              <SwitchField label="ECC" checked={mb.ecc} onChange={(v) => setMb({ ...mb, ecc: v })} />
            </div>
            <DialogFooter>
              <Button onClick={createMainboard}>Mainboard anlegen</Button>
            </DialogFooter>
          </TabsContent>
          <TabsContent value="device" className="mt-3 space-y-3">
            <Row className="grid-cols-3">
              <Field label="Name">
                <TextField value={dName} onChange={setDName} />
              </Field>
              <Field label="Kategorie / Typ">
                <SelectField value={dKind} options={Object.entries(DEVICE_KINDS).map(([k, v]) => ({ value: k as DeviceKind, label: v.label }))} onChange={setDKind} />
              </Field>
              <Field label="Bauform">
                <SelectField
                  value={dFf}
                  options={[
                    { value: 'rack', label: 'Rack' },
                    { value: 'desktop', label: 'Desktop' },
                    { value: 'tower', label: 'Tower' },
                    { value: 'wall', label: 'Wand/Decke' },
                    { value: 'portable', label: 'Mobil' },
                    { value: 'virtual', label: 'Virtuell' },
                  ]}
                  onChange={(v) => setDFf(v as DeviceTemplate['formFactor'])}
                />
              </Field>
            </Row>
            <Row className="grid-cols-5">
              {dFf === 'rack' ? (
                <>
                  <Field label="Rackbreite">
                    <SelectField<RackStandard>
                      value={dStd}
                      options={[
                        { value: '19', label: '19 Zoll' },
                        { value: '10', label: '10 Zoll' },
                      ]}
                      onChange={(v) => {
                        setDStd(v)
                        if (v === '10' && dDepth > 300) setDDepth(250)
                      }}
                    />
                  </Field>
                  <Field label="Höhe">
                    <SelectField value={dU} options={DEVICE_HEIGHTS_U.map((u) => ({ value: u, label: `${u} HE` }))} onChange={setDU} />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Breite">
                    <NumberField value={dWidth} unit="mm" min={20} onChange={setDWidth} />
                  </Field>
                  <Field label="Im Rack (Boden)">
                    <SelectField
                      value={dShelfU}
                      options={[{ value: 0, label: '– nein –' }, ...DEVICE_HEIGHTS_U.map((u) => ({ value: u, label: `${u} HE` }))]}
                      onChange={setDShelfU}
                    />
                  </Field>
                </>
              )}
              <Field label="Tiefe">
                <NumberField value={dDepth} unit="mm" min={20} onChange={setDDepth} />
              </Field>
              <Field label="Leistung">
                <NumberField value={dPower} unit="W" min={0} onChange={setDPower} />
              </Field>
              <Field label="Gewicht">
                <NumberField value={dWeight} unit="kg" min={0} step={0.1} onChange={setDWeight} />
              </Field>
            </Row>
            <div className="text-xs text-muted-foreground">
              {dFf === 'rack'
                ? dStd === '10'
                  ? 'Passt in 10-Zoll-Racks (z. B. DeskPi RackMate) und mit Adapter in 19-Zoll-Racks.'
                  : 'Passt nur in 19-Zoll-Racks.'
                : dShelfU
                  ? `Steht im Rack auf einem Einlegeboden und belegt ${dShelfU} HE${dWidth > INNER_MM['10'] ? ' – zu breit für 10-Zoll-Racks' : ''}.`
                  : 'Wird nicht ins Rack gestellt. Für ein Rack „Im Rack (Boden)“ wählen.'}
            </div>
            {hasBays && (
              <Row className="grid-cols-5">
                <Field label="Laufwerksschächte">
                  <NumberField value={dBays} min={0} max={60} onChange={setDBays} />
                </Field>
              </Row>
            )}
            <div>
              <div className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
                Ports
                <Button size="xs" variant="ghost" onClick={() => setGroups([...groups, { count: 1, speed: 1000, connector: 'RJ45', namePrefix: 'Port ' }])}>
                  <Plus /> Portgruppe
                </Button>
              </div>
              {groups.map((g, i) => (
                <div key={i} className="mb-1 flex items-center gap-1.5">
                  <NumberField className="w-20" value={g.count} min={1} max={96} onChange={(v) => setGroups(groups.map((x, k) => (k === i ? { ...x, count: v } : x)))} />
                  <span className="text-xs text-muted-foreground">×</span>
                  <SelectField className="w-24" value={g.speed} options={SPEED_OPTIONS.map((s) => ({ value: s, label: formatSpeed(s) }))} onChange={(v) => setGroups(groups.map((x, k) => (k === i ? { ...x, speed: v } : x)))} />
                  <SelectField className="w-28" value={g.connector} options={CONNECTORS} onChange={(v) => setGroups(groups.map((x, k) => (k === i ? { ...x, connector: v } : x)))} />
                  <TextField className="w-28" value={g.namePrefix} onChange={(v) => setGroups(groups.map((x, k) => (k === i ? { ...x, namePrefix: v } : x)))} placeholder="Präfix" />
                  <Button size="icon-xs" variant="ghost" onClick={() => setGroups(groups.filter((_, k) => k !== i))}>
                    <X />
                  </Button>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button onClick={createDevice}>Gerät anlegen</Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
