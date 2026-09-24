import { useProjectStore } from './projectStore'
import { saveProject } from './persistence'
import { toast } from './uiStore'

let timer: ReturnType<typeof setTimeout> | undefined
let started = false

export async function saveNow(notify = false) {
  const { project, revision, markSaved } = useProjectStore.getState()
  try {
    await saveProject(project)
    markSaved(revision)
    if (notify) toast('Projekt gespeichert', 'success')
  } catch (e) {
    toast(`Speichern fehlgeschlagen: ${(e as Error).message}`, 'error')
  }
}

/** debounced autosave into IndexedDB after every change */
export function startAutosave() {
  if (started) return
  started = true
  useProjectStore.subscribe((s, prev) => {
    if (s.revision === prev.revision) return
    if (s.revision === s.savedRevision) return
    clearTimeout(timer)
    timer = setTimeout(() => void saveNow(), 800)
  })
  window.addEventListener('beforeunload', () => {
    const s = useProjectStore.getState()
    if (s.revision !== s.savedRevision) void saveNow()
  })
}
