import type { Rack } from '@/models'

export type RackPreset = Omit<Rack, 'id' | 'name'> & {
  id: string
  label: string
  description: string
  defaultName?: string
}

export const RACK_PRESETS: RackPreset[] = [
  {
    id: 'r19-42',
    label: '19" · 42 HE Serverschrank',
    description: 'Standard-Serverschrank, 600 × 1000 mm',
    standard: '19',
    heightU: 42,
    depthMm: 1000,
    widthMm: 600,
    maxLoadKg: 1000,
    emptyWeightKg: 87,
    maxPowerW: 3680,
    airflowM3h: 1000,
  },
  {
    id: 'r19-24',
    label: '19" · 24 HE',
    description: 'Halbhoher Serverschrank, 600 × 800 mm',
    standard: '19',
    heightU: 24,
    depthMm: 800,
    widthMm: 600,
    maxLoadKg: 600,
    emptyWeightKg: 58,
    maxPowerW: 3680,
    airflowM3h: 800,
  },
  {
    id: 'r19-12',
    label: '19" · 12 HE Wandschrank',
    description: 'Wandverteiler, 600 × 450 mm',
    standard: '19',
    heightU: 12,
    depthMm: 450,
    widthMm: 600,
    maxLoadKg: 60,
    emptyWeightKg: 25,
    maxPowerW: 3680,
    airflowM3h: 300,
  },
  {
    id: 'r10-deskpi-t2',
    label: '10" · 12 HE DeskPi RackMate T2',
    description: 'Offenes 10-Zoll-Mini-Rack, ca. 280 × 260 × 590 mm, ca. 6,9 kg',
    defaultName: 'DeskPi RackMate T2',
    standard: '10',
    heightU: 12,
    depthMm: 260,
    widthMm: 280,
    maxLoadKg: 30,
    emptyWeightKg: 6.9,
    maxPowerW: 3680,
    airflowM3h: 200,
    notes: 'Maße und Gewicht laut Herstellerangaben. Die maximale Traglast nennt der Hersteller nicht – 30 kg ist ein Schätzwert.',
  },
  {
    id: 'r10-8',
    label: '10" · 8 HE',
    description: 'Kleines 10-Zoll-Rack für Tisch oder Wand',
    standard: '10',
    heightU: 8,
    depthMm: 300,
    widthMm: 280,
    maxLoadKg: 30,
    emptyWeightKg: 5,
    maxPowerW: 3680,
    airflowM3h: 200,
  },
  {
    id: 'r10-6',
    label: '10" · 6 HE Wandgehäuse',
    description: 'Kleiner 10-Zoll-Wandverteiler',
    standard: '10',
    heightU: 6,
    depthMm: 250,
    widthMm: 310,
    maxLoadKg: 20,
    emptyWeightKg: 4,
    maxPowerW: 3680,
    airflowM3h: 150,
  },
]

export function findRackPreset(id: string) {
  return RACK_PRESETS.find((p) => p.id === id)
}
