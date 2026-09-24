import type { ChassisTemplate, ComponentTemplate, DeviceTemplate, Project, ProjectSettings } from '@/models'
import { createDemoProject } from '@/data/sampleProject'
import { createProject } from '@/utils/factory'
import { normalizeProject } from '@/utils/importExport'
import { commit, useProjectStore } from '../projectStore'
import { toast, useUiStore } from '../uiStore'
import { deleteProject as idbDelete, loadProject as idbLoad, saveProject } from '../persistence'

export function renameProject(name: string) {
  commit('Projekt umbenannt', (d) => {
    d.name = name
  }, { mergeKey: 'project-name' })
}

export function updateProjectMeta(patch: Partial<Pick<Project, 'description'>> & { settings?: Partial<ProjectSettings> }) {
  commit('Projekt geändert', (d) => {
    if (patch.description !== undefined) d.description = patch.description
    if (patch.settings) Object.assign(d.settings, patch.settings)
  }, { mergeKey: 'project-meta' })
}

function resetUi() {
  useUiStore.getState().set({ selection: null, hardwareDeviceId: undefined, activeRackId: undefined, focus: null })
}

export async function openProject(p: Project) {
  // persist the current one before switching
  const current = useProjectStore.getState().project
  await saveProject(current).catch(() => undefined)
  useProjectStore.getState().replaceProject(p)
  resetUi()
  await saveProject(p).catch(() => undefined)
}

export async function newProject(name = 'Neues Projekt') {
  await openProject(createProject(name))
  toast(`Projekt „${name}“ erstellt`, 'success')
}

export async function loadDemoProject() {
  await openProject(createDemoProject())
  toast('Demo-Homelab geladen', 'success')
}

export async function openStoredProject(id: string) {
  const p = await idbLoad(id)
  if (!p) return toast('Projekt nicht gefunden', 'error')
  await openProject(normalizeProject(p))
}

export async function deleteStoredProject(id: string) {
  await idbDelete(id)
}

export async function importProjectJson(text: string) {
  try {
    const p = normalizeProject(JSON.parse(text), { newId: true })
    await openProject(p)
    toast(`„${p.name}“ importiert`, 'success')
  } catch (e) {
    toast(`Import fehlgeschlagen: ${(e as Error).message}`, 'error')
  }
}

export async function duplicateProject() {
  const p = structuredClone(useProjectStore.getState().project)
  const copy = normalizeProject(p, { newId: true })
  copy.name = `${p.name} (Kopie)`
  await openProject(copy)
  toast('Projekt dupliziert', 'success')
}

/* ------------------------------------------------------------------ */
/* custom templates                                                    */
/* ------------------------------------------------------------------ */

export function addCustomComponentTemplate(t: ComponentTemplate) {
  commit(`Eigene Komponente „${t.name}“`, (d) => {
    d.customTemplates.components.push({ ...t, custom: true, group: 'Eigene' })
  })
}

export function addCustomDeviceTemplate(t: DeviceTemplate) {
  commit(`Eigenes Gerät „${t.name}“`, (d) => {
    d.customTemplates.devices.push({ ...t, custom: true, group: 'EIGENE' })
  })
}

export function addCustomChassisTemplate(t: ChassisTemplate) {
  commit(`Eigenes Gehäuse „${t.name}“`, (d) => {
    d.customTemplates.chassis.push({ ...t, custom: true })
  })
}

export function deleteCustomTemplate(kind: 'components' | 'devices' | 'chassis', id: string) {
  commit('Eigene Vorlage gelöscht', (d) => {
    const list = d.customTemplates[kind] as { id: string }[]
    d.customTemplates[kind] = list.filter((t) => t.id !== id) as never
  })
}
