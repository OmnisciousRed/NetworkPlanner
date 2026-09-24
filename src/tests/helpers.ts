import type { HardwareBuild, HardwareComponent } from '@/models'
import { findComponentTemplate } from '@/data/componentCatalog'
import { findChassisTemplate } from '@/data/chassisCatalog'
import { createChassisFromTemplate, createComponent } from '@/utils/factory'
import { addComponent } from '@/utils/buildOps'

export function emptyBuild(chassisId = 'ch-2u'): HardwareBuild {
  return { chassis: createChassisFromTemplate(findChassisTemplate(chassisId)!), components: [], links: [] }
}

export function part(templateId: string): HardwareComponent {
  const t = findComponentTemplate(templateId)
  if (!t) throw new Error(`missing template ${templateId}`)
  return createComponent(t)
}

export function add(build: HardwareBuild, templateId: string): HardwareComponent {
  return addComponent(build, part(templateId))
}
