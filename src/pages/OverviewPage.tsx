import { useMemo, useState } from 'react'
import {
  ArrowLeftRight,
  BookOpen,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Circle,
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  Plus,
  Server,
  TriangleAlert,
  Waypoints,
  Wrench,
  Zap,
} from 'lucide-react'
import type { Device, HardwareComponent, Project } from '@/models'
import { PANEL_MM, U_MM, rackStandardOf } from '@/models'
import { useProjectStore } from '@/store/projectStore'
import { useUiStore } from '@/store/uiStore'
import { openInHardware, openRack, openVlan, showConnection, showInNetwork, showInRack } from '@/store/navigation'
import { renameProject, updateProjectMeta, loadDemoProject } from '@/store/actions/project'
import { DEVICE_KINDS, CATEGORY_LABELS } from '@/data/deviceKinds'
import { DeviceIcon, ComponentIcon, COMPONENT_KIND_LABELS } from '@/components/icons'
import { HardwareDefs } from '@/components/hardware/graphics'
import { DeviceFaceplate, widthInRack } from '@/components/rack/Faceplate'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { analyzeBuild } from '@/utils/compatibility'
import { formatCapacity, summarizeBuild } from '@/utils/buildSummary'
import { collectIpam } from '@/utils/ip'
import { analyzeRack, devicesInRack } from '@/utils/rack'
import { connectionsOfDevice, findPort, getDeviceHeightU, getDevicePorts, getDevicePower } from '@/utils/device'
import { openHelp } from '@/store/navigation'
import { cn } from '@/lib/utils'

function Stat({ icon, label, value, sub, onClick }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-sm', onClick && 'cursor-pointer hover:border-primary/50')}>
      <div className="rounded-lg bg-primary/10 p-2 text-primary [&_svg]:size-5">{icon}</div>
      <div className="min-w-0">
        <div className="text-xl font-semibold leading-tight">{value}</div>
        <div className="truncate text-xs text-muted-foreground">
          {label}
          {sub ? <> · {sub}</> : null}
        </div>
      </div>
    </button>
  )
}

