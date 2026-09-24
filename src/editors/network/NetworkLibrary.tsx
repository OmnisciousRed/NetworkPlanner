import { useMemo, useState } from 'react'
import { ChevronRight, Eye, Plus, Search, Trash2 } from 'lucide-react'
import type { DeviceTemplate } from '@/models'
import { DEVICE_CATALOG, DEVICE_GROUP_LABELS, DEVICE_GROUP_ORDER } from '@/data/deviceCatalog'
import { DEVICE_KINDS } from '@/data/deviceKinds'
import { useProjectStore } from '@/store/projectStore'
import { useUiStore } from '@/store/uiStore'
import { setHiddenInNetwork } from '@/store/actions/devices'
import { deleteCustomTemplate } from '@/store/actions/project'
import { DeviceIcon } from '@/components/icons'
import { InfoButton } from '@/components/InfoButton'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { formatSpeed } from '@/models'
import { cn } from '@/lib/utils'

function portSummary(t: DeviceTemplate) {
  return t.ports.map((g) => `${g.count}× ${g.connector === 'WiFi' ? 'WLAN' : `${formatSpeed(g.speed)} ${g.connector === 'Virtual' ? 'virt.' : g.connector}`}`).join(', ')
}

export function NetworkLibrary() {
  const project = useProjectStore((s) => s.project)
  const set = useUiStore((s) => s.set)
  const openDialog = useUiStore((s) => s.openDialog)
  const [q, setQ] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ RACK: true })
  const hidden = Object.values(project.devices).filter((d) => d.hiddenInNetwork && d.kind !== 'blank-panel' && d.kind !== 'cable-management' && d.kind !== 'shelf')
  const groups = useMemo(() => {
    const all = [...DEVICE_CATALOG, ...project.customTemplates.devices.map((t) => ({ ...t, group: 'EIGENE' }))]
    const needle = q.trim().toLowerCase()
    const filtered = needle ? all.filter((t) => `${t.name} ${DEVICE_KINDS[t.kind].label} ${t.model ?? ''} ${t.manufacturer ?? ''}`.toLowerCase().includes(needle)) : all
    return DEVICE_GROUP_ORDER.map((g) => [g, filtered.filter((t) => t.group === g)] as const).filter(([, ts]) => ts.length)
  }, [project.customTemplates.devices, q])

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r bg-card" data-testid="network-library">
      <div className="border-b p-2.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Bibliothek</span>
          <Button size="xs" variant="ghost" onClick={() => openDialog('customComponent')}>
            <Plus /> Eigenes Gerät
          </Button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Router, Switch, Docker …" className="h-7 pl-7 text-xs" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5 scroll-thin">
        {hidden.length > 0 && (
          <div className="mb-2">
            <div className="px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ausgeblendete Projektgeräte</div>
            {hidden.map((d) => (
              <div
                key={d.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-np-device', d.id)
                  set({ drag: { source: 'device', deviceId: d.id } })
                }}
                onDragEnd={() => set({ drag: null })}
                className="flex cursor-grab items-center gap-2 rounded-md border border-dashed px-1.5 py-1 hover:bg-accent"
              >
                <DeviceIcon kind={d.kind} className="size-4 text-muted-foreground" />
                <span className="flex-1 truncate text-xs">{d.name}</span>
                <button type="button" className="cursor-pointer" title="Einblenden" onClick={() => setHiddenInNetwork([d.id], false)}>
                  <Eye className="size-3.5 text-muted-foreground hover:text-primary" />
                </button>
              </div>
            ))}
          </div>
        )}
        {groups.map(([g, ts]) => {
          const isCollapsed = !q && collapsed[g]
          return (
            <div key={g} className="mb-1">
              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-xs font-semibold uppercase tracking-wide text-foreground/80 hover:bg-accent"
                onClick={() => setCollapsed((c) => ({ ...c, [g]: !isCollapsed }))}
              >
                <ChevronRight className={cn('size-3.5 transition-transform', !isCollapsed && 'rotate-90')} />
                {DEVICE_GROUP_LABELS[g] ?? g}
                <span className="ml-auto font-normal text-muted-foreground">{ts.length}</span>
              </button>
              {!isCollapsed &&
                ts.map((t) => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-np-device-template', t.id)
                      e.dataTransfer.effectAllowed = 'copy'
                      set({ drag: { source: 'device-template', templateId: t.id } })
                    }}
                    onDragEnd={() => set({ drag: null })}
                    className="group ml-2 flex cursor-grab items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent active:cursor-grabbing"
                    title="Auf die Arbeitsfläche ziehen"
                    data-testid={`netlib-${t.id}`}
                  >
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-md text-white" style={{ background: DEVICE_KINDS[t.kind].color }}>
                      <DeviceIcon kind={t.kind} className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{t.name}</div>
                      <div className="truncate text-[10px] text-muted-foreground">{portSummary(t) || DEVICE_KINDS[t.kind].label}</div>
                    </div>
                    <InfoButton device={t.kind} className="opacity-0 group-hover:opacity-100" />
                    {t.custom && (
                      <button type="button" className="cursor-pointer opacity-0 group-hover:opacity-100" onClick={() => deleteCustomTemplate('devices', t.id)}>
                        <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    )}
                  </div>
                ))}
            </div>
          )
        })}
      </div>
      <div className="border-t p-2 text-[11px] leading-snug text-muted-foreground">
        Ziehen = hinzufügen · Port auf Port ziehen = verbinden · Server aus dem Hardware Builder erscheinen automatisch
      </div>
    </aside>
  )
}
