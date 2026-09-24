import { useCallback, useEffect, useRef, useState } from 'react'
import type { Point, Rect } from '@/models'

export interface Viewport {
  x: number
  y: number
  zoom: number
}

export function useViewport(opts: { minZoom?: number; maxZoom?: number; initialZoom?: number } = {}) {
  const minZoom = opts.minZoom ?? 0.15
  const maxZoom = opts.maxZoom ?? 8
  const [vp, setVp] = useState<Viewport>({ x: 40, y: 40, zoom: opts.initialZoom ?? 1 })
  const ref = useRef<HTMLDivElement | null>(null)
  const vpRef = useRef(vp)
  vpRef.current = vp

  const screenToWorld = useCallback((clientX: number, clientY: number): Point => {
    const el = ref.current
    const r = el?.getBoundingClientRect()
    const v = vpRef.current
    return { x: (clientX - (r?.left ?? 0) - v.x) / v.zoom, y: (clientY - (r?.top ?? 0) - v.y) / v.zoom }
  }, [])

  const zoomAt = useCallback(
    (factor: number, clientX?: number, clientY?: number) => {
      const el = ref.current
      const r = el?.getBoundingClientRect()
      setVp((v) => {
        const zoom = Math.min(maxZoom, Math.max(minZoom, v.zoom * factor))
        const cx = clientX !== undefined && r ? clientX - r.left : (r?.width ?? 800) / 2
        const cy = clientY !== undefined && r ? clientY - r.top : (r?.height ?? 600) / 2
        const wx = (cx - v.x) / v.zoom
        const wy = (cy - v.y) / v.zoom
        return { zoom, x: cx - wx * zoom, y: cy - wy * zoom }
      })
    },
    [minZoom, maxZoom],
  )

  const fit = useCallback(
    (rect: Rect, padding = 48) => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) return
      const zoom = Math.min(maxZoom, Math.max(minZoom, Math.min((r.width - padding * 2) / rect.w, (r.height - padding * 2) / rect.h)))
      setVp({ zoom, x: (r.width - rect.w * zoom) / 2 - rect.x * zoom, y: (r.height - rect.h * zoom) / 2 - rect.y * zoom })
    },
    [minZoom, maxZoom],
  )

  const centerOn = useCallback((p: Point, zoom?: number) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setVp((v) => {
      const z = zoom ?? v.zoom
      return { zoom: z, x: r.width / 2 - p.x * z, y: r.height / 2 - p.y * z }
    })
  }, [])

  // wheel: zoom (pinch / ctrl / plain wheel), shift+wheel pans horizontally, trackpad two-finger pans
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const isTrackpadPan = !e.ctrlKey && Math.abs(e.deltaX) > 0 && e.deltaMode === 0 && Math.abs(e.deltaY) < 50
      if (e.shiftKey || isTrackpadPan) {
        setVp((v) => ({ ...v, x: v.x - (e.shiftKey ? e.deltaY : e.deltaX), y: v.y - (e.shiftKey ? 0 : e.deltaY) }))
        return
      }
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))
      zoomAt(factor, e.clientX, e.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  return { vp, setVp, ref, screenToWorld, zoomAt, fit, centerOn }
}
