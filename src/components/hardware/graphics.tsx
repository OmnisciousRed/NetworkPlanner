import { memo } from 'react'
import type { Chassis, ComponentOf, HardwareComponent, Slot } from '@/models'
import { formatSpeed } from '@/models'
import { formatCapacity } from '@/utils/buildSummary'
import { COMPONENT_KIND_LABELS } from '../icons'

/* ------------------------------------------------------------------ */
/* shared defs                                                         */
/* ------------------------------------------------------------------ */

export function HardwareDefs() {
  return (
    <defs>
      <linearGradient id="np-ihs" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#e3e7ec" />
        <stop offset="0.55" stopColor="#b9c0c9" />
        <stop offset="1" stopColor="#8f98a4" />
      </linearGradient>
      <linearGradient id="np-alu" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#cfd5dc" />
        <stop offset="1" stopColor="#a4acb6" />
      </linearGradient>
      <linearGradient id="np-dark" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3b414b" />
        <stop offset="1" stopColor="#252a31" />
      </linearGradient>
      <linearGradient id="np-pcb" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#1f5a45" />
        <stop offset="1" stopColor="#163f33" />
      </linearGradient>
      <linearGradient id="np-card" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#23734d" />
        <stop offset="1" stopColor="#185739" />
      </linearGradient>
      <pattern id="np-pins" width="3" height="3" patternUnits="userSpaceOnUse">
        <circle cx="1.5" cy="1.5" r="0.55" fill="#c9a84a" />
      </pattern>
      <pattern id="np-grille" width="4" height="4" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1.05" fill="#15181d" />
      </pattern>
      <pattern id="np-vent" width="3" height="6" patternUnits="userSpaceOnUse">
        <rect x="0.6" y="0.8" width="1.6" height="4.4" rx="0.8" fill="#15181d" />
      </pattern>
      <pattern id="np-traces" width="24" height="24" patternUnits="userSpaceOnUse">
        <path d="M0 6 H10 L14 10 H24 M4 18 H12 L16 14 H24 M18 0 V4 M6 24 V20" stroke="#2c7a5e" strokeWidth="0.6" fill="none" opacity="0.55" />
      </pattern>
      <filter id="np-shadow" x="-10%" y="-10%" width="130%" height="130%">
        <feDropShadow dx="0" dy="1.2" stdDeviation="1.4" floodColor="#000" floodOpacity="0.35" />
      </filter>
    </defs>
  )
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function Label({
  x,
  y,
  text,
  size,
  fill = '#e8edf3',
  anchor = 'middle',
  weight = 600,
  maxChars,
}: {
  x: number
  y: number
  text: string
  size: number
  fill?: string
  anchor?: 'start' | 'middle' | 'end'
  weight?: number
  maxChars?: number
}) {
  const t = maxChars && text.length > maxChars ? `${text.slice(0, Math.max(1, maxChars - 1))}…` : text
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      fill={fill}
      textAnchor={anchor}
      dominantBaseline="central"
      fontWeight={weight}
      fontFamily="Inter, system-ui, sans-serif"
      style={{ pointerEvents: 'none' }}
    >
      {t}
    </text>
  )
}

function fitChars(width: number, size: number) {
  return Math.max(3, Math.floor(width / (size * 0.56)))
}

/* ------------------------------------------------------------------ */
/* component graphics                                                  */
/* ------------------------------------------------------------------ */

