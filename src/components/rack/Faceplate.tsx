import { memo } from 'react'
import type { ComponentOf, Device, HardwareComponent, NetworkInterface, Slot } from '@/models'
import { PANEL_MM, U_MM } from '@/models'
import { formatSpeed } from '@/models'
import { DEVICE_KINDS } from '@/data/deviceKinds'
import { formatCapacity } from '@/utils/buildSummary'
import { getDeviceHeightU, getDeviceRackStandard, isShelfDevice } from '@/utils/device'

/** width of the front panel (incl. ears) for a device: 482.6 mm for 19", 254 mm for 10" */
export function devicePanelWidth(device: Device): number {
  return PANEL_MM[getDeviceRackStandard(device)]
}

/** drawn width of a device in a rack: desktop devices stand on a shelf that spans the whole rack */
export function widthInRack(device: Device, rackPanelW: number): number {
  return isShelfDevice(device) ? rackPanelW : devicePanelWidth(device)
}

export const EAR = 15

function T({
  x,
  y,
  s,
  children,
  fill = '#e5e7eb',
  anchor = 'middle',
  weight = 600,
}: {
  x: number
  y: number
  s: number
  children: React.ReactNode
  fill?: string
  anchor?: 'start' | 'middle' | 'end'
  weight?: number
}) {
  return (
    <text x={x} y={y} fontSize={s} fill={fill} textAnchor={anchor} dominantBaseline="central" fontWeight={weight} fontFamily="Inter, system-ui, sans-serif" style={{ pointerEvents: 'none' }}>
      {children}
    </text>
  )
}

function Ears({ w, h, color = '#4b5563' }: { w: number; h: number; color?: string }) {
  return (
    <g>
      {[0, w - EAR].map((x) => (
        <g key={x}>
          <rect x={x} y={0} width={EAR} height={h} rx={1.5} fill={color} />
          {Array.from({ length: Math.max(1, Math.round(h / U_MM)) }, (_, i) => (
            <circle key={i} cx={x + EAR / 2} cy={i * U_MM + U_MM / 2} r={2.4} fill="#1f2937" stroke="#9ca3af" strokeWidth={0.6} />
          ))}
        </g>
      ))}
    </g>
  )
}

export interface PortHit {
  port: NetworkInterface
  x: number
  y: number
  w: number
  h: number
}

function RJ45({ x, y, w = 12, h = 10, active, poe, color }: { x: number; y: number; w?: number; h?: number; active?: boolean; poe?: boolean; color?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={0.8} fill="#0b0d10" stroke={color ?? (poe ? '#f59e0b' : '#4b5563')} strokeWidth={color ? 1.2 : 0.6} />
      <rect x={x + w * 0.3} y={y + h * 0.62} width={w * 0.4} height={h * 0.3} fill="#374151" />
      <circle cx={x + 1.8} cy={y + 1.8} r={0.9} fill={active ? '#22c55e' : '#374151'} />
      <circle cx={x + w - 1.8} cy={y + 1.8} r={0.9} fill={active ? '#f59e0b' : '#374151'} />
    </g>
  )
}

function SFP({ x, y, w = 14, h = 9, active, color }: { x: number; y: number; w?: number; h?: number; active?: boolean; color?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={0.6} fill="#9ca3af" stroke={color ?? '#6b7280'} strokeWidth={color ? 1.2 : 0.5} />
      <rect x={x + 1.4} y={y + 1.4} width={w - 2.8} height={h - 2.8} fill={active ? '#1f2937' : '#111827'} />
      {active && <rect x={x + 3} y={y + 2.4} width={w - 6} height={h - 4.8} rx={0.5} fill="#3b82f6" opacity={0.85} />}
    </g>
  )
}

export function PortGlyph({ p, x, y, active, color, scale = 1 }: { p: NetworkInterface; x: number; y: number; active?: boolean; color?: string; scale?: number }) {
  if (/SFP|QSFP/.test(p.connector)) return <SFP x={x} y={y} w={(p.connector.startsWith('QSFP') ? 18 : 14) * scale} h={9 * scale} active={active} color={color} />
  return <RJ45 x={x} y={y} w={12 * scale} h={10 * scale} active={active} poe={p.poe} color={color} />
}

/* ------------------------------------------------------------------ */
/* built devices                                                       */
/* ------------------------------------------------------------------ */

