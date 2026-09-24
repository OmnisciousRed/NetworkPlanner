import { useEffect, useMemo } from 'react'
import type { Device } from '@/models'
import { U_MM } from '@/models'
import { HardwareDefs } from '@/components/hardware/graphics'
import { DeviceFaceplate, TowerFace, devicePanelWidth } from '@/components/rack/Faceplate'
import { useProjectStore } from '@/store/projectStore'
import { connectionsOfDevice, getDeviceHeightU } from '@/utils/device'
import { useViewport } from '../useViewport'
import { PortOverview } from '@/components/inspector/PortOverview'

export function FaceView({ device, face }: { device: Device; face: 'front' | 'rear' }) {
  const project = useProjectStore((s) => s.project)
  const { vp, ref, fit } = useViewport({ minZoom: 0.2, maxZoom: 8 })
  const tower = device.build?.chassis.params.formFactor === 'tower'
  const hU = getDeviceHeightU(device) ?? 1
  const w = tower ? 220 : devicePanelWidth(device)
  const h = tower ? 470 : hU * U_MM

  const active = useMemo(() => {
    const set = new Set<string>()
    for (const c of connectionsOfDevice(project, device.id)) {
      for (const end of [c.a, c.b]) if (end.deviceId === device.id && end.portId) set.add(end.portId)
    }
    return set
  }, [project, device.id])

  useEffect(() => {
    const t = requestAnimationFrame(() => fit({ x: -20, y: -30, w: w + 40, h: h + 60 }, 40))
    return () => cancelAnimationFrame(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.id, face, w, h])

  return (
    <div className="flex h-full w-full flex-col">
      <div ref={ref} className="relative min-h-0 flex-1 overflow-hidden bg-canvas">
        <svg className="absolute inset-0 h-full w-full">
          <HardwareDefs />
          <g transform={`translate(${vp.x} ${vp.y}) scale(${vp.zoom})`}>
            <text x={0} y={-14} fontSize={11} fontWeight={700} fill="var(--label)">
              {face === 'front' ? 'FRONT' : 'RÜCKSEITE'} · {device.name}
            </text>
            {tower ? <TowerFace device={device} face={face} /> : <DeviceFaceplate device={device} face={face} activePorts={active} />}
          </g>
        </svg>
      </div>
      {face === 'rear' && (
        <div className="max-h-[40%] overflow-auto border-t bg-card p-3 scroll-thin">
          <PortOverview device={device} compact />
        </div>
      )}
    </div>
  )
}
