import type { Point, Rect } from '@/models'

/** 2D affine matrix in SVG order: (x, y) -> (a*x + c*y + e, b*x + d*y + f) */
export type Mat = readonly [number, number, number, number, number, number]

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0]

/** Returns A·B (B is applied first). */
export function mul(A: Mat, B: Mat): Mat {
  return [
    A[0] * B[0] + A[2] * B[1],
    A[1] * B[0] + A[3] * B[1],
    A[0] * B[2] + A[2] * B[3],
    A[1] * B[2] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4],
    A[1] * B[4] + A[3] * B[5] + A[5],
  ]
}

export function translate(x: number, y: number): Mat {
  return [1, 0, 0, 1, x, y]
}

export function rotate(deg: number, cx = 0, cy = 0): Mat {
  if (!deg) return IDENTITY
  const r = (deg * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy]
}

export function apply(m: Mat, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] }
}

export function invert(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2]
  if (!det) return IDENTITY
  const a = m[3] / det
  const b = -m[1] / det
  const c = -m[2] / det
  const d = m[0] / det
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])]
}

export function toSvg(m: Mat): string {
  return `matrix(${m.map((v) => Math.round(v * 1000) / 1000).join(' ')})`
}

/** rotation angle (deg) contained in a matrix */
export function matRotation(m: Mat): number {
  return (Math.atan2(m[1], m[0]) * 180) / Math.PI
}

export function corners(m: Mat, w: number, h: number): Point[] {
  return [
    apply(m, { x: 0, y: 0 }),
    apply(m, { x: w, y: 0 }),
    apply(m, { x: w, y: h }),
    apply(m, { x: 0, y: h }),
  ]
}

export function aabbOf(points: Point[]): Rect {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function unionRect(rects: Rect[]): Rect | null {
  if (!rects.length) return null
  return aabbOf(rects.flatMap((r) => [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
  ]))
}

export function rectContains(r: Rect, p: Point, pad = 0): boolean {
  return p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/** point in (possibly rotated) rect described by matrix + size, with padding in local units */
export function pointInTransformedRect(m: Mat, w: number, h: number, p: Point, pad = 0): boolean {
  const local = apply(invert(m), p)
  return local.x >= -pad && local.x <= w + pad && local.y >= -pad && local.y <= h + pad
}

export function center(r: Rect): Point {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

export function snap(v: number, grid: number): number {
  return Math.round(v / grid) * grid
}

export function normalizeAngle(deg: number): number {
  let a = deg % 360
  if (a < 0) a += 360
  return Math.round(a * 100) / 100
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export interface GuideLine {
  axis: 'x' | 'y'
  pos: number
  from: number
  to: number
}

/**
 * Smart alignment: finds the smallest offset that aligns one of the moving box' edges/centre
 * with an edge/centre of a reference box. Returns delta corrections and guide lines.
 */
export function computeSnapGuides(
  moving: Rect,
  references: Rect[],
  threshold: number,
): { dx: number; dy: number; guides: GuideLine[] } {
  const mx = [moving.x, moving.x + moving.w / 2, moving.x + moving.w]
  const my = [moving.y, moving.y + moving.h / 2, moving.y + moving.h]
  let bestX: { d: number; pos: number; ref: Rect } | null = null
  let bestY: { d: number; pos: number; ref: Rect } | null = null
  for (const r of references) {
    const rx = [r.x, r.x + r.w / 2, r.x + r.w]
    const ry = [r.y, r.y + r.h / 2, r.y + r.h]
    for (const a of mx)
      for (const b of rx) {
        const d = b - a
        if (Math.abs(d) <= threshold && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, pos: b, ref: r }
      }
    for (const a of my)
      for (const b of ry) {
        const d = b - a
        if (Math.abs(d) <= threshold && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, pos: b, ref: r }
      }
  }
  const dx = bestX?.d ?? 0
  const dy = bestY?.d ?? 0
  const guides: GuideLine[] = []
  const moved = { x: moving.x + dx, y: moving.y + dy, w: moving.w, h: moving.h }
  if (bestX) {
    // all references aligned on that x
    const aligned = references.filter((r) => [r.x, r.x + r.w / 2, r.x + r.w].some((v) => Math.abs(v - bestX!.pos) < 0.5))
    const ys = [moved.y, moved.y + moved.h, ...aligned.flatMap((r) => [r.y, r.y + r.h])]
    guides.push({ axis: 'x', pos: bestX.pos, from: Math.min(...ys) - 10, to: Math.max(...ys) + 10 })
  }
  if (bestY) {
    const aligned = references.filter((r) => [r.y, r.y + r.h / 2, r.y + r.h].some((v) => Math.abs(v - bestY!.pos) < 0.5))
    const xs = [moved.x, moved.x + moved.w, ...aligned.flatMap((r) => [r.x, r.x + r.w])]
    guides.push({ axis: 'y', pos: bestY.pos, from: Math.min(...xs) - 10, to: Math.max(...xs) + 10 })
  }
  return { dx, dy, guides }
}