function bayFrontLayout(bays: Slot[], innerW: number, h: number) {
  // returns positions for bays on the front panel
  const b35 = bays.filter((b) => b.kind === 'bay-3.5')
  const b25 = bays.filter((b) => b.kind === 'bay-2.5')
  const out: { slot: Slot; x: number; y: number; w: number; h: number }[] = []
  let x = 0
  if (b35.length) {
    const cw = 101.6
    const ch = 26
    const cols = Math.max(1, Math.min(4, Math.floor(innerW / (cw + 2))))
    const rows = Math.ceil(b35.length / cols)
    const rowH = Math.min(ch, (h - 6) / rows - 1)
    b35.forEach((s, i) => {
      out.push({ slot: s, x: x + (i % cols) * (cw + 2), y: 3 + Math.floor(i / cols) * (rowH + 1), w: cw, h: rowH })
    })
    x += cols * (cw + 2) + 4
  }
  if (b25.length) {
    const vertical = h >= 74
    if (vertical) {
      const cw = 15
      const ch = Math.min(70, h - 6)
      const perRow = Math.max(1, Math.floor((innerW - x) / (cw + 1.5)))
      b25.forEach((s, i) => out.push({ slot: s, x: x + (i % perRow) * (cw + 1.5), y: 3 + Math.floor(i / perRow) * (ch + 2), w: cw, h: ch }))
    } else {
      const cw = 70
      const ch = Math.min(15, (h - 6) / 2 - 1)
      const cols = Math.max(1, Math.floor((innerW - x) / (cw + 2)))
      b25.forEach((s, i) => out.push({ slot: s, x: x + (i % cols) * (cw + 2), y: 3 + Math.floor(i / cols) * (ch + 1.5), w: cw, h: ch }))
    }
  }
  return out
}

function occupantOf(device: Device, slotId: string): HardwareComponent | undefined {
  return device.build?.components.find((c) => c.mount?.parentId === 'chassis' && c.mount.slotId === slotId)
}

function BuiltFront({ device, w, h }: { device: Device; w: number; h: number }) {
  const build = device.build!
  const innerX = EAR + 4
  const innerW = w - 2 * EAR - 8 - 40
  const bays = build.chassis.slots.filter((s) => s.kind === 'bay-3.5' || s.kind === 'bay-2.5')
  const layout = bayFrontLayout(bays, innerW, h)
  return (
    <g>
      <rect x={EAR} y={0} width={w - 2 * EAR} height={h} rx={1.5} fill="#2b3037" stroke="#11151a" strokeWidth={0.6} />
      <Ears w={w} h={h} color="#374151" />
      <g transform={`translate(${innerX} 0)`}>
        {layout.map(({ slot, x, y, w: bw, h: bh }) => {
          const occ = occupantOf(device, slot.id) as ComponentOf<'storage'> | undefined
          const vertical = bh > bw
          return (
            <g key={slot.id}>
              <rect x={x} y={y} width={bw} height={bh} rx={1} fill={occ ? '#4b5563' : '#1f2329'} stroke="#0e1114" strokeWidth={0.5} />
              {occ ? (
                <>
                  <rect x={vertical ? x + 1 : x + bw - 12} y={vertical ? y + bh - 12 : y + 1} width={vertical ? bw - 2 : 11} height={vertical ? 11 : bh - 2} rx={0.8} fill="#9ca3af" />
                  <circle cx={vertical ? x + bw / 2 : x + 4} cy={vertical ? y + 4 : y + bh / 2} r={1.2} fill={occ.specs.formFactor === 'U.2' ? '#60a5fa' : '#22c55e'} />
                  {!vertical && bh >= 8 && (
                    <T x={x + (bw - 12) / 2 + 4} y={y + bh / 2} s={Math.min(6, bh * 0.5)} fill="#e5e7eb">
                      {formatCapacity(occ.specs.capacityGB)}
                    </T>
                  )}
                </>
              ) : (
                Array.from({ length: vertical ? Math.floor(bh / 5) : Math.floor(bw / 5) }, (_, i) =>
                  vertical ? (
                    <rect key={i} x={x + 4} y={y + 3 + i * 5} width={bw - 8} height={2} rx={1} fill="#111418" />
                  ) : (
                    <rect key={i} x={x + 3 + i * 5} y={y + 4} width={2} height={bh - 8} rx={1} fill="#111418" />
                  ),
                )
              )}
            </g>
          )
        })}
        {!layout.length && <rect x={0} y={4} width={innerW} height={h - 8} fill="url(#np-vent)" opacity={0.6} />}
      </g>
      {/* control panel */}
      <g transform={`translate(${w - EAR - 38} 0)`}>
        <rect x={0} y={2} width={34} height={h - 4} rx={1} fill="#1f2329" />
        <circle cx={10} cy={Math.min(h / 2, 12)} r={4} fill="#111" stroke="#6b7280" strokeWidth={0.8} />
        <circle cx={10} cy={Math.min(h / 2, 12)} r={1.3} fill="#22c55e" />
        <rect x={20} y={Math.min(h / 2, 12) - 3} width={9} height={6} rx={0.5} fill="#0b0d10" stroke="#4b5563" strokeWidth={0.5} />
        {h > 40 && <T x={17} y={h - 10} s={5.5} fill="#9ca3af">{DEVICE_KINDS[device.kind].label.toUpperCase()}</T>}
      </g>
      <rect x={EAR + 2} y={h - 7} width={Math.min(120, device.name.length * 3.6 + 10)} height={6} rx={1} fill="#f3f4f6" opacity={0.9} />
      <T x={EAR + 7} y={h - 4} s={4.4} fill="#111827" anchor="start" weight={700}>
        {device.name}
      </T>
    </g>
  )
}

