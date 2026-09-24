import { describe, expect, it } from 'vitest'
import { formatIp, inDhcpRange, ipInCidr, isValidCidr, nextFreeIp, parseCidr, parseIp, collectIpam } from '@/utils/ip'
import { createProject } from '@/utils/factory'
import type { Vlan } from '@/models'
import { createDemoProject } from '@/data/sampleProject'

describe('ip utilities', () => {
  it('parses and formats addresses', () => {
    expect(parseIp('192.168.10.1')).toBe(3232238081)
    expect(formatIp(3232238081)).toBe('192.168.10.1')
    expect(parseIp('300.1.1.1')).toBeNull()
    expect(parseIp('abc')).toBeNull()
  })

  it('computes subnet information', () => {
    const c = parseCidr('192.168.20.0/24')!
    expect(formatIp(c.first)).toBe('192.168.20.1')
    expect(formatIp(c.last)).toBe('192.168.20.254')
    expect(formatIp(c.broadcast)).toBe('192.168.20.255')
    expect(c.hosts).toBe(254)
    expect(ipInCidr('192.168.20.77', c)).toBe(true)
    expect(ipInCidr('192.168.21.1', c)).toBe(false)
    expect(isValidCidr('192.168.20.0/24')).toBe(true)
    expect(isValidCidr('192.168.20.5/24')).toBe(false)
    expect(parseCidr('10.0.0.0/30')!.hosts).toBe(2)
  })

  it('finds the next free address outside gateway and DHCP range', () => {
    const p = createProject()
    const v: Vlan = {
      id: 'v1',
      tag: 20,
      name: 'Servers',
      color: '#0f0',
      subnet: '10.0.0.0/29',
      gateway: '10.0.0.1',
      dhcp: { enabled: true, rangeStart: '10.0.0.2', rangeEnd: '10.0.0.4' },
    }
    p.vlans[v.id] = v
    expect(inDhcpRange(v, '10.0.0.3')).toBe(true)
    expect(nextFreeIp(p, v.id)).toBe('10.0.0.5')
  })

  it('the demo IP plan has no conflicts, and duplicates are detected', () => {
    const p = createDemoProject()
    expect(collectIpam(p).filter((e) => e.issues.length)).toEqual([])
    const entries = collectIpam(p)
    const withIp = entries.filter((e) => e.ip)
    // duplicate the first address on another interface
    const other = entries.find((e) => e.deviceId !== withIp[0].deviceId && e.ip)!
    const dev = p.devices[other.deviceId]
    const port = [...dev.ports, ...(dev.build?.components.flatMap((c) => c.ports ?? []) ?? [])].find((x) => x.id === other.portId)!
    port.ipAddress = withIp[0].ip
    expect(collectIpam(p).some((e) => e.issues.includes('IP-Adresse mehrfach vergeben'))).toBe(true)
  })
})
