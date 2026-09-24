import { describe, expect, it } from 'vitest'
import { createDemoProject } from '@/data/sampleProject'
import { bomCsv, cableCsv, ipamCsv, normalizeProject, projectToJson, ImportError } from '@/utils/importExport'

describe('import / export', () => {
  it('round-trips a project through JSON', () => {
    const p = createDemoProject()
    const back = normalizeProject(JSON.parse(projectToJson(p)))
    expect(back).toEqual(p)
  })

  it('assigns a new id on import and drops dangling connections', () => {
    const p = createDemoProject()
    const raw = JSON.parse(projectToJson(p))
    const firstDevice = Object.keys(raw.devices)[0]
    delete raw.devices[firstDevice]
    const back = normalizeProject(raw, { newId: true })
    expect(back.id).not.toBe(p.id)
    expect(Object.values(back.connections).every((c) => back.devices[c.a.deviceId] && back.devices[c.b.deviceId])).toBe(true)
  })

  it('rejects invalid files', () => {
    expect(() => normalizeProject({ foo: 1 })).toThrow(ImportError)
    expect(() => normalizeProject({ schemaVersion: 99, devices: {} })).toThrow(ImportError)
  })

  it('creates CSV exports', () => {
    const p = createDemoProject()
    expect(bomCsv(p).split('\n').length).toBeGreaterThan(50)
    expect(cableCsv(p)).toContain('Core Switch')
    expect(ipamCsv(p)).toContain('192.168.20.10')
  })
})