function RamGraphic({ c, w, h }: { c: ComponentOf<'ram'>; w: number; h: number }) {
  const ddr5 = c.specs.memoryType === 'DDR5'
  if (h < 16) {
    // standing in a slot – seen from above
    return (
      <g>
        <rect x={0} y={0} width={w} height={h} rx={1} fill={c.specs.registered ? '#2f343c' : '#1f6b44'} stroke="#0e1114" strokeWidth={0.5} />
        {Array.from({ length: 9 }, (_, i) => (
          <rect key={i} x={6 + i * ((w - 12) / 9)} y={h * 0.18} width={(w - 12) / 9 - 2} height={h * 0.64} rx={0.4} fill="#15181c" />
        ))}
        <rect x={0} y={h / 2 - 0.4} width={w} height={0.8} fill={ddr5 ? '#6ea8ff' : '#9fd68b'} opacity={0.5} />
      </g>
    )
  }
  const chips = 9
  const notch = ddr5 ? w * 0.5 : w * 0.43
  return (
    <g>
      <path
        d={`M1 0 H${w - 1} Q${w} 0 ${w} 1 V${h - 5} H${notch + 2} V${h - 2} H${notch - 2} V${h - 5} H0 V1 Q0 0 1 0 Z`}
        fill="#1f6b44"
        stroke="#0f3a26"
        strokeWidth={0.5}
      />
      {c.specs.registered && <rect x={w * 0.46} y={h * 0.18} width={w * 0.08} height={h * 0.34} rx={0.6} fill="#111" />}
      {Array.from({ length: chips }, (_, i) => {
        const cw = (w - 16) / chips
        if (c.specs.registered && i === 4) return null
        return <rect key={i} x={8 + i * cw + 1} y={h * 0.14} width={cw - 2} height={h * 0.42} rx={0.6} fill="#16191d" />
      })}
      {Array.from({ length: 36 }, (_, i) => (
        <rect key={i} x={4 + i * ((w - 8) / 36)} y={h - 4.6} width={(w - 8) / 36 - 1} height={4} fill="#d4a72c" />
      ))}
      <rect x={w * 0.62} y={h * 0.6} width={w * 0.3} height={h * 0.18} rx={0.8} fill="#eef1f4" />
      <Label x={w * 0.77} y={h * 0.69} text={`${c.specs.capacityGB}GB ${c.specs.memoryType}`} size={Math.min(4.5, h * 0.16)} fill="#1b1f24" />
    </g>
  )
}

function CpuGraphic({ c, w, h }: { c: ComponentOf<'cpu'>; w: number; h: number }) {
  const intel = c.specs.vendor === 'Intel'
  const brand = intel ? (/xeon/i.test(c.name) ? 'XEON' : 'intel CORE') : /epyc/i.test(c.name) ? 'EPYC' : 'RYZEN'
  const fs = Math.min(w, h) * 0.16
  return (
    <g>
      <rect x={0} y={0} width={w} height={h} rx={2.5} fill="#1c3b2e" stroke="#0d1612" strokeWidth={0.6} />
      <rect x={w * 0.08} y={h * 0.08} width={w * 0.84} height={h * 0.84} rx={3} fill="url(#np-ihs)" stroke="#7d8793" strokeWidth={0.5} />
      <path d={`M${w * 0.1} ${h * 0.1} l${w * 0.08} 0 l${-w * 0.08} ${h * 0.08} z`} fill="#6b7480" />
      <Label x={w / 2} y={h * 0.4} text={brand} size={fs} fill={intel ? '#0a4f8f' : '#b3261e'} weight={800} />
      <Label x={w / 2} y={h * 0.62} text={c.name.replace(/^(Xeon|EPYC|Core|Ryzen)\s*/i, '')} size={fs * 0.62} fill="#2b3139" maxChars={fitChars(w * 0.8, fs * 0.62)} />
      <Label x={w / 2} y={h * 0.78} text={`${c.specs.cores}C/${c.specs.threads}T · ${c.specs.tdpW}W`} size={fs * 0.5} fill="#444c56" weight={500} />
    </g>
  )
}

