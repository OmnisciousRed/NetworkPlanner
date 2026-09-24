import { useEffect, useState } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TopBar } from '@/components/layout/TopBar'
import { Toaster } from '@/components/layout/Toaster'
import { ProjectsDialog, ShortcutsDialog, WelcomeDialog } from '@/components/layout/Dialogs'
import { CustomTemplateDialog } from '@/components/layout/CustomTemplateDialog'
import { Inspector } from '@/components/inspector/Inspector'
import { HardwareEditor } from '@/editors/hardware/HardwareEditor'
import { ChassisPickerDialog } from '@/editors/hardware/ChassisPicker'
import { RackEditor } from '@/editors/rack/RackEditor'
import { NetworkEditor } from '@/editors/network/NetworkEditor'
import { IpamPage } from '@/pages/IpamPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { useProjectStore } from '@/store/projectStore'
import { toast, useUiStore } from '@/store/uiStore'
import { lastProjectId, loadProject } from '@/store/persistence'
import { saveNow, startAutosave } from '@/store/autosave'
import { normalizeProject } from '@/utils/importExport'
import { isEditableTarget, isModKey } from '@/lib/utils'

function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isModKey(e)) return
      const key = e.key.toLowerCase()
      if (key === 's') {
        e.preventDefault()
        void saveNow(true)
        return
      }
      if (isEditableTarget(e.target)) return
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        const l = useProjectStore.getState().undo()
        if (l) toast(`Rückgängig: ${l}`)
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        const l = useProjectStore.getState().redo()
        if (l) toast(`Wiederholt: ${l}`)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export function App() {
  const view = useUiStore((s) => s.view)
  const theme = useUiStore((s) => s.theme)
  const [ready, setReady] = useState(false)
  useGlobalShortcuts()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const id = await lastProjectId()
        const stored = id ? await loadProject(id) : undefined
        if (!cancelled && stored) useProjectStore.getState().replaceProject(normalizeProject(stored))
        else if (!cancelled) useUiStore.getState().openDialog('welcome')
      } catch {
        useUiStore.getState().openDialog('welcome')
      }
      if (!cancelled) {
        setReady(true)
        startAutosave()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <TooltipProvider delayDuration={350}>
      <div className="flex h-full flex-col">
        <TopBar />
        {ready ? (
          <div className="flex min-h-0 flex-1">
            {view === 'overview' && <OverviewPage />}
            {view === 'hardware' && <HardwareEditor />}
            {view === 'rack' && <RackEditor />}
            {view === 'network' && <NetworkEditor />}
            {view === 'ipam' && <IpamPage />}
            {view !== 'overview' && view !== 'ipam' && <Inspector />}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Projekt wird geladen …</div>
        )}
      </div>
      <Toaster />
      <ChassisPickerDialog />
      <CustomTemplateDialog />
      <ProjectsDialog />
      <ShortcutsDialog />
      <WelcomeDialog />
    </TooltipProvider>
  )
}
