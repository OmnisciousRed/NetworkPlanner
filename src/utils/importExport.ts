import type { Project } from '@/models'
import { SCHEMA_VERSION, uid } from '@/models'
import { createProject } from './factory'
import { collectIpam } from './ip'
import { buildOneLiner, formatCapacity, summarizeBuild } from './buildSummary'
import { effectiveSpeed, findPort, getDevicePower } from './device'
import { formatSpeed } from '@/models'
import { DEVICE_KINDS } from '@/data/deviceKinds'

export class ImportError extends Error {}

/** validates a parsed project file and fills missing fields with defaults */
export function normalizeProject(raw: unknown, opts: { newId?: boolean } = {}): Project {
  if (!raw || typeof raw !== 'object') throw new ImportError('Die Datei enthält kein gültiges Projekt.')
  const r = raw as Partial<Project>
  if (typeof r.schemaVersion !== 'number') throw new ImportError('Unbekanntes Dateiformat (schemaVersion fehlt).')
  if (r.schemaVersion > SCHEMA_VERSION)
    throw new ImportError(`Die Datei wurde mit einer neueren Version erstellt (Schema ${r.schemaVersion}).`)
  if (!r.devices || typeof r.devices !== 'object') throw new ImportError('Die Datei enthält keine Geräte-Liste.')
  const base = createProject(r.name ?? 'Importiertes Projekt')
  const p: Project = {
    ...base,
    ...r,
    schemaVersion: SCHEMA_VERSION,
    id: opts.newId || !r.id ? uid('prj') : r.id,
    devices: r.devices ?? {},
    racks: r.racks ?? {},
    connections: r.connections ?? {},
    vlans: r.vlans ?? {},
    firewallRules: r.firewallRules ?? [],
    dnsRecords: r.dnsRecords ?? [],
    groups: r.groups ?? {},
    customTemplates: {
      components: r.customTemplates?.components ?? [],
      devices: r.customTemplates?.devices ?? [],
      chassis: r.customTemplates?.chassis ?? [],
    },
    settings: { ...base.settings, ...(r.settings ?? {}) },
  }
  for (const d of Object.values(p.devices)) {
    d.ports = d.ports ?? []
    d.layout = d.layout ?? {}
    if (!DEVICE_KINDS[d.kind]) throw new ImportError(`Unbekannter Gerätetyp „${String(d.kind)}“`)
    if (d.build) {
      d.build.components = d.build.components ?? []
      d.build.links = d.build.links ?? []
    }
  }
  // drop connections to missing devices
  for (const [id, c] of Object.entries(p.connections)) {
    if (!p.devices[c.a?.deviceId] || !p.devices[c.b?.deviceId]) delete p.connections[id]
  }
  return p
}

export function projectToJson(p: Project): string {
  return JSON.stringify(p, null, 2)
}

function csv(rows: (string | number | undefined)[][]): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = v === undefined ? '' : String(v)
          return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(';'),
    )
    .join('\n')
}

/** Bill of materials: every device and its hardware components */
export function bomCsv(p: Project): string {
  const rows: (string | number | undefined)[][] = [['Gerät', 'Typ', 'Bauteil', 'Art', 'Hersteller', 'Modell', 'Steckplatz', 'Leistung (W)', 'Gewicht (kg)']]
  for (const d of Object.values(p.devices)) {
    if (!d.build) {
      rows.push([d.name, DEVICE_KINDS[d.kind].label, '', 'Gerät', d.manufacturer, d.model, '', getDevicePower(d), d.weightKg])
      continue
    }
    rows.push([d.name, DEVICE_KINDS[d.kind].label, d.build.chassis.name, 'Gehäuse', '', '', '', '', d.build.chassis.params.weightKg])
    for (const c of d.build.components) {
      const slot = c.mount
        ? c.mount.parentId === 'chassis'
          ? d.build.chassis.slots.find((s) => s.id === c.mount!.slotId)?.label
          : d.build.components.find((x) => x.id === c.mount!.parentId)?.slots?.find((s) => s.id === c.mount!.slotId)?.label
        : 'nicht eingebaut'
      rows.push([d.name, DEVICE_KINDS[d.kind].label, c.name, c.kind, c.manufacturer, c.model, slot, c.powerW, c.weightKg])
    }
  }
  return csv(rows)
}

export function cableCsv(p: Project): string {
  const rows: (string | number | undefined)[][] = [['Nr', 'Gerät A', 'Port A', 'Gerät B', 'Port B', 'Typ', 'Medium', 'Geschwindigkeit', 'Kabel', 'Länge (m)', 'Beschriftung']]
  let i = 1
  for (const c of Object.values(p.connections)) {
    const da = p.devices[c.a.deviceId]
    const db = p.devices[c.b.deviceId]
    rows.push([
      i++,
      da?.name,
      findPort(da, c.a.portId)?.port.name,
      db?.name,
      findPort(db, c.b.portId)?.port.name,
      c.type,
      c.medium,
      formatSpeed(effectiveSpeed(p, c)),
      c.cableCategory,
      c.lengthM,
      c.cableLabel,
    ])
  }
  return csv(rows)
}

export function ipamCsv(p: Project): string {
  const rows: (string | number | undefined)[][] = [['Gerät', 'Interface', 'VLAN', 'Subnetz', 'IP', 'Modus', 'MAC', 'Hinweise']]
  for (const e of collectIpam(p)) {
    const v = e.vlanId ? p.vlans[e.vlanId] : undefined
    rows.push([e.deviceName, e.portName, v ? `${v.tag} ${v.name}` : '', v?.subnet, e.ip, e.mode, e.mac, e.issues.join(', ')])
  }
  return csv(rows)
}

export function projectMarkdown(p: Project): string {
  const lines: string[] = [`# ${p.name}`, '', `Stand: ${new Date(p.updatedAt).toLocaleString('de-DE')}`, '']
  lines.push('## Racks', '')
  for (const r of Object.values(p.racks)) {
    lines.push(`### ${r.name} (${r.heightU}U)`, '')
    const devs = Object.values(p.devices)
      .filter((d) => d.rackPlacement?.rackId === r.id)
      .sort((a, b) => b.rackPlacement!.positionU - a.rackPlacement!.positionU)
    for (const d of devs) lines.push(`- U${d.rackPlacement!.positionU}: **${d.name}** – ${buildOneLiner(d)}`)
    lines.push('')
  }
  lines.push('## Geräte', '')
  for (const d of Object.values(p.devices)) {
    lines.push(`- **${d.name}** (${DEVICE_KINDS[d.kind].label})${d.build ? ` – ${buildOneLiner(d)}` : ''}`)
    if (d.build) {
      const s = summarizeBuild(d.build)
      lines.push(`  - ${s.cores} Kerne, ${s.ramGB} GB RAM, ${formatCapacity(s.storageGB)} Speicher, ~${s.power.typicalW} W`)
    }
  }
  lines.push('', '## VLANs', '')
  for (const v of Object.values(p.vlans)) lines.push(`- VLAN ${v.tag} ${v.name}: ${v.subnet ?? ''} (GW ${v.gateway ?? '–'})`)
  return lines.join('\n')
}

export function downloadText(filename: string, text: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function safeFileName(s: string) {
  return s.replace(/[^\w\-äöüÄÖÜß ]+/g, '').trim().replace(/\s+/g, '_') || 'projekt'
}
