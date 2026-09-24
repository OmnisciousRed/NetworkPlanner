import { memo, useMemo, useState } from 'react'
import { ChevronRight, Plus, Search, Trash2 } from 'lucide-react'
import type { ComponentTemplate } from '@/models'
import { formatSpeed } from '@/models'
import { COMPONENT_CATALOG, COMPONENT_GROUP_ORDER } from '@/data/componentCatalog'
import { useProjectStore } from '@/store/projectStore'
import { useUiStore } from '@/store/uiStore'
import { addComponentFromTemplate } from '@/store/actions/hardware'
import { deleteCustomTemplate } from '@/store/actions/project'
import { ComponentGraphic, HardwareDefs } from '@/components/hardware/graphics'
import { InfoButton } from '@/components/InfoButton'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createComponent } from '@/utils/factory'
import { formatCapacity } from '@/utils/buildSummary'
import { cn } from '@/lib/utils'

export function templateSubtitle(t: ComponentTemplate): string {
  switch (t.kind) {
    case 'cpu':
      return `${t.specs.socket} · ${t.specs.cores}C · ${t.specs.tdpW} W`
    case 'ram':
      return `${t.specs.capacityGB} GB · ${t.specs.speedMTs} MT/s${t.specs.registered ? ' · RDIMM' : ''}`
    case 'storage':
      return `${formatCapacity(t.specs.capacityGB)} · ${t.specs.formFactor} · ${t.specs.interface}`
    case 'nic':
      return `${t.specs.portCount}× ${formatSpeed(t.specs.speed)} ${t.specs.connector} · PCIe x${t.specs.pcieLanes}`
    case 'psu':
      return `${t.specs.watts} W · ${t.specs.formFactor}${t.specs.hotSwap ? ' · Hot-Swap' : ''}`
    case 'fan':
      return `${t.specs.sizeMm} mm · ${t.specs.airflowCFM} CFM`
    case 'gpu':
      return `${t.specs.vramGB} GB · ${t.specs.slotWidth}-Slot · ${t.powerW} W`
    case 'hba':
    case 'raid':
      return `${t.specs.drivePorts} Laufwerke · ${t.specs.protocol} · x${t.specs.pcieLanes}`
    case 'pcie':
      return `${t.specs.function} · x${t.specs.pcieLanes}`
    case 'mainboard':
      return `${t.specs.formFactor} · ${t.specs.sockets}× ${t.specs.socket} · ${t.specs.sockets * t.specs.dimmsPerCpu}× ${t.specs.memoryType}`
    default:
      return t.subgroup
  }
}

const Thumb = memo(function Thumb({ t }: { t: ComponentTemplate }) {
  const c = useMemo(() => createComponent(t), [t])
  const pad = 2
  const vw = c.size.w + pad * 2
  const vh = c.size.h + pad * 2
  return (
    <svg viewBox={`${-pad} ${-pad} ${vw} ${vh}`} className="h-7 w-11 shrink-0" preserveAspectRatio="xMidYMid meet">
      <ComponentGraphic c={c} w={c.size.w} h={c.size.h} showLabels={false} />
    </svg>
  )
})

export function ComponentLibrary({ deviceId }: { deviceId?: string }) {
  const custom = useProjectStore((s) => s.project.customTemplates.components)
  const setUi = useUiStore((s) => s.set)
  const openDialog = useUiStore((s) => s.openDialog)
  const [q, setQ] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ Mainboard: false })

  const groups = useMemo(() => {
    const all = [...COMPONENT_CATALOG, ...custom.map((t) => ({ ...t, group: 'Eigene' }))]
    const needle = q.trim().toLowerCase()
    const filtered = needle
      ? all.filter((t) => `${t.name} ${t.subgroup} ${t.group} ${t.manufacturer ?? ''} ${templateSubtitle(t)}`.toLowerCase().includes(needle))
      : all
    const map = new Map<string, Map<string, ComponentTemplate[]>>()
    for (const t of filtered) {
      const g = map.get(t.group) ?? new Map<string, ComponentTemplate[]>()
      g.set(t.subgroup, [...(g.get(t.subgroup) ?? []), t])
      map.set(t.group, g)
    }
    return COMPONENT_GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ group: g, subgroups: [...map.get(g)!.entries()] }))
  }, [custom, q])

  return (
    <aside className="flex h-full w-[272px] shrink-0 flex-col border-r bg-card" data-testid="component-library">
      <svg width={0} height={0} className="absolute">
        <HardwareDefs />
      </svg>
      <div className="border-b p-2.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Komponenten</span>
          <Button size="xs" variant="ghost" onClick={() => openDialog('customComponent')} title="Eigene Komponente definieren">
            <Plus /> Eigene
          </Button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen (z. B. DDR5, 10G, EPYC)" className="h-7 pl-7 text-xs" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5 scroll-thin">
        {groups.map(({ group, subgroups }) => {
          const isCollapsed = !q && collapsed[group]
          return (
            <div key={group} className="mb-1">
              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-xs font-semibold uppercase tracking-wide text-foreground/80 hover:bg-accent"
                onClick={() => setCollapsed((c) => ({ ...c, [group]: !isCollapsed }))}
              >
                <ChevronRight className={cn('size-3.5 transition-transform', !isCollapsed && 'rotate-90')} />
                {group}
                <span className="ml-auto font-normal text-muted-foreground">{subgroups.reduce((s, [, xs]) => s + xs.length, 0)}</span>
              </button>
              {!isCollapsed &&
                subgroups.map(([sub, items]) => (
                  <div key={sub} className="ml-3 border-l pl-1.5">
                    <div className="px-1.5 pb-0.5 pt-1 text-[11px] text-muted-foreground">{sub}</div>
                    {items.map((t) => (
                      <div
                        key={t.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/x-np-component', t.id)
                          e.dataTransfer.effectAllowed = 'copy'
                          setUi({ drag: { source: 'component-template', templateId: t.id } })
                        }}
                        onDragEnd={() => setUi({ drag: null })}
                        onDoubleClick={() => deviceId && addComponentFromTemplate(deviceId, t.id, { auto: true })}
                        className="group flex cursor-grab items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent active:cursor-grabbing"
                        title="In das Gehäuse ziehen – Doppelklick baut automatisch in den nächsten freien Steckplatz ein"
                        data-testid={`lib-${t.id}`}
                      >
                        <Thumb t={t} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium">{t.name}</div>
                          <div className="truncate text-[10px] text-muted-foreground">{templateSubtitle(t)}</div>
                        </div>
                        <InfoButton component={t.kind} className="opacity-0 group-hover:opacity-100" />
                        {t.custom && (
                          <button type="button" className="cursor-pointer opacity-0 group-hover:opacity-100" title="Vorlage löschen" onClick={() => deleteCustomTemplate('components', t.id)}>
                            <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          )
        })}
        {!groups.length && <div className="p-3 text-center text-xs text-muted-foreground">Keine Treffer</div>}
      </div>
      <div className="border-t p-2 text-[11px] leading-snug text-muted-foreground">
        Ziehen = platzieren · Doppelklick = automatisch einbauen · Klick auf freien Slot zeigt passende Teile
      </div>
    </aside>
  )
}
