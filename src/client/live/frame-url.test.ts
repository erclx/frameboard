import { describe, expect, it } from 'vitest'

import { frameOriginOf, onFramePort, otherLoopback } from './frame-url'

describe('otherLoopback', () => {
  it('names localhost for a 127.0.0.1 tab', () => {
    expect(otherLoopback('127.0.0.1')).toBe('localhost')
  })

  it('names 127.0.0.1 for a localhost tab', () => {
    expect(otherLoopback('localhost')).toBe('127.0.0.1')
  })

  it('names no other host for a tab on a LAN address', () => {
    expect(otherLoopback('192.168.1.20')).toBeNull()
  })

  it('names no other host for the IPv6 loopback, which the frame port never binds', () => {
    expect(otherLoopback('[::1]')).toBeNull()
  })
})

describe('frameOriginOf', () => {
  it('joins the host and port the store holds', () => {
    expect(frameOriginOf({ framePort: 47123, frameHost: '127.0.0.1' })).toBe(
      'http://127.0.0.1:47123',
    )
  })

  it('names no origin before the socket hands them over', () => {
    expect(frameOriginOf({ framePort: null, frameHost: null })).toBeNull()
  })
})

describe('onFramePort', () => {
  it('puts the path on the origin given', () => {
    expect(
      onFramePort('/frames/a/b/c.html?theme=dark', 'http://127.0.0.1:47123'),
    ).toBe('http://127.0.0.1:47123/frames/a/b/c.html?theme=dark')
  })

  it('names no URL before the origin is settled', () => {
    expect(onFramePort('/frames/a/b/c.html', null)).toBeNull()
  })
})