function DriveGraphic({ c, w, h }: { c: ComponentOf<'storage'>; w: number; h: number }) {
  const ff = c.specs.formFactor
  const cap = formatCapacity(c.specs.capacityGB)
  if (ff.startsWith('M.2')) {
    const chips = Math.max(1, Math.floor((w - 20) / 16))
    return (
      <g>
        <path d={`M3 0 H${w - 4} V${h / 2 - 2} H${w - 1.5} V${h / 2 + 2} H${w - 4} V${h} H3 Z`} fill="#12181f" stroke="#05080b" strokeWidth={0.5} />
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={i} x={0} y={2 + i * ((h - 4) / 10)} width={3} height={(h - 4) / 10 - 0.6} fill="#d4a72c" />
        ))}
        <rect x={6} y={h * 0.2} width={10} height={h * 0.6} rx={0.8} fill="#3b4252" />
        {Array.from({ length: chips }, (_, i) => (
          <rect key={i} x={19 + i * 16} y={h * 0.15} width={13} height={h * 0.7} rx={0.8} fill="#262c36" />
        ))}
        <rect x={20} y={h * 0.3} width={Math.min(w - 30, 40)} height={h * 0.4} rx={0.8} fill="#e8ecef" opacity={0.92} />
        <Label x={20 + Math.min(w - 30, 40) / 2} y={h / 2} text={cap} size={Math.min(5, h * 0.24)} fill="#12181f" />
      </g>
    )
  }
  const hdd = c.specs.storageType === 'hdd'
  const u2 = ff === 'U.2'
  if (h < 34) {
    // hot-swap caddy seen from above (thin)
    return (
      <g>
        <rect x={0} y={0} width={w} height={h} rx={1.2} fill={hdd ? 'url(#np-alu)' : '#343a45'} stroke="#20252c" strokeWidth={0.5} />
        <rect x={0} y={0} width={Math.min(14, w * 0.12)} height={h} rx={1.2} fill="#1d2127" />
        <circle cx={Math.min(7, w * 0.06)} cy={h / 2} r={Math.min(1.6, h * 0.14)} fill={u2 ? '#60a5fa' : '#22c55e'} />
        <Label x={w * 0.56} y={h / 2} text={`${u2 ? 'U.2 ' : hdd ? '' : 'SSD '}${cap}`} size={Math.min(7, h * 0.52)} fill={hdd ? '#20252c' : '#e7eaee'} maxChars={fitChars(w * 0.8, Math.min(7, h * 0.52))} />
      </g>
    )
  }
  if (hdd) {
    const r = Math.min(w, h) * 0.36
    return (
      <g>
        <rect x={0} y={0} width={w} height={h} rx={3} fill="url(#np-alu)" stroke="#6f7883" strokeWidth={0.6} />
        <circle cx={w * 0.4} cy={h / 2} r={r} fill="none" stroke="#8d96a1" strokeWidth={1.2} />
        <circle cx={w * 0.4} cy={h / 2} r={r * 0.22} fill="#98a1ac" stroke="#7b848f" strokeWidth={0.6} />
        <path d={`M${w * 0.78} ${h * 0.82} L${w * 0.47} ${h * 0.55}`} stroke="#7b848f" strokeWidth={2.4} strokeLinecap="round" />
        <rect x={w * 0.62} y={h * 0.1} width={w * 0.33} height={h * 0.38} rx={1.5} fill="#f4f6f8" stroke="#c9ced4" strokeWidth={0.4} />
        <Label x={w * 0.785} y={h * 0.22} text={cap} size={h * 0.1} fill="#1f2328" weight={800} />
        <Label x={w * 0.785} y={h * 0.36} text={`${c.specs.interface} ${c.specs.rpm ?? ''}`.trim()} size={h * 0.07} fill="#4a525c" weight={500} />
        {[0.06, 0.94].flatMap((fx) => [0.1, 0.9].map((fy) => <circle key={`${fx}${fy}`} cx={w * fx} cy={h * fy} r={1.4} fill="#7b848f" />))}
      </g>
    )
  }
  return (
    <g>
      <rect x={0} y={0} width={w} height={h} rx={3} fill={u2 ? '#aab2bb' : '#2d3340'} stroke="#161a20" strokeWidth={0.6} />
      <rect x={w * 0.12} y={h * 0.2} width={w * 0.76} height={h * 0.6} rx={2} fill={u2 ? '#e9edf1' : '#3d4556'} />
      <Label x={w / 2} y={h * 0.4} text={u2 ? 'U.2 NVMe' : 'SSD'} size={h * 0.14} fill={u2 ? '#1f2937' : '#93c5fd'} weight={800} />
      <Label x={w / 2} y={h * 0.62} text={cap} size={h * 0.12} fill={u2 ? '#374151' : '#e5e7eb'} />
    </g>
  )
}