function BuiltRear({ device, w, h, activePorts, portColor }: { device: Device; w: number; h: number; activePorts?: Set<string>; portColor?: (p: NetworkInterface) => string | undefined }) {
  const build = device.build!
  const psus = build.components.filter((c): c is ComponentOf<'psu'> => c.kind === 'psu' && c.mount?.parentId === 'chassis')
  const psuBays = build.chassis.slots.filter((s) => s.kind === 'psu')
  const board = build.components.find((c): c is ComponentOf<'mainboard'> => c.kind === 'mainboard' && !!c.mount)
  const cards = board ? build.components.filter((c) => c.mount?.parentId === board.id && board.slots?.find((s) => s.id === c.mount!.slotId)?.kind === 'pcie') : []
  const pcieSlots = board?.slots?.filter((s) => s.kind === 'pcie') ?? []
  const stackPsu = h > 60
  const psuW = 74
  const psuH = stackPsu ? Math.min(40, (h - 6) / 2 - 1) : h - 6
  let x = EAR + 4
  const items: React.ReactNode[] = []
  // PSUs on the left (rear view)
  psuBays.forEach((bay, i) => {
    const psu = psus.find((p) => p.mount?.slotId === bay.id)
    const px = stackPsu ? x : x + i * (psuW + 3)
    const py = stackPsu ? 3 + i * (psuH + 2) : 3
    items.push(
      <g key={bay.id}>
        <rect x={px} y={py} width={psuW} height={psuH} rx={1.2} fill={psu ? '#374151' : '#1f2329'} stroke="#0e1114" strokeWidth={0.5} />
        {psu ? (
          <>
            <circle cx={px + psuH / 2 + 2} cy={py + psuH / 2} r={psuH * 0.38} fill="url(#np-grille)" stroke="#6b7280" strokeWidth={0.5} />
            <rect x={px + psuW - 20} y={py + psuH / 2 - 5} width={12} height={10} rx={1.5} fill="#0b0d10" stroke="#9ca3af" strokeWidth={0.5} />
            <rect x={px + psuW - 5} y={py + 3} width={3} height={psuH - 6} rx={1} fill="#9ca3af" />
            <circle cx={px + psuW - 24} cy={py + 3.5} r={1.1} fill="#22c55e" />
            <T x={px + psuW / 2 + 4} y={py + psuH - 5} s={4} fill="#d1d5db">{`${psu.specs.watts}W`}</T>
          </>
        ) : (
          <T x={px + psuW / 2} y={py + psuH / 2} s={4.5} fill="#6b7280">leer</T>
        )}
      </g>,
    )
  })
  x += (stackPsu ? psuW : psuBays.length * (psuW + 3)) + 6
  // onboard I/O
  if (board) {
    const ports = board.ports ?? []
    items.push(
      <g key="io">
        <rect x={x} y={3} width={Math.max(40, ports.length * 15 + 32)} height={h - 6} rx={1} fill="#9ca3af" stroke="#6b7280" strokeWidth={0.5} />
        {ports.map((p, i) => (
          <g key={p.id} data-port-id={p.id}>
            <PortGlyph p={p} x={x + 3 + i * 15} y={h / 2 - 5} active={activePorts?.has(p.id)} color={portColor?.(p)} />
            <T x={x + 9 + i * 15} y={h / 2 + 9} s={3.6} fill="#111827">{p.name.replace('LAN ', 'L')}</T>
            <title>{`${p.name} – ${formatSpeed(p.speed)} ${p.connector}`}</title>
          </g>
        ))}
        {/* USB + VGA */}
        <rect x={x + ports.length * 15 + 5} y={h / 2 - 7} width={6} height={4} fill="#1d4ed8" />
        <rect x={x + ports.length * 15 + 5} y={h / 2 - 1} width={6} height={4} fill="#1d4ed8" />
        <rect x={x + ports.length * 15 + 14} y={h / 2 - 5} width={14} height={7} rx={2} fill="#1e3a8a" />
      </g>,
    )
    x += Math.max(40, ports.length * 15 + 32) + 6
  }
  // PCIe brackets
  const bw = 17
  const slotCount = Math.max(pcieSlots.length, build.chassis.params.expansionSlots > 0 ? Math.min(build.chassis.params.expansionSlots, pcieSlots.length || 2) : 0)
  for (let i = 0; i < slotCount; i++) {
    const slot = pcieSlots[i]
    const card = slot ? cards.find((c) => c.mount?.slotId === slot.id) : undefined
    const bx = x + i * (bw + 2)
    const bh = h - 6
    items.push(
      <g key={`pcie-${i}`}>
        <rect x={bx} y={3} width={bw} height={bh} rx={0.8} fill={card ? '#a3aab3' : '#6b7280'} stroke="#4b5563" strokeWidth={0.5} />
        {!card && Array.from({ length: Math.floor(bh / 6) }, (_, k) => <rect key={k} x={bx + 4} y={6 + k * 6} width={bw - 8} height={2.4} rx={1} fill="#4b5563" />)}
        {card?.kind === 'nic' &&
          (card.ports ?? []).map((p, k) => (
            <g key={p.id} data-port-id={p.id}>
              {/SFP|QSFP/.test(p.connector) ? (
                <SFP x={bx + 1.5} y={6 + k * 12} w={bw - 3} h={9} active={activePorts?.has(p.id)} color={portColor?.(p)} />
              ) : (
                <RJ45 x={bx + 2.5} y={6 + k * 13} w={bw - 5} h={10} active={activePorts?.has(p.id)} color={portColor?.(p)} />
              )}
              <title>{`${p.name} – ${formatSpeed(p.speed)} ${p.connector}`}</title>
            </g>
          ))}
        {card?.kind === 'gpu' && [0, 1, 2].map((k) => <rect key={k} x={bx + 4} y={8 + k * 10} width={bw - 8} height={6} rx={0.8} fill="#111827" />)}
        {(card?.kind === 'hba' || card?.kind === 'raid' || card?.kind === 'pcie') && (
          <T x={bx + bw / 2} y={bh / 2 + 3} s={3.6} fill="#1f2937">{card.kind.toUpperCase()}</T>
        )}
      </g>,
    )
  }
  return (
    <g>
      <rect x={EAR} y={0} width={w - 2 * EAR} height={h} rx={1.5} fill="#30363e" stroke="#11151a" strokeWidth={0.6} />
      <rect x={EAR} y={0} width={4} height={h} fill="#1f2329" />
      {items}
    </g>
  )
}

