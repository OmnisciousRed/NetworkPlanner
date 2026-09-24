import { create } from 'zustand'
import { produce } from 'immer'
import type { Project } from '@/models'
import { nowIso } from '@/models'
import { createProject } from '@/utils/factory'

const HISTORY_LIMIT = 150
const MERGE_WINDOW_MS = 1200

export interface CommitOptions {
  /** consecutive commits with the same key (e.g. typing in a field) form one undo step */
  mergeKey?: string
}

export interface HistoryEntry {
  project: Project
  label: string
}

interface ProjectState {
  project: Project
  past: HistoryEntry[]
  future: HistoryEntry[]
  /** incremented on every change, used by autosave */
  revision: number
  savedRevision: number
  savedAt?: string
  lastCommit?: { key?: string; at: number; label: string }
  commit: (label: string, recipe: (draft: Project) => void, opts?: CommitOptions) => void
  undo: () => string | null
  redo: () => string | null
  replaceProject: (p: Project) => void
  markSaved: (revision: number) => void
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  project: createProject('Mein Homelab'),
  past: [],
  future: [],
  revision: 0,
  savedRevision: 0,

  commit: (label, recipe, opts) => {
    const state = get()
    const prev = state.project
    const next = produce(prev, (draft) => {
      recipe(draft)
    })
    if (next === prev) return
    const stamped = produce(next, (d) => {
      d.updatedAt = nowIso()
    })
    const now = Date.now()
    const merge =
      !!opts?.mergeKey &&
      state.lastCommit?.key === opts.mergeKey &&
      now - state.lastCommit.at < MERGE_WINDOW_MS &&
      state.past.length > 0
    set({
      project: stamped,
      past: merge ? state.past : [...state.past, { project: prev, label }].slice(-HISTORY_LIMIT),
      future: [],
      revision: state.revision + 1,
      lastCommit: { key: opts?.mergeKey, at: now, label },
    })
  },

  undo: () => {
    const { past, future, project, revision } = get()
    const entry = past[past.length - 1]
    if (!entry) return null
    set({
      project: entry.project,
      past: past.slice(0, -1),
      future: [{ project, label: entry.label }, ...future],
      revision: revision + 1,
      lastCommit: undefined,
    })
    return entry.label
  },

  redo: () => {
    const { past, future, project, revision } = get()
    const entry = future[0]
    if (!entry) return null
    set({
      project: entry.project,
      past: [...past, { project, label: entry.label }],
      future: future.slice(1),
      revision: revision + 1,
      lastCommit: undefined,
    })
    return entry.label
  },

  replaceProject: (p) => {
    const rev = get().revision + 1
    set({ project: p, past: [], future: [], revision: rev, savedRevision: rev, lastCommit: undefined })
  },

  markSaved: (revision) => set({ savedRevision: revision, savedAt: nowIso() }),
}))

export const getProject = () => useProjectStore.getState().project
export const commit = (label: string, recipe: (draft: Project) => void, opts?: CommitOptions) =>
  useProjectStore.getState().commit(label, recipe, opts)