function CardGraphic({ c, w, h }: { c: HardwareComponent; w: number; h: number }) {
  const lowProfile = 'lowProfile' in c.specs ? (c.specs as { lowProfile: boolean }).lowProfile : true
  const isGpu = c.kind === 'gpu'
  const edge = h < 40
  const bracketW = Math.min(8, w * 0.06)
  if (edge) {
    // mounted: card edge seen from above, bracket on the right (rear)
    return (
      <g>
        <rect x={0} y={h * 0.3} width={w - bracketW} height={h * 0.4} fill={isGpu ? '#23262d' : '#23734d'} />
        {isGpu ? (
          <rect x={0} y={0} width={w - bracketW} height={h} rx={2} fill="url(#np-dark)" stroke="#0e1013" strokeWidth={0.6} />
        ) : (
          <>
            <rect x={w * 0.3} y={0} width={Math.min(28, w * 0.2)} height={h} rx={1} fill="#5b6572" />
            <rect x={0} y={h * 0.28} width={w - bracketW} height={h * 0.44} rx={0.8} fill="url(#np-card)" stroke="#0f3a26" strokeWidth={0.4} />
          </>
        )}
        <rect x={w - bracketW} y={-1} width={bracketW} height={h + 2} rx={0.6} fill="#aeb4bc" stroke="#7c848e" strokeWidth={0.4} />
        {c.kind === 'nic' &&
          (c.ports ?? []).map((p, i, arr) => (
            <rect key={p.id} x={w - bracketW + 1} y={1 + i * ((h) / arr.length)} width={bracketW - 2} height={h / arr.length - 1.6} rx={0.4} fill={/SFP|QSFP/.test(p.connector) ? '#6b737d' : '#2a2f36'} />
          ))}
        <Label x={(w - bracketW) / 2} y={h / 2} text={c.name} size={Math.min(6, h * 0.5)} fill="#eef2f6" maxChars={fitChars(w * 0.7, Math.min(6, h * 0.5))} />
      </g>
    )
  }
  const fs = Math.min(8, h * 0.11)
  return (
    <g>
      {isGpu ? (
        <>
          <rect x={0} y={0} width={w - bracketW} height={h - 6} rx={4} fill="url(#np-dark)" stroke="#0e1013" strokeWidth={0.6} />
          {Array.from({ length: Math.max(1, Math.min(3, Math.floor((w - bracketW) / 90))) }, (_, i) => {
            const fans = Math.max(1, Math.min(3, Math.floor((w - bracketW) / 90)))
            const seg = (w - bracketW) / fans
            const r = Math.min(seg, h - 6) * 0.38
            return (
              <g key={i}>
                <circle cx={seg * (i + 0.5)} cy={(h - 6) / 2} r={r} fill="#15181d" stroke="#474d57" strokeWidth={1} />
                {Array.from({ length: 7 }, (_, k) => (
                  <path key={k} d={`M${seg * (i + 0.5)} ${(h - 6) / 2} L${seg * (i + 0.5) + r * 0.9 * Math.cos((k * 2 * Math.PI) / 7)} ${(h - 6) / 2 + r * 0.9 * Math.sin((k * 2 * Math.PI) / 7)}`} stroke="#3a3f48" strokeWidth={r * 0.18} strokeLinecap="round" />
                ))}
                <circle cx={seg * (i + 0.5)} cy={(h - 6) / 2} r={r * 0.25} fill="#2b3038" />
              </g>
            )
          })}
          <rect x={4} y={h - 6} width={Math.min(89, w * 0.4)} height={6} fill="#d4a72c" />
        </>
      ) : (
        <>
          <rect x={0} y={0} width={w - bracketW} height={h - 6} rx={3} fill="url(#np-card)" stroke="#0f3a26" strokeWidth={0.6} />
          <rect x={0} y={0} width={w - bracketW} height={h - 6} rx={3} fill="url(#np-traces)" />
          <rect x={w * 0.32} y={h * 0.18} width={Math.min(34, w * 0.24)} height={Math.min(34, h * 0.5)} rx={2} fill="#5b6572" stroke="#3f4650" strokeWidth={0.6} />
          {Array.from({ length: 5 }, (_, i) => (
            <line key={i} x1={w * 0.32 + 3} x2={w * 0.32 + Math.min(34, w * 0.24) - 3} y1={h * 0.18 + 5 + i * 5} y2={h * 0.18 + 5 + i * 5} stroke="#48505b" strokeWidth={1.4} />
          ))}
          <rect x={4} y={h - 6} width={Math.min(({ 1: 25, 4: 39, 8: 56, 16: 89 } as Record<number, number>)[('pcieLanes' in c.specs ? (c.specs as { pcieLanes: number }).pcieLanes : 4)] ?? 39, w * 0.6)} height={6} fill="#d4a72c" />
        </>
      )}
      <rect x={w - bracketW} y={-4} width={bracketW} height={h + 2} rx={0.8} fill="#aeb4bc" stroke="#7c848e" strokeWidth={0.5} />
      {c.kind === 'nic' &&
        (c.ports ?? []).map((p, i, arr) => {
          const ph = Math.min(14, (h - 14) / arr.length - 2)
          return <rect key={p.id} x={w - bracketW - 12} y={6 + i * (ph + 3)} width={12} height={ph} rx={1} fill={/SFP|QSFP/.test(p.connector) ? '#9aa2ac' : '#2a2f36'} stroke="#5d656f" strokeWidth={0.4} />
        })}
      <Label x={(w - bracketW) * 0.5} y={h * 0.72} text={c.name} size={fs} fill="#f1f5f9" maxChars={fitChars((w - bracketW) * 0.9, fs)} />
      {!lowProfile && <Label x={(w - bracketW) * 0.5} y={h * 0.86} text="Full Height" size={fs * 0.65} fill="#cbd5e1" weight={500} />}
    </g>
  )
}