/* ------------------------------------------------------------------ */
/* template devices                                                    */
/* ------------------------------------------------------------------ */

function SwitchFront({ device, w, h, activePorts, portColor }: { device: Device; w: number; h: number; activePorts?: Set<string>; portColor?: (p: NetworkInterface) => string | undefined }) {
  const copper = device.ports.filter((p) => p.connector === 'RJ45')
  const fiber = device.ports.filter((p) => /SFP|QSFP/.test(p.connector))
  const rows = h > 50 ? 4 : 2
  const cols = Math.ceil(copper.length / rows)
  const pw = 12.5
  const startX = EAR + 60
  const color = device.kind === 'poe-switch' ? '#1e293b' : device.kind === 'firewall' ? '#3f1d1d' : '#1f2937'
  const fiberCols = Math.ceil(fiber.length / 2)
  return (
    <g>
      <rect x={EAR} y={0} width={w - 2 * EAR} height={h} rx={1.5} fill={color} stroke="#0b0d10" strokeWidth={0.6} />
      <Ears w={w} h={h} color="#4b5563" />
      <T x={EAR + 6} y={h / 2 - 5} s={6} fill="#f3f4f6" anchor="start" weight={800}>
        {(device.manufacturer ?? DEVICE_KINDS[device.kind].label).toUpperCase().slice(0, 12)}
      </T>
      <T x={EAR + 6} y={h / 2 + 5} s={4.4} fill="#9ca3af" anchor="start" weight={500}>
        {device.name.slice(0, 16)}
      </T>
      {copper.map((p, i) => {
        const col = Math.floor(i / rows)
        const row = i % rows
        const x = startX + col * (pw + 1.2) + Math.floor(col / 6) * 4
        const y = (h - rows * 11.5) / 2 + row * 11.5
        return (
          <g key={p.id} data-port-id={p.id}>
            <RJ45 x={x} y={y} w={pw} h={10} active={activePorts?.has(p.id)} poe={p.poe} color={portColor?.(p)} />
            <title>{`${p.name} – ${formatSpeed(p.speed)}${p.poe ? ' PoE' : ''}`}</title>
          </g>
        )
      })}
      {fiber.map((p, i) => {
        const col = Math.floor(i / 2)
        const row = i % 2
        const fx = startX + cols * (pw + 1.2) + Math.floor(cols / 6) * 4 + 8 + col * 17
        const y = h / 2 - 11 + row * 12
        return (
          <g key={p.id} data-port-id={p.id}>
            <SFP x={fx} y={y} w={p.connector.startsWith('QSFP') ? 18 : 15} h={10} active={activePorts?.has(p.id)} color={portColor?.(p)} />
            <title>{`${p.name} – ${formatSpeed(p.speed)} ${p.connector}`}</title>
          </g>
        )
      })}
      {/* status LEDs */}
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={w - EAR - 10} cy={h / 2 - 8 + i * 8} r={1.3} fill={i === 0 ? '#22c55e' : '#374151'} />
      ))}
      <rect x={startX + cols * (pw + 1.2) + Math.floor(cols / 6) * 4 + 12 + fiberCols * 17} y={h / 2 - 4} width={10} height={8} rx={1} fill="#0b0d10" stroke="#60a5fa" strokeWidth={0.5} />
    </g>
  )
}

