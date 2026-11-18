import { describe, expect, it } from 'vitest'

import {
  BRIDGE_TAG,
  isElementAddress,
  isElementBox,
  readBridgeMessage,
} from './frame-bridge'

const ORIGIN = 'http://127.0.0.1:4000'

function from(data: unknown, origin = ORIGIN) {
  return readBridgeMessage({ data, origin }, ORIGIN)
}

describe('readBridgeMessage', () => {
  it('reads a request with its op and arguments', () => {
    const args = { index: 3, hash: 'a' }

    expect(
      from({
        tag: BRIDGE_TAG,
        kind: 'request',
        id: 'r1',
        op: 'text-edit',
        args,
      }),
    ).toEqual({
      tag: BRIDGE_TAG,
      kind: 'request',
      id: 'r1',
      op: 'text-edit',
      args,
    })
  })

  it('reads a reply carrying a value', () => {
    expect(
      from({
        tag: BRIDGE_TAG,
        kind: 'reply',
        id: 'r1',
        ok: true,
        value: false,
      }),
    ).toEqual({
      tag: BRIDGE_TAG,
      kind: 'reply',
      id: 'r1',
      ok: true,
      value: false,
    })
  })

  it('reads a reply carrying an error', () => {
    expect(
      from({ tag: BRIDGE_TAG, kind: 'reply', id: 'r1', ok: false, error: 'x' }),
    ).toEqual({
      tag: BRIDGE_TAG,
      kind: 'reply',
      id: 'r1',
      ok: false,
      error: 'x',
    })
  })

  it('reads a pushed result under its subscription id', () => {
    const value = { kind: 'closed' }

    expect(from({ tag: BRIDGE_TAG, kind: 'push', id: 'r1', value })).toEqual({
      tag: BRIDGE_TAG,
      kind: 'push',
      id: 'r1',
      value,
    })
  })

  it('reads a close', () => {
    expect(from({ tag: BRIDGE_TAG, kind: 'close', id: 'r1' })).toEqual({
      tag: BRIDGE_TAG,
      kind: 'close',
      id: 'r1',
    })
  })

  it('refuses a message from another origin', () => {
    expect(
      from(
        { tag: BRIDGE_TAG, kind: 'close', id: 'r1' },
        'http://127.0.0.1:4001',
      ),
    ).toBeNull()
  })

  it.each([
    ['a string', 'frameboard-bridge'],
    ['null', null],
    ['an untagged message', { kind: 'close', id: 'r1' }],
    ['a message with no id', { tag: BRIDGE_TAG, kind: 'close' }],
    ['a message with an empty id', { tag: BRIDGE_TAG, kind: 'close', id: '' }],
    ['an unknown kind', { tag: BRIDGE_TAG, kind: 'hello', id: 'r1' }],
    [
      'a request for an unknown op',
      { tag: BRIDGE_TAG, kind: 'request', id: 'r1', op: 'eval', args: {} },
    ],
    [
      'a reply with no outcome',
      { tag: BRIDGE_TAG, kind: 'reply', id: 'r1', value: true },
    ],
    [
      'an error reply with no message',
      { tag: BRIDGE_TAG, kind: 'reply', id: 'r1', ok: false },
    ],
  ])('refuses %s', (_case, data) => {
    expect(from(data)).toBeNull()
  })
})

describe('isElementAddress', () => {
  it('accepts an index and a hash', () => {
    expect(isElementAddress({ index: 0, hash: 'a' })).toBe(true)
  })

  it.each([
    ['a negative index', { index: -1, hash: 'a' }],
    ['a fractional index', { index: 1.5, hash: 'a' }],
    ['a missing hash', { index: 1 }],
    ['null', null],
  ])('refuses %s', (_case, value) => {
    expect(isElementAddress(value)).toBe(false)
  })
})

describe('isElementBox', () => {
  it('accepts four finite edges', () => {
    expect(isElementBox({ left: 0, top: 1, right: 2, bottom: 3 })).toBe(true)
  })

  it.each([
    ['a missing edge', { left: 0, top: 1, right: 2 }],
    [
      'an edge that is not a number',
      { left: '0', top: 1, right: 2, bottom: 3 },
    ],
    ['an infinite edge', { left: 0, top: 1, right: Infinity, bottom: 3 }],
  ])('refuses %s', (_case, value) => {
    expect(isElementBox(value)).toBe(false)
  })
})