function PsuGraphic({ c, w, h }: { c: ComponentOf<'psu'>; w: number; h: number }) {
  const r = Math.min(h * 0.4, w * 0.2)
  return (
    <g>
      <rect x={0} y={0} width={w} height={h} rx={2.5} fill="url(#np-dark)" stroke="#11141a" strokeWidth={0.6} />
      <rect x={w * 0.04} y={h * 0.12} width={w * 0.52} height={h * 0.76} rx={2} fill="url(#np-vent)" opacity={0.7} />
      <circle cx={w * 0.76} cy={h / 2} r={r} fill="url(#np-grille)" stroke="#555c66" strokeWidth={0.8} />
      <circle cx={w * 0.76} cy={h / 2} r={r * 0.25} fill="#3b414b" />
      <rect x={w - 5} y={h * 0.2} width={4} height={h * 0.6} rx={1.5} fill="#8a929c" />
      <circle cx={w * 0.94} cy={h * 0.15} r={1.6} fill="#22c55e" />
      <Label x={w * 0.3} y={h * 0.38} text={`${c.specs.watts} W`} size={Math.min(12, h * 0.22)} fill="#f8fafc" weight={800} />
      <Label x={w * 0.3} y={h * 0.64} text={c.specs.efficiency} size={Math.min(7, h * 0.12)} fill="#fbbf24" />
    </g>
  )
}

function FanGraphic({ w, h }: { w: number; h: number }) {
  const face = Math.abs(w - h) / Math.max(w, h) < 0.25
  if (!face) {
    return (
      <g>
        <rect x={0} y={0} width={w} height={h} rx={2} fill="#23272e" stroke="#0e1013" strokeWidth={0.6} />
        <rect x={w * 0.15} y={2} width={w * 0.7} height={h - 4} rx={1} fill="#2f343c" />
        {Array.from({ length: 5 }, (_, i) => (
          <line key={i} x1={w * 0.2} x2={w * 0.8} y1={(h / 6) * (i + 1)} y2={(h / 6) * (i + 1) + h * 0.06} stroke="#4b5260" strokeWidth={1.4} strokeLinecap="round" />
        ))}
        <path d={`M${w * 0.5} ${h * 0.35} l${w * 0.18} ${h * 0.15} l${-w * 0.18} ${h * 0.15}`} fill="none" stroke="#60a5fa" strokeWidth={1} opacity={0.8} />
      </g>
    )
  }
  const r = Math.min(w, h) / 2
  return (
    <g>
      <rect x={0} y={0} width={w} height={h} rx={r * 0.15} fill="#23272e" stroke="#0e1013" strokeWidth={0.6} />
      <circle cx={w / 2} cy={h / 2} r={r * 0.9} fill="#15181d" />
      {Array.from({ length: 7 }, (_, k) => {
        const a = (k * 2 * Math.PI) / 7
        return (
          <path
            key={k}
            d={`M${w / 2} ${h / 2} Q${w / 2 + r * 0.7 * Math.cos(a + 0.5)} ${h / 2 + r * 0.7 * Math.sin(a + 0.5)} ${w / 2 + r * 0.85 * Math.cos(a)} ${h / 2 + r * 0.85 * Math.sin(a)}`}
            stroke="#4b5260"
            strokeWidth={r * 0.2}
            fill="none"
            strokeLinecap="round"
          />
        )
      })}
      <circle cx={w / 2} cy={h / 2} r={r * 0.28} fill="#2b3038" stroke="#4b5260" strokeWidth={0.8} />
      {[0.12, 0.88].flatMap((fx) => [0.12, 0.88].map((fy) => <circle key={`${fx}${fy}`} cx={w * fx} cy={h * fy} r={r * 0.06} fill="#4b5260" />))}
    </g>
  )
}