function PatchPanelFront({ device, w, h, activePorts }: { device: Device; w: number; h: number; activePorts?: Set<string> }) {
  const n = device.ports.length
  const rows = h > 50 ? 2 : 1
  const perRow = Math.ceil(n / rows)
  const pw = Math.min(15, (w - 2 * EAR - 20) / perRow - 1.5)
  return (
    <g>
      <rect x={EAR} y={0} width={w - 2 * EAR} height={h} rx={1.5} fill="#1f2328" stroke="#0b0d10" strokeWidth={0.6} />
      <Ears w={w} h={h} color="#374151" />
      {device.ports.map((p, i) => {
        const row = Math.floor(i / perRow)
        const col = i % perRow
        const x = EAR + 10 + col * (pw + 1.5) + Math.floor(col / 6) * 2
        const y = rows === 1 ? h / 2 - 7 : 6 + row * (h / 2)
        return (
          <g key={p.id} data-port-id={p.id}>
            <rect x={x} y={y} width={pw} height={11} rx={0.8} fill="#e5e7eb" />
            <rect x={x + 2} y={y + 2} width={pw - 4} height={7} rx={0.5} fill={activePorts?.has(p.id) ? '#1d4ed8' : '#111827'} />
            <T x={x + pw / 2} y={y + 15} s={3.4} fill="#9ca3af">{i + 1}</T>
          </g>
        )
      })}
    </g>
  )
}

function UpsFront({ device, w, h }: { device: Device; w: number; h: number }) {
  return (
    <g>
      <rect x={EAR} y={0} width={w - 2 * EAR} height={h} rx={1.5} fill="#16181c" stroke="#000" strokeWidth={0.6} />
      <Ears w={w} h={h} color="#2b2f36" />
      <rect x={EAR + 8} y={6} width={w - 2 * EAR - 120} height={h - 12} fill="url(#np-vent)" opacity={0.8} />
      <rect x={w - EAR - 100} y={h / 2 - 12} width={46} height={24} rx={2} fill="#0f2a1d" stroke="#374151" strokeWidth={0.6} />
      <T x={w - EAR - 77} y={h / 2 - 4} s={5} fill="#4ade80">{`${device.ups?.capacityVA ?? ''} VA`}</T>
      <T x={w - EAR - 77} y={h / 2 + 5} s={4} fill="#86efac">ONLINE</T>
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={w - EAR - 42 + i * 10} cy={h / 2} r={3} fill="#1f2937" stroke="#6b7280" strokeWidth={0.6} />
      ))}
      <T x={EAR + 14} y={h - 6} s={5} fill="#9ca3af" anchor="start" weight={700}>{device.name}</T>
    </g>
  )
}