function TreeNode({ label, icon, children, count, onClick, defaultOpen = false, testId }: { label: React.ReactNode; icon?: React.ReactNode; children?: React.ReactNode; count?: number; onClick?: () => void; defaultOpen?: boolean; testId?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  const hasChildren = !!children
  return (
    <div>
      <div className="flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-accent" data-testid={testId}>
        <button type="button" className={cn('flex size-4 cursor-pointer items-center justify-center', !hasChildren && 'invisible')} onClick={() => setOpen((o) => !o)}>
          <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        </button>
        <button type="button" className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left text-sm" onClick={onClick ?? (() => setOpen((o) => !o))}>
          {icon && <span className="text-muted-foreground [&_svg]:size-3.5">{icon}</span>}
          <span className="truncate">{label}</span>
          {count !== undefined && <span className="ml-auto pl-2 text-xs text-muted-foreground">{count}</span>}
        </button>
      </div>
      {open && hasChildren && <div className="ml-3 border-l pl-2">{children}</div>}
    </div>
  )
}

function slotLabel(d: Device, c: HardwareComponent) {
  if (!c.mount) return 'lose'
  const b = d.build!
  if (c.mount.parentId === 'chassis') return b.chassis.slots.find((s) => s.id === c.mount!.slotId)?.label ?? ''
  return b.components.find((x) => x.id === c.mount!.parentId)?.slots?.find((s) => s.id === c.mount!.slotId)?.label ?? ''
}

function ProjectTree({ project }: { project: Project }) {
  const devices = Object.values(project.devices)
  const racks = Object.values(project.racks)
  const built = devices.filter((d) => d.build)
  const compGroups: [string, { d: Device; c: HardwareComponent }[]][] = (['cpu', 'ram', 'storage', 'nic', 'gpu', 'hba', 'psu'] as const).map((k) => [
    COMPONENT_KIND_LABELS[k],
    built.flatMap((d) => d.build!.components.filter((c) => c.kind === k).map((c) => ({ d, c }))),
  ])
  const byCat = Object.entries(CATEGORY_LABELS).map(([cat, label]) => [label, devices.filter((d) => DEVICE_KINDS[d.kind].category === cat)] as const)
  return (
    <div className="space-y-0.5" data-testid="project-tree">
      <TreeNode label="Racks" icon={<Server />} count={racks.length} defaultOpen>
        {racks.map((r) => (
          <TreeNode key={r.id} label={`${r.name} (${r.heightU}U)`} onClick={() => openRack(r.id)} count={devicesInRack(project, r.id).length}>
            {devicesInRack(project, r.id).map((d) => (
              <TreeNode key={d.id} label={`U${d.rackPlacement!.positionU} · ${d.name}`} icon={<DeviceIcon kind={d.kind} />} onClick={() => showInRack(d.id)} />
            ))}
          </TreeNode>
        ))}
      </TreeNode>
      <TreeNode label="Geräte" icon={<Boxes />} count={devices.length} defaultOpen>
        {byCat
          .filter(([, ds]) => ds.length)
          .map(([label, ds]) => (
            <TreeNode key={label} label={label} count={ds.length} defaultOpen={label === 'Server'}>
              {ds.map((d) =>
                d.build ? (
                  <TreeNode key={d.id} label={d.name} icon={<DeviceIcon kind={d.kind} />} onClick={() => openInHardware(d.id)} count={d.build.components.length} testId={`tree-${d.name}`}>
                    {d.build.components.map((c) => (
                      <TreeNode key={c.id} label={`${c.name}`} icon={<ComponentIcon kind={c.kind} />} onClick={() => openInHardware(d.id, c.id)} />
                    ))}
                  </TreeNode>
                ) : (
                  <TreeNode key={d.id} label={d.name} icon={<DeviceIcon kind={d.kind} />} onClick={() => (d.rackPlacement ? showInRack(d.id) : showInNetwork(d.id))} />
                ),
              )}
            </TreeNode>
          ))}
      </TreeNode>
      <TreeNode label="Komponenten" icon={<Cpu />} count={built.reduce((s, d) => s + d.build!.components.length, 0)}>
        {compGroups
          .filter(([, xs]) => xs.length)
          .map(([label, xs]) => (
            <TreeNode key={label} label={label} count={xs.length}>
              {xs.map(({ d, c }) => (
                <TreeNode key={c.id} label={`${c.name} · ${d.name} · ${slotLabel(d, c)}`} icon={<ComponentIcon kind={c.kind} />} onClick={() => openInHardware(d.id, c.id)} />
              ))}
            </TreeNode>
          ))}
      </TreeNode>
      <TreeNode label="Netzwerke" icon={<Waypoints />} count={Object.keys(project.vlans).length} defaultOpen>
        {Object.values(project.vlans)
          .sort((a, b) => a.tag - b.tag)
          .map((v) => (
            <TreeNode
              key={v.id}
              label={
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm" style={{ background: v.color }} /> VLAN {v.tag} {v.name}
                  <span className="font-mono text-xs text-muted-foreground">{v.subnet}</span>
                </span>
              }
              onClick={() => openVlan(v.id)}
            />
          ))}
      </TreeNode>
      <TreeNode label="Verbindungen" icon={<ArrowLeftRight />} count={Object.keys(project.connections).length}>
        {Object.values(project.connections).map((c) => {
          const a = project.devices[c.a.deviceId]
          const b = project.devices[c.b.deviceId]
          const pa = a && c.a.portId ? findPort(a, c.a.portId)?.port.name : undefined
          const pb = b && c.b.portId ? findPort(b, c.b.portId)?.port.name : undefined
          return <TreeNode key={c.id} label={`${a?.name}${pa ? ` ${pa}` : ''} ↔ ${b?.name}${pb ? ` ${pb}` : ''}`} onClick={() => showConnection(c.id)} />
        })}
      </TreeNode>
    </div>
  )
}

function MiniRacks({ project }: { project: Project }) {
  const racks = Object.values(project.racks)
  if (!racks.length) return <div className="p-6 text-sm text-muted-foreground">Noch kein Rack.</div>
  const scale = 0.42
  const maxH = Math.max(...racks.map((r) => r.heightU))
  const LABEL_W = 180
  const xs: number[] = []
  let total = 0
  for (const r of racks) {
    xs.push(total)
    total += PANEL_MM[rackStandardOf(r)] + 40 + LABEL_W
  }
  return (
    <svg viewBox={`0 0 ${total} ${maxH * U_MM + 60}`} className="h-full w-full" style={{ maxHeight: maxH * U_MM * scale + 40 }}>
      <HardwareDefs />
      {racks.map((r, i) => {
        const pw = PANEL_MM[rackStandardOf(r)]
        return (
          <g key={r.id} transform={`translate(${xs[i]} 0)`}>
            <text x={0} y={22} fontSize={22} fontWeight={700} fill="var(--label)" style={{ cursor: 'pointer' }} onClick={() => openRack(r.id)}>
              {r.name}
            </text>
            <rect x={0} y={34} width={pw + 40} height={r.heightU * U_MM + 16} rx={6} fill="#16191d" />
            {devicesInRack(project, r.id).map((d) => {
              const h = getDeviceHeightU(d) ?? 1
              const y = 42 + (r.heightU - (d.rackPlacement!.positionU + h - 1)) * U_MM
              const off = (pw - widthInRack(d, pw)) / 2
              return (
                <g key={d.id} transform={`translate(20 ${y})`} style={{ cursor: 'pointer' }} onClick={() => (d.build ? openInHardware(d.id) : showInRack(d.id))}>
                  <g transform={`translate(${off} 0)`}>
                    <DeviceFaceplate device={d} face="front" shelfWidth={pw} />
                  </g>
                  <title>{`${d.name} – U${d.rackPlacement!.positionU}`}</title>
                  {d.kind !== 'blank-panel' && (
                    <text x={pw + 30} y={(h * U_MM) / 2} fontSize={16} fill="var(--label)" dominantBaseline="central" fontWeight={600}>
                      {d.name}
                      {d.build ? ' ✎' : ''}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}

function MiniNetwork({ project }: { project: Project }) {
  const devices = Object.values(project.devices).filter((d) => !d.hiddenInNetwork && d.layout.network && DEVICE_KINDS[d.kind].category !== 'service')
  const devicesWithInternet = [...devices, ...Object.values(project.devices).filter((d) => d.kind === 'internet' && d.layout.network && !devices.includes(d))]
  if (!devicesWithInternet.length) return <div className="p-6 text-sm text-muted-foreground">Noch keine Geräte im Netzwerk.</div>
  const pts = devicesWithInternet.map((d) => d.layout.network!)
  const minX = Math.min(...pts.map((p) => p.x)) - 40
  const minY = Math.min(...pts.map((p) => p.y)) - 40
  const maxX = Math.max(...pts.map((p) => p.x)) + 280
  const maxY = Math.max(...pts.map((p) => p.y)) + 160
  const byId = new Map(devicesWithInternet.map((d) => [d.id, d]))
  const center = (d: Device) => ({ x: d.layout.network!.x + 100, y: d.layout.network!.y + 45 })
  return (
    <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} className="h-full w-full">
      {Object.values(project.connections).map((c) => {
        const a = byId.get(c.a.deviceId)
        const b = byId.get(c.b.deviceId)
        if (!a || !b || c.type === 'service') return null
        const pa = center(a)
        const pb = center(b)
        return <line key={c.id} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={c.medium === 'fiber' ? '#f59e0b' : c.medium === 'wireless' ? '#14b8a6' : '#3b82f6'} strokeWidth={4} strokeDasharray={c.medium === 'wireless' ? '10 8' : undefined} opacity={0.7} />
      })}
      {devicesWithInternet.map((d) => {
        const p = d.layout.network!
        return (
          <g key={d.id} transform={`translate(${p.x} ${p.y})`} style={{ cursor: 'pointer' }} onClick={() => showInNetwork(d.id)}>
            <rect width={200} height={90} rx={14} fill="var(--card)" stroke={DEVICE_KINDS[d.kind].color} strokeWidth={4} />
            <rect width={200} height={12} rx={6} fill={DEVICE_KINDS[d.kind].color} />
            <text x={100} y={52} textAnchor="middle" fontSize={24} fontWeight={700} fill="var(--label)">
              {d.name.length > 16 ? `${d.name.slice(0, 15)}…` : d.name}
            </text>
            <text x={100} y={78} textAnchor="middle" fontSize={16} fill="var(--label-muted)">
              {DEVICE_KINDS[d.kind].label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function Workflow({ project }: { project: Project }) {
  const set = useUiStore((s) => s.set)
  const openDialog = useUiStore((s) => s.openDialog)
  const built = Object.values(project.devices).filter((d) => d.build)
  const target = built[built.length - 1]
  const has = (k: HardwareComponent['kind']) => !!target?.build?.components.some((c) => c.kind === k && c.mount)
  const nvme = !!target?.build?.components.some((c) => c.kind === 'storage' && c.mount && c.specs.storageType === 'nvme')
  const ports = target ? getDevicePorts(target) : []
  const conns = target ? connectionsOfDevice(project, target.id) : []
  const vlan = ports.some((p) => p.port.vlanIds?.length)
  const ip = ports.some((p) => p.port.ipAddress)
  const steps: [string, boolean, () => void][] = [
    ['Server Builder öffnen & Gehäuse wählen', !!target, () => openDialog('chassisPicker')],
    ['Mainboard hineinziehen', has('mainboard'), () => target && openInHardware(target.id)],
    ['CPU einsetzen', has('cpu'), () => target && openInHardware(target.id)],
    ['RAM einsetzen', has('ram'), () => target && openInHardware(target.id)],
    ['NVMe einsetzen', nvme, () => target && openInHardware(target.id)],
    ['Netzwerkkarte einsetzen', has('nic'), () => target && openInHardware(target.id)],
    ['Server im Rack platzieren', !!target?.rackPlacement, () => set({ view: 'rack' })],
    ['Im Netzwerk mit dem Switch verbinden', conns.length > 0, () => target && showInNetwork(target.id)],
    ['VLAN zuweisen', vlan, () => target && showInNetwork(target.id)],
    ['IP-Adresse vergeben', ip, () => set({ view: 'ipam' })],
  ]
  const done = steps.filter((s) => s[1]).length
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <div className="font-semibold">Workflow: vom Bauteil zum Netzwerk</div>
        <span className="text-xs text-muted-foreground">
          {done}/{steps.length}
        </span>
      </div>
      <div className="mb-2 text-xs text-muted-foreground">{target ? `Fortschritt für „${target.name}“` : 'Starte mit dem ersten eigenen Server.'}</div>
      <ol className="space-y-0.5">
        {steps.map(([label, ok, go], i) => (
          <li key={label}>
            <button type="button" onClick={go} className="flex w-full cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-accent">
              {ok ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4 text-muted-foreground" />}
              <span className="w-5 text-xs text-muted-foreground">{i + 1}.</span>
              <span className={cn(ok && 'text-muted-foreground line-through')}>{label}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function OverviewPage() {
  const project = useProjectStore((s) => s.project)
  const set = useUiStore((s) => s.set)
  const openDialog = useUiStore((s) => s.openDialog)
  const stats = useMemo(() => {
    const devices = Object.values(project.devices)
    const built = devices.filter((d) => d.build)
    let cores = 0
    let ram = 0
    let storage = 0
    let issues = 0
    for (const d of built) {
      const s = summarizeBuild(d.build!)
      cores += s.cores
      ram += s.ramGB
      storage += s.storageGB
      issues += analyzeBuild(d.build!).filter((i) => i.level === 'error' || i.level === 'warning').length
    }
    issues += collectIpam(project).filter((e) => e.issues.length).length
    for (const r of Object.values(project.racks)) issues += analyzeRack(project, r).warnings.length
    const power = devices.filter((d) => d.kind !== 'ups').reduce((s, d) => s + getDevicePower(d), 0)
    return { devices: devices.length, built: built.length, cores, ram, storage, issues, power }
  }, [project])
  const empty = !Object.keys(project.devices).length

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-canvas scroll-thin" data-testid="overview">
      <div className="mx-auto max-w-[1500px] space-y-4 p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <Input value={project.name} onChange={(e) => renameProject(e.target.value)} className="h-auto border-transparent bg-transparent px-0 text-2xl font-bold shadow-none focus-visible:border-input focus-visible:bg-card focus-visible:px-2" />
            <Textarea
              value={project.description ?? ''}
              onChange={(e) => updateProjectMeta({ description: e.target.value })}
              placeholder="Beschreibung des Projekts …"
              rows={1}
              className="mt-1 min-h-0 resize-none border-transparent bg-transparent px-0 text-sm text-muted-foreground shadow-none focus-visible:bg-card focus-visible:px-2"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => openDialog('chassisPicker')} data-testid="overview-new-server">
              <Wrench /> Neuen Server bauen
            </Button>
            <Button variant="outline" onClick={() => set({ view: 'rack' })}>
              <Server /> Rack Builder
            </Button>
            <Button variant="outline" onClick={() => set({ view: 'network' })}>
              <Network /> Netzwerk
            </Button>
            <Button variant="outline" onClick={() => openHelp('schnellstart')} data-testid="overview-manual">
              <BookOpen /> Erste Schritte
            </Button>
          </div>
        </div>

        {empty && (
          <div className="rounded-xl border border-dashed bg-card p-6 text-center">
            <div className="mb-1 font-semibold">Das Projekt ist noch leer</div>
            <div className="mb-3 text-sm text-muted-foreground">Baue deinen ersten Server aus Einzelteilen oder lade das Demo-Homelab.</div>
            <div className="flex justify-center gap-2">
              <Button onClick={() => openDialog('chassisPicker')}>
                <Plus /> Server bauen
              </Button>
              <Button variant="outline" onClick={() => loadDemoProject()}>
                Demo laden
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <Stat icon={<Boxes />} label="Geräte" value={stats.devices} sub={`${stats.built} selbst gebaut`} onClick={() => set({ view: 'network' })} />
          <Stat icon={<Server />} label="Racks" value={Object.keys(project.racks).length} onClick={() => set({ view: 'rack' })} />
          <Stat icon={<ArrowLeftRight />} label="Verbindungen" value={Object.keys(project.connections).length} onClick={() => set({ view: 'network' })} />
          <Stat icon={<Waypoints />} label="VLANs" value={Object.keys(project.vlans).length} onClick={() => set({ view: 'ipam' })} />
          <Stat icon={<Cpu />} label="CPU-Kerne" value={stats.cores} sub={`${stats.ram} GB RAM`} />
          <Stat icon={<HardDrive />} label="Speicher" value={formatCapacity(stats.storage)} />
          <Stat icon={stats.issues ? <TriangleAlert /> : <Zap />} label={stats.issues ? 'Hinweise' : 'Leistung'} value={stats.issues ? stats.issues : `${(stats.power / 1000).toFixed(2)} kW`} sub={stats.issues ? `${(stats.power / 1000).toFixed(2)} kW` : 'typisch'} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-3 shadow-sm">
              <div className="mb-2 px-1 font-semibold">Projektstruktur</div>
              <ProjectTree project={project} />
            </div>
            <Workflow project={project} />
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border bg-card shadow-sm">
              <div className="flex items-center gap-2 border-b px-4 py-2.5">
                <MemoryStick className="size-4 text-primary" />
                <span className="font-semibold">Hardware</span>
                <span className="text-xs text-muted-foreground">Klick auf ein Gerät öffnet den Builder bzw. das Rack</span>
              </div>
              <div className="flex max-h-[520px] justify-center overflow-auto p-4 scroll-thin">
                <MiniRacks project={project} />
              </div>
            </div>
            <div className="rounded-xl border bg-card shadow-sm">
              <div className="flex items-center gap-2 border-b px-4 py-2.5">
                <Network className="size-4 text-primary" />
                <span className="font-semibold">Netzwerk</span>
                <span className="text-xs text-muted-foreground">Klick auf ein Gerät springt in den Netzwerk-Designer</span>
              </div>
              <div className="h-[420px] p-3">
                <MiniNetwork project={project} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