function MainboardGraphic({ c, w, h, showLabels }: { c: ComponentOf<'mainboard'>; w: number; h: number; showLabels: boolean }) {
  const s = c.specs
  const sata = Math.min(s.sataPorts, 12)
  return (
    <g>
      <rect x={0} y={0} width={w} height={h} rx={4} fill="url(#np-pcb)" stroke="#0c2a21" strokeWidth={0.8} />
      <rect x={0} y={0} width={w} height={h} rx={4} fill="url(#np-traces)" />
      {/* mounting holes */}
      {[
        [8, 8],
        [w - 8, 8],
        [8, h - 8],
        [w - 8, h - 8],
        [w / 2, h / 2],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3} fill="#c9ced4" stroke="#8b939c" strokeWidth={0.6} />
      ))}
      {/* SATA ports at the front edge */}
      {Array.from({ length: sata }, (_, i) => (
        <rect key={i} x={3} y={h - 14 - i * 8} width={6} height={6} rx={0.6} fill="#1f2937" stroke="#4b5563" strokeWidth={0.4} />
      ))}
      {/* chipset heatsink */}
      <rect x={w * 0.52} y={h * 0.62} width={30} height={30} rx={2} fill="#5b6572" stroke="#3f4650" strokeWidth={0.6} opacity={0.9} />
      {Array.from({ length: 5 }, (_, i) => (
        <line key={i} x1={w * 0.52 + 4} x2={w * 0.52 + 26} y1={h * 0.62 + 5 + i * 5} y2={h * 0.62 + 5 + i * 5} stroke="#48505b" strokeWidth={1.4} />
      ))}
      {/* rear I/O */}
      <rect x={w - 20} y={10} width={16} height={Math.max(40, s.onboardNics.length * 16 + 30)} rx={1.2} fill="#9aa2ac" stroke="#6b737d" strokeWidth={0.5} />
      {s.onboardNics.map((n, i) => (
        <g key={i}>
          <rect x={w - 18} y={14 + i * 16} width={12} height={12} rx={0.8} fill="#1d2127" stroke={n.role === 'management' ? '#38bdf8' : '#4b5563'} strokeWidth={0.7} />
          <rect x={w - 15} y={22 + i * 16} width={6} height={3} fill="#374151" />
        </g>
      ))}
      <rect x={w - 18} y={16 + s.onboardNics.length * 16} width={12} height={8} rx={0.6} fill="#2563eb" />
      {s.ipmi && <Label x={w - 12} y={34 + s.onboardNics.length * 16} text="BMC" size={4} fill="#1f2937" />}
      {showLabels && (
        <>
          <Label x={w * 0.52 + 15} y={h * 0.62 + 38} text={s.chipset ?? 'Chipsatz'} size={5} fill="#a7f3d0" weight={500} />
          <Label x={10} y={h - 6} text={c.name} size={7} fill="#d1fae5" anchor="start" weight={700} maxChars={fitChars(w * 0.45, 7)} />
          <Label x={w - 26} y={h - 6} text={s.formFactor} size={6} fill="#6ee7b7" anchor="end" />
        </>
      )}
    </g>
  )
}

function GenericGraphic({ c, w, h }: { c: HardwareComponent; w: number; h: number }) {
  const fs = Math.min(8, h * 0.28, w * 0.1)
  return (
    <g>
      <rect x={0} y={0} width={w} height={h} rx={3} fill={c.color ?? '#475569'} stroke="#1e293b" strokeWidth={0.6} />
      <Label x={w / 2} y={h / 2} text={c.name} size={fs} fill="#f8fafc" maxChars={fitChars(w * 0.9, fs)} />
      <Label x={w / 2} y={h / 2 + fs * 1.1} text={COMPONENT_KIND_LABELS[c.kind]} size={fs * 0.6} fill="#cbd5e1" weight={500} />
    </g>
  )
}

export const ComponentGraphic = memo(function ComponentGraphic({
  c,
  w,
  h,
  showLabels = true,
}: {
  c: HardwareComponent
  w: number
  h: number
  showLabels?: boolean
}) {
  switch (c.kind) {
    case 'ram':
      return <RamGraphic c={c} w={w} h={h} />
    case 'cpu':
      return <CpuGraphic c={c} w={w} h={h} />
    case 'storage':
      return <DriveGraphic c={c} w={w} h={h} />
    case 'nic':
    case 'gpu':
    case 'hba':
    case 'raid':
    case 'pcie':
      return <CardGraphic c={c} w={w} h={h} />
    case 'psu':
      return <PsuGraphic c={c} w={w} h={h} />
    case 'fan':
      return <FanGraphic w={w} h={h} />
    case 'mainboard':
      return <MainboardGraphic c={c} w={w} h={h} showLabels={showLabels} />
    default:
      return <GenericGraphic c={c} w={w} h={h} />
  }
})

/* ------------------------------------------------------------------ */
/* slots                                                               */
/* ------------------------------------------------------------------ */

