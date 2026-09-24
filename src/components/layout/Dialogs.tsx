import { useEffect, useState } from 'react'
import { BookOpen, FilePlus2, FolderOpen, Sparkles, Trash2 } from 'lucide-react'
import type { ProjectMeta } from '@/models'
import { useProjectStore } from '@/store/projectStore'
import { useUiStore } from '@/store/uiStore'
import { listProjects } from '@/store/persistence'
import { deleteStoredProject, loadDemoProject, newProject, openStoredProject } from '@/store/actions/project'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { isMac } from '@/lib/utils'
import { askConfirm } from './AskDialog'
import { openHelp } from '@/store/navigation'

export function ProjectsDialog() {
  const open = useUiStore((s) => s.dialogs.projects)
  const openDialog = useUiStore((s) => s.openDialog)
  const currentId = useProjectStore((s) => s.project.id)
  const [list, setList] = useState<ProjectMeta[]>([])
  useEffect(() => {
    if (open) listProjects().then(setList)
  }, [open])
  return (
    <Dialog open={open} onOpenChange={(o) => openDialog('projects', o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Projekte</DialogTitle>
          <DialogDescription>Alle Projekte werden lokal im Browser (IndexedDB) gespeichert.</DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-1 overflow-y-auto scroll-thin">
          {list.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {p.name} {p.id === currentId && <span className="text-xs text-primary">(geöffnet)</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {p.deviceCount} Geräte · {new Date(p.updatedAt).toLocaleString('de-DE')}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={p.id === currentId}
                onClick={async () => {
                  await openStoredProject(p.id)
                  openDialog('projects', false)
                }}
              >
                <FolderOpen /> Öffnen
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={p.id === currentId}
                onClick={async () => {
                  const ok = await askConfirm(`Projekt „${p.name}“ löschen?`, 'Das Projekt wird endgültig aus diesem Browser entfernt. Tipp: vorher über das Projektmenü als JSON exportieren.', {
                    confirmLabel: 'Endgültig löschen',
                    destructive: true,
                  })
                  if (!ok) return
                  await deleteStoredProject(p.id)
                  setList(await listProjects())
                }}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          {!list.length && <div className="py-6 text-center text-sm text-muted-foreground">Noch keine gespeicherten Projekte.</div>}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => { loadDemoProject(); openDialog('projects', false) }}>
            <Sparkles /> Demo laden
          </Button>
          <Button onClick={() => { newProject(); openDialog('projects', false) }}>
            <FilePlus2 /> Neues Projekt
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const M = isMac ? '⌘' : 'Strg'
const SHORTCUTS: [string, string][] = [
  [`${M} + Z`, 'Rückgängig'],
  [`${M} + Shift + Z / ${M} + Y`, 'Wiederholen'],
  [`${M} + S`, 'Speichern'],
  [`${M} + C / ${M} + V`, 'Kopieren / Einfügen'],
  [`${M} + X`, 'Ausschneiden'],
  [`${M} + D`, 'Duplizieren'],
  [`${M} + A`, 'Alles auswählen'],
  [`${M} + G / ${M} + Shift + G`, 'Gruppieren / Gruppierung aufheben'],
  ['Entf / Backspace', 'Löschen'],
  ['Pfeiltasten (+Shift)', 'Verschieben (Rasterschritte)'],
  ['R / Shift + R', 'Drehen (Hardware)'],
  ['I / U', 'Einbauen / Ausbauen (Hardware)'],
  ['V / H / C', 'Werkzeug: Auswahl / Hand / Kabel'],
  ['Leertaste + Ziehen', 'Ansicht verschieben'],
  ['Mausrad', 'Zoomen'],
  ['+ / - / 0', 'Zoom rein / raus / einpassen'],
  ['Shift + Klick / Rahmen', 'Mehrfachauswahl'],
  ['Alt beim Ziehen', 'Einrasten kurz deaktivieren'],
  ['Esc', 'Auswahl aufheben'],
  ['F1', 'Handbuch zum aktuellen Bereich'],
]

export function ShortcutsDialog() {
  const open = useUiStore((s) => s.dialogs.shortcuts)
  const openDialog = useUiStore((s) => s.openDialog)
  return (
    <Dialog open={open} onOpenChange={(o) => openDialog('shortcuts', o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tastaturkürzel</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="contents">
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">{k}</kbd>
              <span>{v}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function WelcomeDialog() {
  const open = useUiStore((s) => s.dialogs.welcome)
  const openDialog = useUiStore((s) => s.openDialog)
  return (
    <Dialog open={open} onOpenChange={(o) => openDialog('welcome', o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Willkommen beim NetworkPlanner</DialogTitle>
          <DialogDescription>
            Baue Server aus Einzelteilen, setze sie ins Rack und verbinde sie im Netzwerk – alles auf einem gemeinsamen Datenmodell.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            className="cursor-pointer rounded-lg border p-4 text-left hover:border-primary"
            onClick={() => {
              loadDemoProject()
              openDialog('welcome', false)
            }}
            data-testid="welcome-demo"
          >
            <Sparkles className="mb-2 size-5 text-primary" />
            <div className="font-semibold">Demo-Homelab öffnen</div>
            <div className="text-xs text-muted-foreground">3 selbst gebaute Server, Rack, VLANs, Docker-Dienste</div>
          </button>
          <button
            type="button"
            className="cursor-pointer rounded-lg border p-4 text-left hover:border-primary"
            onClick={() => {
              openDialog('welcome', false)
              useUiStore.getState().set({ view: 'hardware' })
            }}
            data-testid="welcome-empty"
          >
            <FilePlus2 className="mb-2 size-5 text-primary" />
            <div className="font-semibold">Leer beginnen</div>
            <div className="text-xs text-muted-foreground">Mit dem ersten Server im Hardware Builder starten</div>
          </button>
        </div>
        <button
          type="button"
          className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 text-left hover:border-primary"
          onClick={() => {
            openDialog('welcome', false)
            openHelp('schnellstart')
          }}
          data-testid="welcome-manual"
        >
          <BookOpen className="size-5 shrink-0 text-primary" />
          <span>
            <span className="block text-sm font-semibold">Neu hier? Handbuch lesen</span>
            <span className="block text-xs text-muted-foreground">Schritt für Schritt erklärt – jederzeit auch über „Handbuch“ oben rechts oder F1.</span>
          </span>
        </button>
      </DialogContent>
    </Dialog>
  )
}
