import type { ComponentKind } from '@/models'
import { CONNECTORS, SPEED_OPTIONS, formatSpeed } from '@/models'

export type SpecField =
  | { key: string; label: string; type: 'number'; unit?: string; min?: number; max?: number; step?: number }
  | { key: string; label: string; type: 'text' }
  | { key: string; label: string; type: 'select'; options: { value: string | number; label: string }[] }
  | { key: string; label: string; type: 'bool' }
  | { key: string; label: string; type: 'list'; options: string[] }

const opts = (xs: (string | number)[]) => xs.map((x) => ({ value: x, label: String(x) }))
const lanes = { key: 'pcieLanes', label: 'PCIe-Lanes', type: 'select' as const, options: [1, 4, 8, 16].map((x) => ({ value: x, label: `x${x}` })) }
const gen = { key: 'pcieGen', label: 'PCIe-Generation', type: 'select' as const, options: [1, 2, 3, 4, 5].map((x) => ({ value: x, label: `Gen ${x}` })) }
const lp = { key: 'lowProfile', label: 'Low Profile', type: 'bool' as const }
const len = { key: 'lengthMm', label: 'Kartenlänge', type: 'number' as const, unit: 'mm', min: 40, max: 360 }

export const SPEC_FIELDS: Record<ComponentKind, SpecField[]> = {
  cpu: [
    { key: 'socket', label: 'Sockel', type: 'select', options: opts(['LGA4677', 'LGA4189', 'LGA3647', 'SP5', 'SP3', 'LGA1700', 'LGA1851', 'LGA1200', 'AM5', 'AM4']) },
    { key: 'vendor', label: 'Hersteller', type: 'select', options: opts(['Intel', 'AMD', 'Other']) },
    { key: 'family', label: 'Familie', type: 'text' },
    { key: 'cores', label: 'Kerne', type: 'number', min: 1, max: 256 },
    { key: 'threads', label: 'Threads', type: 'number', min: 1, max: 512 },
    { key: 'baseClockGHz', label: 'Basistakt', type: 'number', unit: 'GHz', step: 0.1, min: 0.5, max: 7 },
    { key: 'boostClockGHz', label: 'Boost', type: 'number', unit: 'GHz', step: 0.1, min: 0.5, max: 7 },
    { key: 'tdpW', label: 'TDP', type: 'number', unit: 'W', min: 5, max: 600 },
    { key: 'memoryTypes', label: 'Speichertypen', type: 'list', options: ['DDR3', 'DDR4', 'DDR5'] },
    { key: 'maxSockets', label: 'Max. Sockel', type: 'select', options: opts([1, 2, 4]) },
  ],
  ram: [
    { key: 'memoryType', label: 'Typ', type: 'select', options: opts(['DDR3', 'DDR4', 'DDR5']) },
    { key: 'capacityGB', label: 'Kapazität', type: 'select', options: [4, 8, 16, 24, 32, 48, 64, 96, 128, 256].map((x) => ({ value: x, label: `${x} GB` })) },
    { key: 'speedMTs', label: 'Takt', type: 'number', unit: 'MT/s', min: 800, max: 9000, step: 100 },
    { key: 'formFactor', label: 'Formfaktor', type: 'select', options: opts(['DIMM', 'SO-DIMM']) },
    { key: 'ecc', label: 'ECC', type: 'bool' },
    { key: 'registered', label: 'Registered (RDIMM)', type: 'bool' },
  ],
  storage: [
    { key: 'storageType', label: 'Typ', type: 'select', options: [
      { value: 'hdd', label: 'HDD' },
      { value: 'ssd', label: 'SATA/SAS SSD' },
      { value: 'nvme', label: 'NVMe SSD' },
    ] },
    { key: 'capacityGB', label: 'Kapazität', type: 'number', unit: 'GB', min: 16, max: 100000 },
    { key: 'interface', label: 'Interface', type: 'select', options: opts(['SATA', 'SAS', 'NVMe']) },
    { key: 'pcieGen', label: 'PCIe-Generation', type: 'select', options: [3, 4, 5].map((x) => ({ value: x, label: `PCIe ${x}.0` })) },
    { key: 'formFactor', label: 'Formfaktor', type: 'select', options: opts(['3.5"', '2.5"', 'M.2 2242', 'M.2 2260', 'M.2 2280', 'M.2 22110', 'U.2']) },
    { key: 'rpm', label: 'Drehzahl', type: 'number', unit: 'U/min', min: 0, max: 15000, step: 100 },
  ],
  nic: [
    { key: 'portCount', label: 'Ports', type: 'number', min: 1, max: 8 },
    { key: 'speed', label: 'Geschwindigkeit je Port', type: 'select', options: SPEED_OPTIONS.map((s) => ({ value: s, label: formatSpeed(s) })) },
    { key: 'connector', label: 'Interface', type: 'select', options: opts(CONNECTORS.filter((c) => c !== 'WiFi' && c !== 'Virtual' && c !== 'DSL' && c !== 'Coax')) },
    lanes,
    gen,
    lp,
    len,
  ],
  gpu: [
    { key: 'vramGB', label: 'VRAM', type: 'number', unit: 'GB', min: 1, max: 192 },
    { key: 'slotWidth', label: 'Slotbreite', type: 'select', options: [1, 2, 3].map((x) => ({ value: x, label: `${x}-Slot` })) },
    lanes,
    gen,
    lp,
    len,
    { key: 'outputs', label: 'Ausgänge', type: 'text' },
  ],
  hba: [
    { key: 'drivePorts', label: 'Laufwerksanschlüsse', type: 'number', min: 1, max: 64 },
    { key: 'protocol', label: 'Protokoll', type: 'select', options: opts(['SAS3', 'SAS4', 'SATA', 'NVMe/SAS/SATA']) },
    { key: 'mode', label: 'Modus', type: 'select', options: opts(['IT', 'RAID']) },
    { key: 'connectors', label: 'Anschlüsse', type: 'text' },
    lanes,
    gen,
    lp,
    len,
  ],
  raid: [
    { key: 'drivePorts', label: 'Laufwerksanschlüsse', type: 'number', min: 1, max: 64 },
    { key: 'protocol', label: 'Protokoll', type: 'select', options: opts(['SAS3', 'SAS4', 'SATA', 'NVMe/SAS/SATA']) },
    { key: 'cacheGB', label: 'Cache', type: 'number', unit: 'GB', min: 0, max: 16 },
    { key: 'raidLevels', label: 'RAID-Level', type: 'list', options: ['0', '1', '5', '6', '10', '50', '60'] },
    lanes,
    gen,
    lp,
    len,
  ],
  pcie: [{ key: 'function', label: 'Funktion', type: 'text' }, lanes, gen, lp, len],
  psu: [
    { key: 'watts', label: 'Leistung', type: 'number', unit: 'W', min: 100, max: 4000, step: 50 },
    { key: 'efficiency', label: 'Effizienz', type: 'select', options: opts(['80+ Bronze', '80+ Gold', '80+ Platinum', '80+ Titanium']) },
    { key: 'formFactor', label: 'Bauform', type: 'select', options: opts(['ATX', 'SFX', 'CRPS', 'Server']) },
    { key: 'inputConnector', label: 'Eingang', type: 'select', options: opts(['C14', 'C20', 'C8']) },
    { key: 'hotSwap', label: 'Hot-Swap (redundant)', type: 'bool' },
  ],
  fan: [
    { key: 'sizeMm', label: 'Größe', type: 'select', options: [40, 60, 80, 92, 120, 140].map((x) => ({ value: x, label: `${x} mm` })) },
    { key: 'rpm', label: 'Drehzahl', type: 'number', unit: 'U/min', min: 300, max: 30000, step: 100 },
    { key: 'airflowCFM', label: 'Luftstrom', type: 'number', unit: 'CFM', min: 1, max: 300 },
  ],
  mainboard: [
    { key: 'formFactor', label: 'Formfaktor', type: 'select', options: opts(['Mini-ITX', 'mATX', 'ATX', 'E-ATX', 'SSI-EEB']) },
    { key: 'socket', label: 'CPU-Sockel', type: 'select', options: opts(['LGA4677', 'LGA4189', 'LGA3647', 'SP5', 'SP3', 'LGA1700', 'LGA1851', 'LGA1200', 'AM5', 'AM4']) },
    { key: 'sockets', label: 'Anzahl Sockel', type: 'select', options: opts([1, 2]) },
    { key: 'memoryType', label: 'Speichertyp', type: 'select', options: opts(['DDR4', 'DDR5']) },
    { key: 'dimmsPerCpu', label: 'DIMM-Slots je CPU', type: 'number', min: 1, max: 16 },
    { key: 'memoryModule', label: 'Modultyp', type: 'select', options: opts(['UDIMM', 'RDIMM']) },
    { key: 'maxMemoryGB', label: 'Max. RAM', type: 'number', unit: 'GB', min: 8, max: 8192 },
    { key: 'sataPorts', label: 'SATA-Ports', type: 'number', min: 0, max: 16 },
    { key: 'nvmePorts', label: 'NVMe/U.2-Anschlüsse', type: 'number', min: 0, max: 16 },
    { key: 'eccSupport', label: 'ECC-Unterstützung', type: 'bool' },
    { key: 'ipmi', label: 'IPMI / BMC', type: 'bool' },
    { key: 'chipset', label: 'Chipsatz', type: 'text' },
  ],
  bbu: [{ key: 'type', label: 'Typ', type: 'select', options: opts(['BBU', 'Supercap']) }],
  custom: [
    { key: 'category', label: 'Kategorie', type: 'text' },
    { key: 'description', label: 'Beschreibung', type: 'text' },
  ],
}