function PduFront({ device, w, h }: { device: Device; w: number; h: number }) {
  const n = device.pdu?.outlets ?? 8
  return (
    <g>
      <rect x={EAR} y={0} width={w - 2 * EAR} height={h} rx={1.5} fill="#111317" stroke="#000" strokeWidth={0.6} />
      <Ears w={w} h={h} color="#2b2f36" />
      <rect x={EAR + 8} y={h / 2 - 8} width={26} height={16} rx={1} fill="#1f2937" />
      <T x={EAR + 21} y={h / 2} s={6} fill="#f87171">{(device.pdu?.maxW ?? 0) >= 3000 ? '16A' : '10A'}</T>
      {Array.from({ length: n }, (_, i) => (
        <g key={i} transform={`translate(${EAR + 50 + i * ((w - 2 * EAR - 70) / n)} ${h / 2 - 7})`}>
          <path d="M0 2 L2 0 H14 L16 2 V14 H0 Z" fill="#0b0d10" stroke="#4b5563" strokeWidth={0.6} />
          <rect x={4} y={5} width={2} height={5} fill="#374151" />
          <rect x={10} y={5} width={2} height={5} fill="#374151" />
        </g>
      ))}
    </g>
  )
}

function GenericFront({ device, w, h }: { device: Device; w: number; h: number }) {
  const kind = device.kind
  if (kind === 'blank-panel')
    return (
      <g>
        <rect x={0} y={0} width={w} height={h} rx={1.5} fill="#27272a" stroke="#0b0d10" strokeWidth={0.5} />
        {[6, w - 6].map((x) => Array.from({ length: Math.round(h / U_MM) }, (_, i) => <circle key={`${x}${i}`} cx={x} cy={i * U_MM + U_MM / 2} r={2} fill="#52525b" />))}
      </g>
    )
  if (kind === 'shelf')
    return (
      <g>
        <rect x={EAR} y={h - 6} width={w - 2 * EAR} height={6} fill="#52525b" />
        <rect x={EAR} y={0} width={4} height={h} fill="#3f3f46" />
        <rect x={w - EAR - 4} y={0} width={4} height={h} fill="#3f3f46" />
        <Ears w={w} h={h} color="#3f3f46" />
        <T x={w / 2} y={h / 2} s={6} fill="var(--label-muted)">{device.name}</T>
      </g>
    )
  if (kind === 'cable-management')
    return (
      <g>
        <rect x={EAR} y={0} width={w - 2 * EAR} height={h} rx={1.5} fill="#18181b" />
        <Ears w={w} h={h} color="#27272a" />
        {Array.from({ length: 5 }, (_, i) => (
          <path key={i} d={`M${EAR + 20 + i * ((w - 2 * EAR - 40) / 4) - 12} ${h - 6} v-${h - 16} a12 6 0 0 1 24 0 v${h - 16}`} fill="none" stroke="#71717a" strokeWidth={2} />
        ))}
      </g>
    )
  const hU = Math.max(1, Math.round(h / U_MM))
  return (
    <g>
      <rect x={EAR} y={0} width={w - 2 * EAR} height={h} rx={1.5} fill="#2b3037" stroke="#11151a" strokeWidth={0.6} />
      <Ears w={w} h={h} color="#374151" />
      {(kind === 'nas' || kind === 'storage' || kind === 'server') &&
        Array.from({ length: kind === 'server' ? 8 : hU * 4 }, (_, i) => {
          const cols = kind === 'server' ? 8 : 4
          const cw = kind === 'server' ? 18 : Math.min(90, (w - 2 * EAR - 20) / cols - 3)
          const ch = kind === 'server' ? h - 10 : (h - 8) / hU - 2
          return <rect key={i} x={EAR + 8 + (i % cols) * (cw + 3)} y={4 + Math.floor(i / cols) * (ch + 2)} width={cw} height={ch} rx={1} fill="#4b5563" stroke="#1f2937" strokeWidth={0.5} />
        })}
      {device.ports.slice(0, 8).map((p, i) => (
        <g key={p.id} data-port-id={p.id}>
          <PortGlyph p={p} x={w - EAR - 30 - i * 16} y={h / 2 - 5} />
        </g>
      ))}
      <T x={w / 2} y={h / 2} s={Math.min(8, h * 0.28)} fill="#e5e7eb">
        {device.name}
      </T>
    </g>
  )
}

