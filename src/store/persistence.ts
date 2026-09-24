import { createStore, del, get, set } from 'idb-keyval'
import type { Project, ProjectMeta } from '@/models'

const store = typeof indexedDB !== 'undefined' ? createStore('network-planner', 'kv') : undefined

const INDEX_KEY = 'projects:index'
const LAST_KEY = 'projects:last'
const projectKey = (id: string) => `project:${id}`

export async function listProjects(): Promise<ProjectMeta[]> {
  if (!store) return []
  return ((await get<ProjectMeta[]>(INDEX_KEY, store)) ?? []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function saveProject(project: Project): Promise<void> {
  if (!store) return
  await set(projectKey(project.id), project, store)
  const index = (await get<ProjectMeta[]>(INDEX_KEY, store)) ?? []
  const meta: ProjectMeta = {
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
    deviceCount: Object.keys(project.devices).length,
  }
  const next = [meta, ...index.filter((m) => m.id !== project.id)]
  await set(INDEX_KEY, next, store)
  await set(LAST_KEY, project.id, store)
}

export async function loadProject(id: string): Promise<Project | undefined> {
  if (!store) return undefined
  return get<Project>(projectKey(id), store)
}

export async function deleteProject(id: string): Promise<void> {
  if (!store) return
  await del(projectKey(id), store)
  const index = (await get<ProjectMeta[]>(INDEX_KEY, store)) ?? []
  await set(INDEX_KEY, index.filter((m) => m.id !== id), store)
}

export async function lastProjectId(): Promise<string | undefined> {
  if (!store) return undefined
  return get<string>(LAST_KEY, store)
}
