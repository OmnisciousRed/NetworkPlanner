import { useRef } from 'react'
import {
  Boxes,
  Copy,
  Download,
  FileJson,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Keyboard,
  LayoutDashboard,
  Moon,
  Network,
  Redo2,
  Save,
  Server,
  Sparkles,
  Sun,
  Undo2,
  Upload,
  Waypoints,
  Wrench,
} from 'lucide-react'
import { useProjectStore } from '@/store/projectStore'
import { toast, useUiStore, type AppView } from '@/store/uiStore'
import { saveNow } from '@/store/autosave'
import { duplicateProject, importProjectJson, loadDemoProject, newProject, renameProject } from '@/store/actions/project'
import { bomCsv, cableCsv, downloadText, ipamCsv, projectMarkdown, projectToJson, safeFileName } from '@/utils/importExport'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn, isMac } from '@/lib/utils'

const NAV: { id: AppView; label: string; icon: typeof Server }[] = [
  { id: 'overview', label: 'Übersicht', icon: LayoutDashboard },
  { id: 'hardware', label: 'Hardware Builder', icon: Wrench },
  { id: 'rack', label: 'Rack Builder', icon: Server },
  { id: 'network', label: 'Netzwerk-Designer', icon: Network },
  { id: 'ipam', label: 'VLAN & IP', icon: Waypoints },
]

const MOD = isMac ? '⌘' : 'Strg+'

export function TopBar() {
  const name = useProjectStore((s) => s.project.name)
  const canUndo = useProjectStore((s) => s.past.length > 0)
  const canRedo = useProjectStore((s) => s.future.length > 0)
  const undoLabel = useProjectStore((s) => s.past[s.past.length - 1]?.label)
  const redoLabel = useProjectStore((s) => s.future[0]?.label)
  const dirty = useProjectStore((s) => s.revision !== s.savedRevision)
  const view = useUiStore((s) => s.view)
  const set = useUiStore((s) => s.set)
  const theme = useUiStore((s) => s.theme)
  const openDialog = useUiStore((s) => s.openDialog)
  const fileRef = useRef<HTMLInputElement>(null)

  const exportJson = () => {
    const p = useProjectStore.getState().project
    downloadText(`${safeFileName(p.name)}.networkplanner.json`, projectToJson(p), 'application/json')
  }
  const exportCsv = (kind: 'bom' | 'cables' | 'ipam') => {
    const p = useProjectStore.getState().project
    const text = kind === 'bom' ? bomCsv(p) : kind === 'cables' ? cableCsv(p) : ipamCsv(p)
    downloadText(`${safeFileName(p.name)}_${kind === 'bom' ? 'Stueckliste' : kind === 'cables' ? 'Kabelliste' : 'IP-Plan'}.csv`, '﻿' + text, 'text/csv')
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-card px-3">
      <div className="flex items-center gap-2 pr-1">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Boxes className="size-4" />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex cursor-pointer flex-col items-start rounded px-1 text-left leading-tight hover:bg-accent" data-testid="project-menu">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">NetworkPlanner</span>
              <span className="max-w-48 truncate text-sm font-semibold">
                {name}
                {dirty && <span className="ml-1 text-muted-foreground">•</span>}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Projekt</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => newProject()}>
              <FilePlus2 /> Neues Projekt
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openDialog('projects')}>
              <FolderOpen /> Projekte öffnen …
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                const n = window.prompt('Projektname', name)
                if (n?.trim()) renameProject(n.trim())
              }}
            >
              <FileText /> Umbenennen …
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => duplicateProject()}>
              <Copy /> Duplizieren
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => loadDemoProject()}>
              <Sparkles /> Demo-Homelab laden
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => saveNow(true)}>
              <Save /> Speichern <DropdownMenuShortcut>{MOD}S</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Import / Export</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => fileRef.current?.click()}>
              <Upload /> Projekt importieren (JSON)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportJson}>
              <FileJson /> Projekt exportieren (JSON)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportCsv('bom')}>
              <FileSpreadsheet /> Stückliste (CSV)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportCsv('cables')}>
              <FileSpreadsheet /> Kabelliste (CSV)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportCsv('ipam')}>
              <FileSpreadsheet /> IP-Plan (CSV)
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                const p = useProjectStore.getState().project
                downloadText(`${safeFileName(p.name)}.md`, projectMarkdown(p), 'text/markdown')
              }}
            >
              <Download /> Dokumentation (Markdown)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) await importProjectJson(await f.text())
          }}
        />
      </div>

      <nav className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
        {NAV.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => set({ view: n.id, selection: null })}
            data-testid={`nav-${n.id}`}
            className={cn(
              'flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground',
              view === n.id && 'bg-card text-foreground shadow-sm',
            )}
          >
            <n.icon className="size-3.5" />
            <span className="hidden lg:inline">{n.label}</span>
          </button>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-0.5">
        <Tooltip content={canUndo ? `Rückgängig: ${undoLabel} (${MOD}Z)` : 'Rückgängig'}>
          <Button size="icon-sm" variant="ghost" disabled={!canUndo} onClick={() => { const l = useProjectStore.getState().undo(); if (l) toast(`Rückgängig: ${l}`) }} data-testid="undo">
            <Undo2 />
          </Button>
        </Tooltip>
        <Tooltip content={canRedo ? `Wiederholen: ${redoLabel} (${MOD}⇧Z)` : 'Wiederholen'}>
          <Button size="icon-sm" variant="ghost" disabled={!canRedo} onClick={() => { const l = useProjectStore.getState().redo(); if (l) toast(`Wiederholt: ${l}`) }} data-testid="redo">
            <Redo2 />
          </Button>
        </Tooltip>
        <Tooltip content={dirty ? 'Ungespeicherte Änderungen – wird automatisch gesichert' : 'Alle Änderungen gespeichert (IndexedDB)'}>
          <Button size="icon-sm" variant="ghost" onClick={() => saveNow(true)}>
            <Save className={dirty ? 'text-warning' : undefined} />
          </Button>
        </Tooltip>
        <Tooltip content="Tastaturkürzel">
          <Button size="icon-sm" variant="ghost" onClick={() => openDialog('shortcuts')}>
            <Keyboard />
          </Button>
        </Tooltip>
        <Tooltip content={theme === 'dark' ? 'Helles Design' : 'Dunkles Design'}>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => {
              const next = theme === 'dark' ? 'light' : 'dark'
              set({ theme: next })
              try {
                localStorage.setItem('np-theme', next)
              } catch {
                /* ignore */
              }
            }}
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
        </Tooltip>
      </div>
    </header>
  )
}