function GenericRear({ device, w, h }: { device: Device; w: number; h: number }) {
  if (device.kind === 'blank-panel' || device.kind === 'shelf' || device.kind === 'cable-management') return <GenericFront device={device} w={w} h={h} />
  if (device.kind === 'patch-panel')
    return (
      <g>
        <rect x={EAR} y={0} width={w - 2 * EAR} height={h} fill="#1f2328" />
        {device.ports.map((p, i) => (
          <rect key={p.id} x={EAR + 10 + (i % 24) * 18} y={h / 2 - 4 + Math.floor(i / 24) * 12} width={14} height={8} rx={1} fill="#3b82f6" opacity={0.6} />
        ))}
      </g>
    )
  return (
    <g>
      <rect x={EAR} y={0} width={w - 2 * EAR} height={h} rx={1.5} fill="#30363e" stroke="#11151a" strokeWidth={0.6} />
      <rect x={EAR + 8} y={4} width={w * 0.45} height={h - 8} fill="url(#np-vent)" opacity={0.7} />
      <rect x={w - EAR - 90} y={h / 2 - 8} width={40} height={16} rx={1} fill="#374151" />
      <rect x={w - EAR - 44} y={h / 2 - 5} width={12} height={10} rx={1.5} fill="#0b0d10" stroke="#9ca3af" strokeWidth={0.5} />
      {device.kind === 'ups' &&
        Array.from({ length: 6 }, (_, i) => <rect key={i} x={EAR + 20 + i * 22} y={h / 2 - 7} width={16} height={14} rx={1.5} fill="#0b0d10" stroke="#4b5563" strokeWidth={0.6} />)}
    </g>
  )
}


/** desktop device (mini PC, Raspberry Pi, desktop NAS) standing on a rack shelf */
function ShelfDevice({ device, w, h, face }: { device: Device; w: number; h: number; face: 'front' | 'rear' }) {
  const bodyW = Math.min(device.widthMm ?? 160, w - 2 * EAR - 8)
  const bodyH = Math.max(8, h - 9)
  const x = EAR + 4
  const kind = device.kind
  const body =
    kind === 'raspberry-pi' ? '#1f7a4d' : kind === 'nas' ? '#1f2328' : kind === 'mini-pc' ? '#2b2f36' : '#374151'
  return (
    <g>
      {/* shelf */}
      <rect x={EAR} y={h - 4} width={w - 2 * EAR} height={4} fill="#52525b" />
      <rect x={0} y={h - 10} width={EAR} height={10} rx={1} fill="#3f3f46" />
      <rect x={w - EAR} y={h - 10} width={EAR} height={10} rx={1} fill="#3f3f46" />
      {/* device body */}
      <rect x={x} y={h - 4 - bodyH} width={bodyW} height={bodyH} rx={3} fill={body} stroke="#0b0d10" strokeWidth={0.6} />
      {face === 'front' ? (
        <>
          {kind === 'nas' &&
            Array.from({ length: 4 }, (_, i) => (
              <rect key={i} x={x + 6 + i * ((bodyW - 12) / 4)} y={h - 4 - bodyH + 6} width={(bodyW - 12) / 4 - 3} height={bodyH - 12} rx={1.5} fill="#3f4652" stroke="#111" strokeWidth={0.4} />
            ))}
          {kind !== 'nas' && <circle cx={x + bodyW - 8} cy={h - 4 - bodyH / 2} r={2.2} fill="#111" stroke="#9ca3af" strokeWidth={0.5} />}
          {kind !== 'nas' && <circle cx={x + bodyW - 8} cy={h - 4 - bodyH / 2} r={0.9} fill="#22c55e" />}
          {kind === 'mini-pc' && [0, 1].map((i) => <rect key={i} x={x + 8 + i * 9} y={h - 4 - bodyH / 2 - 2} width={6} height={3.5} rx={0.5} fill="#1d4ed8" />)}
        </>
      ) : (
        device.ports
          .filter((p) => p.connector !== 'WiFi')
          .slice(0, 6)
          .map((p, i) => (
            <g key={p.id} data-port-id={p.id}>
              <PortGlyph p={p} x={x + 6 + i * 15} y={h - 4 - bodyH / 2 - 5} />
            </g>
          ))
      )}
      <T x={x + bodyW + 8} y={h - 4 - bodyH / 2} s={Math.min(8, Math.max(5, bodyH * 0.3))} fill="#e5e7eb" anchor="start">
        {device.name}
      </T>
    </g>
  )
}

/* ------------------------------------------------------------------ */
/* public                                                              */
/* ------------------------------------------------------------------ */

