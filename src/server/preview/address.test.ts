import type { NetworkInterfaceInfo } from 'node:os'

import { describe, expect, it } from 'vitest'

import { networkAddress, previewLink } from './address'

function ipv4(address: string, internal = false): NetworkInterfaceInfo {
  return {
    address,
    netmask: '255.255.255.0',
    family: 'IPv4',
    mac: '00:00:00:00:00:00',
    internal,
    cidr: `${address}/24`,
  }
}

describe('networkAddress', () => {
  it('picks a Wi-Fi 192.168 address over a container bridge in 172.16 to 172.31', () => {
    const address = networkAddress({
      docker0: [ipv4('172.17.0.1')],
      wlan0: [ipv4('192.168.1.24')],
    })

    expect(address).toBe('192.168.1.24')
  })

  it('takes a 172.16 to 172.31 address when the machine holds no other', () => {
    expect(networkAddress({ eth0: [ipv4('172.24.36.187')] })).toBe(
      '172.24.36.187',
    )
  })

  it('answers null for a machine with only loopback, link-local, and public addresses', () => {
    const address = networkAddress({
      lo: [ipv4('127.0.0.1', true)],
      eth0: [ipv4('169.254.10.2'), ipv4('8.8.4.4')],
    })

    expect(address).toBeNull()
  })
})

describe('previewLink', () => {
  it('lands on one frame, encoding each name', () => {
    const link = previewLink({
      address: '192.168.1.24',
      port: 4400,
      token: 'k3P9xQ',
      project: 'drive 32',
      page: 'page-1',
      frame: 'feed',
    })

    expect(link).toBe(
      'http://192.168.1.24:4400/v/k3P9xQ/frames/drive%2032/page-1/feed.html',
    )
  })
})
