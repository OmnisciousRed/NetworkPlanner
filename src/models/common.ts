export type Id = string

export interface Point {
  x: number
  y: number
}

export interface Size {
  w: number
  h: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

let counter = 0

/**
 * Collision-resistant id that also works in insecure browser contexts
 * (crypto.randomUUID is only available on https/localhost).
 */
export function uid(prefix = ''): string {
  counter = (counter + 1) % 0xffff
  const rand = Math.random().toString(36).slice(2, 10)
  const time = Date.now().toString(36).slice(-6)
  return `${prefix}${prefix ? '_' : ''}${time}${counter.toString(36)}${rand}`
}

export function nowIso(): string {
  return new Date().toISOString()
}