export type SlotState = 'idle' | 'ok' | 'warning' | 'error' | 'hover-ok' | 'hover-warning' | 'hover-error' | 'selected'

const HIGHLIGHT: Record<string, string> = {
  ok: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  selected: '#3b82f6',
}

export function slotHighlight(state: SlotState) {
  if (state === 'idle') return null
  const base = state.replace('hover-', '')
  return { color: HIGHLIGHT[base], strong: state.startsWith('hover') || state === 'selected' }
}

export const SlotGraphic = memo(function SlotGraphic({ slot, showLabels }: { slot: Slot; showLabels: boolean }) {
  const { w, h } = slot.rect
  switch (slot.kind) {
    case 'cpu':
      return (
        <g>
          <rect x={-3} y={-3} width={w + 6} height={h + 6} rx={2} fill="#3a4049" stroke="#1f242a" strokeWidth={0.6} />
          <rect x={0} y={0} width={w} height={h} rx={1.5} fill="#15191e" />
          <rect x={3} y={3} width={w - 6} height={h - 6} fill="url(#np-pins)" />
          <rect x={w - 6} y={-5} width={4} height={h + 10} rx={1.5} fill="#8b939c" />
          {showLabels && <Label x={w / 2} y={h + 7} text={slot.label} size={4.6} fill="#a7f3d0" weight={500} />}
        </g>
      )
    case 'dimm':
      return (
        <g>
          <rect x={0} y={0} width={w} height={h} rx={1} fill={(slot.meta.order ?? 0) % 2 ? '#1e293b' : '#1d4ed8'} opacity={0.9} />
          <rect x={4} y={h / 2 - 0.7} width={w - 8} height={1.4} fill="#0b0f14" />
          <rect x={-3} y={-0.5} width={4} height={h + 1} rx={0.8} fill="#e5e7eb" />
          <rect x={w - 1} y={-0.5} width={4} height={h + 1} rx={0.8} fill="#e5e7eb" />
          {showLabels && <Label x={w + 5} y={h / 2} text={slot.label.replace('DIMM ', '')} size={4.2} fill="#a7f3d0" anchor="start" weight={500} />}
        </g>
      )
    case 'pcie':
      return (
        <g>
          <rect x={0} y={0} width={w} height={h} rx={0.8} fill="#111418" />
          <rect x={w * 0.13} y={0} width={1.2} height={h} fill="#3b4250" />
          <rect x={2} y={h / 2 - 0.6} width={w - 4} height={1.2} fill="#2a303a" />
          <rect x={-3} y={-0.8} width={3.5} height={h + 1.6} rx={0.6} fill="#9ca3af" />
          {showLabels && <Label x={-6} y={h / 2} text={slot.label} size={4.4} fill="#a7f3d0" anchor="end" weight={500} />}
        </g>
      )
    case 'm2':
      return (
        <g>
          <rect x={0} y={0} width={w} height={h} rx={1} fill="none" stroke="#6ee7b7" strokeWidth={0.5} strokeDasharray="2 1.5" opacity={0.7} />
          <rect x={0} y={1} width={5} height={h - 2} rx={0.5} fill="#111418" />
          {[42, 60, 80, 110].filter((l) => l <= (slot.meta.maxLength ?? 80)).map((l) => (
            <circle key={l} cx={l} cy={h / 2} r={l === slot.meta.maxLength ? 2.2 : 1.1} fill={l === slot.meta.maxLength ? '#d1d5db' : '#6b7280'} />
          ))}
          {showLabels && <Label x={w / 2} y={h / 2} text={slot.label} size={4.6} fill="#6ee7b7" weight={500} />}
        </g>
      )
    case 'bay-3.5':
    case 'bay-2.5':
      return (
        <g>
          <rect x={0} y={0} width={w} height={h} rx={1.5} fill="var(--bay-fill)" stroke="var(--bay-stroke)" strokeWidth={0.6} />
          <rect x={0} y={0} width={Math.min(12, w * 0.1)} height={h} rx={1.5} fill="var(--bay-stroke)" opacity={0.35} />
          {slot.meta.nvme && <rect x={w - 4} y={1} width={3} height={h - 2} fill="#60a5fa" opacity={0.7} />}
          {showLabels && h > 12 && <Label x={w / 2} y={h / 2} text={slot.label} size={Math.min(6.5, h * 0.4)} fill="var(--label-muted)" weight={500} />}
          {showLabels && h <= 12 && <Label x={w * 0.55} y={h / 2} text={slot.label} size={Math.min(6, h * 0.62)} fill="var(--label-muted)" weight={500} />}
        </g>
      )
    case 'psu':
      return (
        <g>
          <rect x={0} y={0} width={w} height={h} rx={2} fill="var(--bay-fill)" stroke="var(--bay-stroke)" strokeWidth={0.6} strokeDasharray="4 2" />
          {showLabels && <Label x={w / 2} y={h / 2} text={slot.label} size={7} fill="var(--label-muted)" weight={500} />}
        </g>
      )
    case 'fan':
      return (
        <g>
          <rect x={0} y={0} width={w} height={h} rx={2} fill="var(--bay-fill)" stroke="var(--bay-stroke)" strokeWidth={0.6} strokeDasharray="3 2" />
          <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) * 0.3} fill="none" stroke="var(--bay-stroke)" strokeWidth={0.6} />
        </g>
      )
    case 'mainboard':
      return (
        <g>
          <rect x={0} y={0} width={w} height={h} rx={4} fill="none" stroke="var(--bay-stroke)" strokeWidth={0.8} strokeDasharray="6 4" />
          {[
            [10, 10],
            [w - 10, 10],
            [10, h - 10],
            [w - 10, h - 10],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={2.6} fill="none" stroke="var(--bay-stroke)" strokeWidth={0.8} />
          ))}
          {showLabels && <Label x={w / 2} y={h / 2} text={slot.label} size={9} fill="var(--label-muted)" weight={500} />}
        </g>
      )
    default:
      return <rect x={0} y={0} width={w} height={h} fill="none" stroke="var(--bay-stroke)" />
  }
})