export const DeviceFaceplate = memo(function DeviceFaceplate({
  device,
  face,
  activePorts,
  portColor,
  shelfWidth,
}: {
  device: Device
  face: 'front' | 'rear'
  activePorts?: Set<string>
  portColor?: (p: NetworkInterface) => string | undefined
  /** width of the shelf a desktop device stands on (defaults to its own panel width) */
  shelfWidth?: number
}) {
  const hU = getDeviceHeightU(device) ?? 1
  const w = devicePanelWidth(device)
  const h = hU * U_MM - 0.8
  if (isShelfDevice(device)) return <ShelfDevice device={device} w={shelfWidth ?? w} h={h} face={face} />
  if (device.build && device.build.chassis.params.formFactor === 'rack') {
    return face === 'front' ? <BuiltFront device={device} w={w} h={h} /> : <BuiltRear device={device} w={w} h={h} activePorts={activePorts} portColor={portColor} />
  }
  if (face === 'rear') return <GenericRear device={device} w={w} h={h} />
  switch (device.kind) {
    case 'switch':
    case 'managed-switch':
    case 'poe-switch':
    case 'firewall':
    case 'router':
    case 'gateway':
      return <SwitchFront device={device} w={w} h={h} activePorts={activePorts} portColor={portColor} />
    case 'patch-panel':
      return <PatchPanelFront device={device} w={w} h={h} activePorts={activePorts} />
    case 'ups':
      return <UpsFront device={device} w={w} h={h} />
    case 'pdu':
      return <PduFront device={device} w={w} h={h} />
    default:
      return <GenericFront device={device} w={w} h={h} />
  }
})

/** front / rear view of a tower chassis */
export function TowerFace({ device, face }: { device: Device; face: 'front' | 'rear' }) {
  const build = device.build!
  const W = 220
  const H = 470
  const psu = build.components.find((c) => c.kind === 'psu' && c.mount)
  const board = build.components.find((c): c is ComponentOf<'mainboard'> => c.kind === 'mainboard' && !!c.mount)
  const cards = board ? build.components.filter((c) => c.mount?.parentId === board.id && board.slots?.find((s) => s.id === c.mount!.slotId)?.kind === 'pcie') : []
  if (face === 'front')
    return (
      <g>
        <rect x={0} y={0} width={W} height={H} rx={8} fill="#1f2329" stroke="#0b0d10" strokeWidth={1} />
        <rect x={16} y={60} width={W - 32} height={H - 90} rx={4} fill="url(#np-vent)" opacity={0.8} />
        <circle cx={W / 2} cy={30} r={9} fill="#111" stroke="#6b7280" strokeWidth={1.2} />
        <circle cx={W / 2} cy={30} r={3} fill="#22c55e" />
        <rect x={W / 2 + 20} y={25} width={10} height={6} rx={1} fill="#1d4ed8" />
        <rect x={W / 2 - 30} y={25} width={10} height={6} rx={1} fill="#1d4ed8" />
        <T x={W / 2} y={H - 14} s={9} fill="#9ca3af">{device.name}</T>
      </g>
    )
  return (
    <g>
      <rect x={0} y={0} width={W} height={H} rx={8} fill="#2b3037" stroke="#0b0d10" strokeWidth={1} />
      {board && (
        <g>
          <rect x={20} y={20} width={60} height={160} rx={2} fill="#9ca3af" />
          {(board.ports ?? []).map((p, i) => (
            <g key={p.id} data-port-id={p.id}>
              <PortGlyph p={p} x={28} y={30 + i * 18} scale={1.4} />
              <title>{p.name}</title>
            </g>
          ))}
        </g>
      )}
      <circle cx={150} cy={80} r={50} fill="url(#np-grille)" stroke="#6b7280" strokeWidth={1} />
      {Array.from({ length: build.chassis.params.expansionSlots }, (_, i) => {
        const card = cards[i]
        return (
          <g key={i}>
            <rect x={20} y={200 + i * 20} width={120} height={16} rx={1} fill={card ? '#a3aab3' : '#6b7280'} />
            {card?.kind === 'nic' &&
              (card.ports ?? []).map((p, k) => (
                <g key={p.id} data-port-id={p.id}>
                  <PortGlyph p={p} x={30 + k * 22} y={202 + i * 20} />
                </g>
              ))}
          </g>
        )
      })}
      {psu && (
        <g>
          <rect x={20} y={H - 110} width={180} height={90} rx={3} fill="#1f2329" />
          <circle cx={80} cy={H - 65} r={36} fill="url(#np-grille)" stroke="#6b7280" />
          <rect x={150} y={H - 80} width={24} height={18} rx={3} fill="#0b0d10" stroke="#9ca3af" />
        </g>
      )}
    </g>
  )
}

