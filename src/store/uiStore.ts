import { create } from 'zustand'
import type { Connection, Device, HardwareComponent, Id } from '@/models'

export type AppView = 'overview' | 'hardware' | 'rack' | 'network' | 'ipam' | 'help'
export type HardwareView = 'interior' | 'exploded' | 'front' | 'rear' | 'block'
export type NetworkView = 'physical' | 'logical' | 'service'

export type Selection =
  | { type: 'device'; ids: Id[] }
  | { type: 'component'; deviceId: Id; ids: Id[] }
  | { type: 'slot'; deviceId: Id; ownerId: Id | 'chassis'; slotId: Id }
  | { type: 'connection'; ids: Id[] }
  | { type: 'rack'; id: Id }
  | { type: 'vlan'; id: Id }
  | { type: 'group'; id: Id }

export type DragPayload =
  | { source: 'component-template'; templateId: string }
  | { source: 'device-template'; templateId: string }
  | { source: 'device'; deviceId: Id }

export interface Toast {
  id: number
  message: string
  level: 'info' | 'success' | 'warning' | 'error'
  action?: { label: string; run: () => void }
}

export type Clipboard =
  | { kind: 'components'; items: HardwareComponent[] }
  | { kind: 'devices'; items: Device[]; connections: Connection[] }
  | null

export interface HardwareSettings {
  snap: boolean
  grid: number
  guides: boolean
  showLinks: boolean
  showLabels: boolean
  explode: number
}

export interface NetworkOverlays {
  ip: boolean
  vlan: boolean
  ports: boolean
  speed: boolean
  zones: boolean
  snap: boolean
  minimap: boolean
}

interface UiState {
  view: AppView
  /** view to return to when the manual is closed */
  prevView?: Exclude<AppView, 'help'>
  /** manual section to scroll to (heading id) */
  helpSection?: { id: string; nonce: number }
  hardwareDeviceId?: Id
  hardwareView: HardwareView
  activeRackId?: Id
  rackFace: 'front' | 'rear'
  networkView: NetworkView
  selection: Selection | null
  hw: HardwareSettings
  net: NetworkOverlays
  drag: DragPayload | null
  focus: { type: 'device' | 'connection' | 'component' | 'rackDevice'; id: Id; nonce: number } | null
  theme: 'light' | 'dark'
  toasts: Toast[]
  clipboard: Clipboard
  inspectorOpen: boolean
  dialogs: { chassisPicker: boolean; customComponent: boolean; projects: boolean; shortcuts: boolean; welcome: boolean }
  set: (patch: Partial<UiState>) => void
  select: (s: Selection | null) => void
  setHw: (patch: Partial<HardwareSettings>) => void
  setNet: (patch: Partial<NetworkOverlays>) => void
  openDialog: (name: keyof UiState['dialogs'], open?: boolean) => void
}

function initialTheme(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem('np-theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* ignore */
  }
  // embedding hosts may stamp an explicit theme on the root element
  const stamped = typeof document !== 'undefined' ? document.documentElement.dataset.theme : undefined
  if (stamped === 'light' || stamped === 'dark') return stamped
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark'
  return 'light'
}

export const useUiStore = create<UiState>()((set) => ({
  view: 'overview',
  hardwareView: 'interior',
  rackFace: 'front',
  networkView: 'physical',
  selection: null,
  hw: { snap: true, grid: 5, guides: true, showLinks: true, showLabels: true, explode: 0.6 },
  net: { ip: true, vlan: true, ports: true, speed: true, zones: true, snap: true, minimap: true },
  drag: null,
  focus: null,
  theme: typeof window === 'undefined' ? 'light' : initialTheme(),
  toasts: [],
  clipboard: null,
  inspectorOpen: true,
  dialogs: { chassisPicker: false, customComponent: false, projects: false, shortcuts: false, welcome: false },
  set: (patch) => set(patch),
  select: (selection) => set({ selection }),
  setHw: (patch) => set((s) => ({ hw: { ...s.hw, ...patch } })),
  setNet: (patch) => set((s) => ({ net: { ...s.net, ...patch } })),
  openDialog: (name, open = true) => set((s) => ({ dialogs: { ...s.dialogs, [name]: open } })),
}))

let toastId = 0
export function toast(message: string, level: Toast['level'] = 'info', action?: Toast['action']) {
  const id = ++toastId
  useUiStore.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, level, action }] }))
  setTimeout(() => {
    useUiStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  }, level === 'error' || action ? 6000 : 3500)
}

export function dismissToast(id: number) {
  useUiStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}

export const ui = () => useUiStore.getState()