/* ------------------------------------------------------------------ */
/* chassis                                                             */
/* ------------------------------------------------------------------ */

export const ChassisGraphic = memo(function ChassisGraphic({ chassis, showLabels }: { chassis: Chassis; showLabels: boolean }) {
  const { w, h } = chassis.size
  const rack = chassis.params.formFactor === 'rack'
  return (
    <g>
      <rect x={-8} y={-8} width={w + 16} height={h + 16} rx={10} fill="var(--chassis-fill)" stroke="var(--chassis-stroke)" strokeWidth={1.4} filter="url(#np-shadow)" />
      <rect x={0} y={0} width={w} height={h} rx={5} fill="var(--chassis-inner)" stroke="var(--chassis-stroke)" strokeWidth={0.6} opacity={0.95} />
      {/* rear wall openings */}
      {Array.from({ length: Math.min(chassis.params.expansionSlots, 8) }, (_, i) => (
        <rect key={i} x={w + 1} y={h * 0.08 + i * 16} width={5} height={12} rx={1} fill="var(--chassis-stroke)" opacity={0.45} />
      ))}
      {rack && (
        <>
          <rect x={-8} y={-8} width={6} height={h + 16} rx={2} fill="var(--chassis-stroke)" opacity={0.25} />
        </>
      )}
      {showLabels && (
        <>
          <text x={-18} y={h / 2} fontSize={9} fill="var(--label-muted)" textAnchor="middle" transform={`rotate(-90 ${-18} ${h / 2})`} fontWeight={700} letterSpacing={2}>
            FRONT
          </text>
          <text x={w + 18} y={h / 2} fontSize={9} fill="var(--label-muted)" textAnchor="middle" transform={`rotate(90 ${w + 18} ${h / 2})`} fontWeight={700} letterSpacing={2}>
            REAR
          </text>
          <text x={0} y={-16} fontSize={11} fill="var(--label)" fontWeight={700}>
            {chassis.name}
            <tspan fill="var(--label-muted)" fontWeight={500}>
              {rack ? `  ·  ${chassis.params.heightU}U Rack  ·  ${chassis.params.depthMm} mm tief` : `  ·  Tower  ·  ${chassis.params.heightMm} mm hoch`}
            </tspan>
          </text>
        </>
      )}
    </g>
  )
})

export function TrayArea({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={x} y={y} width={w} height={h} rx={10} fill="none" stroke="var(--bay-stroke)" strokeWidth={1} strokeDasharray="8 6" opacity={0.7} />
      <text x={x + 10} y={y - 8} fontSize={10} fill="var(--label-muted)" fontWeight={600}>
        Ablage – lose Bauteile (nicht eingebaut)
      </text>
    </g>
  )
}

export function portSummary(c: HardwareComponent) {
  if (c.kind === 'nic') return `${c.specs.portCount}× ${formatSpeed(c.specs.speed)} ${c.specs.connector}`
  return ''
}
