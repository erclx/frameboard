import { describe, expect, it } from 'vitest'

import {
  BRIDGE_TAG,
  isElementAddress,
  isElementBox,
  isTextEditArgs,
  isTextEditEnd,
  pushValue,
  readBridgeMessage,
  REFUSED,
  replyValue,
  requestArgs,
} from './messages'

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

  it.each([
    ['a hash', 'c'.repeat(64)],
    ['a page going', null],
  ])('reads %s announced with no id', (_case, hash) => {
    expect(from({ tag: BRIDGE_TAG, kind: 'shown', page: 'p1', hash })).toEqual({
      tag: BRIDGE_TAG,
      kind: 'shown',
      page: 'p1',
      hash,
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
    [
      'a shown hash that is not text',
      { tag: BRIDGE_TAG, kind: 'shown', hash: 7 },
    ],
    ['a shown message with no hash', { tag: BRIDGE_TAG, kind: 'shown' }],
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

describe('isTextEditEnd', () => {
  it.each([
    ['a commit', { kind: 'commit', text: 'Hi', breaks: false }],
    [
      'a commit of one run',
      { kind: 'commit', text: 'Hi', breaks: false, run: 1 },
    ],
    ['a close', { kind: 'closed' }],
  ])('accepts %s', (_case, value) => {
    expect(isTextEditEnd(value)).toBe(true)
  })

  it.each([
    ['a commit with no text', { kind: 'commit', breaks: false }],
    ['a commit with no breaks flag', { kind: 'commit', text: 'Hi' }],
    ['an unknown kind', { kind: 'open' }],
    ['a negative run', { kind: 'commit', text: 'Hi', breaks: false, run: -1 }],
    [
      'a fractional run',
      { kind: 'commit', text: 'Hi', breaks: false, run: 0.5 },
    ],
  ])('refuses %s', (_case, value) => {
    expect(isTextEditEnd(value)).toBe(false)
  })
})

describe('isTextEditArgs', () => {
  it.each([
    ['an address alone', { index: 2, hash: 'a' }],
    ['an address with a point', { index: 2, hash: 'a', at: { x: 4, y: -1.5 } }],
    ['an address opening empty', { index: 2, hash: 'a', empty: true }],
  ])('accepts %s', (_case, value) => {
    expect(isTextEditArgs(value)).toBe(true)
  })

  it.each([
    ['a point with no y', { index: 2, hash: 'a', at: { x: 4 } }],
    [
      'a point that is not finite',
      { index: 2, hash: 'a', at: { x: NaN, y: 0 } },
    ],
    ['a point that is not a record', { index: 2, hash: 'a', at: 4 }],
    ['a bad address', { index: -1, hash: 'a', at: { x: 0, y: 0 } }],
    ['an empty flag that is not a boolean', { index: 2, hash: 'a', empty: 1 }],
  ])('refuses %s', (_case, value) => {
    expect(isTextEditArgs(value)).toBe(false)
  })
})

describe('replyValue', () => {
  it('reads a value its op replies with', () => {
    const box = { left: 0, top: 1, right: 2, bottom: 3 }

    expect(replyValue('element-box', box)).toEqual(box)
  })

  it('reads the null an op may reply with', () => {
    expect(replyValue('element-box', null)).toBeNull()
  })

  it.each([
    ['a box missing an edge', 'element-box', { left: 0, top: 1, right: 2 }],
    ['a count where a flag goes', 'restamp', 1],
    ['a value where none goes', 'text-written', true],
  ] as const)('refuses %s', (_case, op, value) => {
    expect(replyValue(op, value)).toBe(REFUSED)
  })
})

describe('pushValue', () => {
  it('reads what its op pushes', () => {
    expect(pushValue('text-edit', { kind: 'closed' })).toEqual({
      kind: 'closed',
    })
  })

  it('refuses a push its schema does not take', () => {
    expect(pushValue('text-edit', { kind: 'open' })).toBe(REFUSED)
  })

  it('refuses any push for an op that pushes nothing', () => {
    expect(pushValue('element-box', null)).toBe(REFUSED)
  })
})

describe('the chrome ops', () => {
  it.each([
    ['theme', { theme: 'dark' }],
    ['hide-scrollbar', {}],
    ['scroll', {}],
    ['scroll-act', { act: 'page', toward: -1 }],
    ['scroll-act', { act: 'to', top: 0.25 }],
    ['keys', { keys: ['Escape'], keepTyping: false }],
    ['focus-keys', {}],
    ['content-height', {}],
  ] as const)('takes the arguments %s carries', (op, args) => {
    expect(requestArgs(op, args)).toEqual(args)
  })

  it.each([
    ['a theme the board has none of', 'theme', { theme: 'sepia' }],
    ['a page move of two screens', 'scroll-act', { act: 'page', toward: 2 }],
    ['a scroll past the page', 'scroll-act', { act: 'to', top: Infinity }],
    ['a key list of one key', 'keys', { keys: 'Escape', keepTyping: false }],
    ['keys with no typing rule', 'keys', { keys: ['Escape'] }],
    ['arguments where none go', 'content-height', { at: 1 }],
    ['a key list where none goes', 'focus-keys', { keys: ['Tab'] }],
  ] as const)('refuses %s', (_case, op, args) => {
    expect(requestArgs(op, args)).toBe(REFUSED)
  })

  it('reads where the page shows as a scroll reply and push', () => {
    const view = { top: 0.5, size: 0.25 }

    expect(replyValue('scroll', view)).toEqual(view)
    expect(pushValue('scroll', null)).toBeNull()
  })

  it('reads the binding that fired as a key push', () => {
    const fired = { key: 'Escape', repeat: false }

    expect(pushValue('keys', fired)).toEqual(fired)
  })

  it('reads a key heard in the frame as a focus-keys push', () => {
    expect(pushValue('focus-keys', true)).toBe(true)
    expect(pushValue('focus-keys', { key: 'Tab' })).toBe(REFUSED)
  })

  it.each([
    ['a scroll view missing its size', 'scroll', { top: 0 }],
    ['a height of no pixels', 'content-height', 0],
  ] as const)('refuses a reply holding %s', (_case, op, value) => {
    expect(replyValue(op, value)).toBe(REFUSED)
  })
})

describe('the motion and present ops', () => {
  it.each([
    ['steps', { shown: 2 }],
    ['steps-show', { steps: 's1', shown: 1, entering: 0 }],
    ['steps-show', { steps: 's1', shown: 0, entering: null }],
    ['step-preview', { index: 4, effect: 'wipe' }],
    ['hold-animations', {}],
    ['hide-controls', {}],
    ['pointer-move', {}],
    ['keys', { keys: ['ArrowRight'], keepTyping: false, keepButtons: true }],
    ['motion', {}],
    ['motion-seek', { motion: 'm1', at: 1250 }],
    ['motion-release', { motion: 'm1' }],
    [
      'motion-moment',
      { motion: { source: 'css', duration: null }, span: 1500 },
    ],
    ['controls', {}],
    ['controls-act', { controls: 'c1', act: 'reset' }],
    ['controls-act', { controls: 'c1', act: 'settle' }],
    ['controls-edits', { controls: 'c1' }],
    ['takes-clicks', {}],
    ['bindings', {}],
    ['page-colors', {}],
  ] as const)('takes the arguments %s carries', (op, args) => {
    expect(requestArgs(op, args)).toEqual(args)
  })

  it.each([
    ['a step before the first', 'steps', { shown: -1 }],
    [
      'a step shown to no subscription',
      'steps-show',
      { shown: 1, entering: null },
    ],
    [
      'an entrance no slide tool has',
      'step-preview',
      { index: 0, effect: 'spin' },
    ],
    ['a seek to no moment', 'motion-seek', { motion: 'm1', at: Number.NaN }],
    [
      'an act the controls take none of',
      'controls-act',
      { controls: 'c1', act: 'keep' },
    ],
    ['arguments where none go', 'pointer-move', { every: 2 }],
  ] as const)('refuses %s', (_case, op, args) => {
    expect(requestArgs(op, args)).toBe(REFUSED)
  })

  it('reads a timeline pushed once it registers, and the null of none', () => {
    const found = { motion: { source: 'css', duration: 2000 }, span: 2000 }

    expect(pushValue('motion', found)).toEqual(found)
    expect(pushValue('motion', null)).toBeNull()
  })

  it('reads a keep batch with the hash it was read at', () => {
    const batch = {
      hash: 'a',
      edits: [
        { index: 3, change: { kind: 'attribute', name: 'value', value: '4' } },
        {
          index: 5,
          change: {
            kind: 'styles',
            declarations: [{ property: '--gap', value: '4px' }],
          },
        },
      ],
    }

    expect(replyValue('controls-edits', batch)).toEqual(batch)
  })

  it('reads the controls and targets a page draws', () => {
    const drawn = [
      {
        key: 0,
        control: { x: 1, y: 2, width: 3, height: 4 },
        target: null,
        label: '.card, no match',
      },
    ]

    expect(pushValue('bindings', drawn)).toEqual(drawn)
  })

  it.each([
    [
      'a timeline from no source the board reads',
      'motion',
      { motion: { source: 'gif', duration: 1 }, span: 1 },
    ],
    ['a moved count below none', 'controls', -1],
    ['a step count of a half press', 'steps', 1.5],
    ['a pointer move carrying a point', 'pointer-move', { x: 1, y: 2 }],
  ] as const)('refuses a push holding %s', (_case, op, value) => {
    expect(pushValue(op, value)).toBe(REFUSED)
  })

  it.each([
    ['a keep batch missing its hash', 'controls-edits', { edits: [] }],
    ['page colors with no ink', 'page-colors', { fill: null }],
    ['a moment before the start', 'motion-moment', -1],
  ] as const)('refuses a reply holding %s', (_case, op, value) => {
    expect(replyValue(op, value)).toBe(REFUSED)
  })
})
