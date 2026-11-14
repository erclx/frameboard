import { describe, expect, it } from 'vitest'

import {
  isOwnTransitionName,
  ownKeyframesName,
  resolveTransition,
  storedTransitionOf,
  takesDirection,
  transitionLabel,
  transitionOf,
} from './present-transition'

describe('transitionOf', () => {
  it('reads a stored transition as written', () => {
    expect(transitionOf({ name: 'push', direction: 'up', ms: 300 })).toEqual({
      name: 'push',
      direction: 'up',
      ms: 300,
    })
  })

  it.each([
    ['an unknown name', { name: 'cube' }],
    ['a bare name', 'fade'],
    ['nothing', undefined],
    ['null', null],
  ])('reads %s as none', (_, value) => {
    expect(transitionOf(value)).toBeNull()
  })

  it.each([
    ['an unknown direction', { name: 'slide', direction: 'sideways' }],
    ['a duration below the floor', { name: 'slide', ms: 10 }],
    ['a fractional duration', { name: 'slide', ms: 250.5 }],
  ])('drops %s and keeps the name', (_, value) => {
    expect(transitionOf(value)).toEqual({ name: 'slide' })
  })
})

describe("a project's own transition", () => {
  it('reads a name the project holds as written', () => {
    expect(transitionOf({ name: 'wipe-up', ms: 300 }, ['wipe-up'])).toEqual({
      name: 'wipe-up',
      ms: 300,
    })
  })

  it('reads a name the project does not hold as none', () => {
    expect(transitionOf({ name: 'wipe-up' }, ['curtain'])).toBeNull()
  })

  it('drops a direction, since an own transition takes none', () => {
    expect(
      transitionOf({ name: 'wipe-up', direction: 'up' }, ['wipe-up']),
    ).toEqual({ name: 'wipe-up' })
  })

  it('keeps a name shaped like an own one for a writer, file or no file', () => {
    expect(storedTransitionOf({ name: 'wipe-up', ms: 300 })).toEqual({
      name: 'wipe-up',
      ms: 300,
    })
    expect(storedTransitionOf({ name: 'Wipe Up' })).toBeNull()
  })

  it('resolves with no direction and the default duration', () => {
    expect(resolveTransition({ name: 'wipe-up' }, null)).toEqual({
      name: 'wipe-up',
      direction: null,
      ms: 500,
    })
    expect(takesDirection('wipe-up')).toBe(false)
  })

  it.each(['wipe', 'wipe-up', 'curtain2', 'a'])(
    'accepts the name %s',
    (name) => {
      expect(isOwnTransitionName(name)).toBe(true)
    },
  )

  it.each([
    ['a built-in', 'fade'],
    ['none', 'none'],
    ['the word that clears an override', 'page'],
    ['capitals and a space', 'Wipe Up'],
    ['an underscore', 'wipe_up'],
    ['a doubled dash', 'wipe--up'],
    ['a leading dash', '-wipe'],
    ['nothing', ''],
    ['a name past the cap', 'a'.repeat(65)],
  ])('refuses %s', (_, name) => {
    expect(isOwnTransitionName(name)).toBe(false)
  })

  it('labels a built-in by its label and an own name as written', () => {
    expect(transitionLabel('fade')).toBe('Fade')
    expect(transitionLabel('wipe-up')).toBe('wipe-up')
  })

  it('names keyframes apart for two projects holding the same name', () => {
    expect(ownKeyframesName('webapp', 'wipe', 'enter')).toBe(
      'fb-own-webapp--wipe-enter',
    )
    expect(ownKeyframesName('web.app_2', 'wipe', 'leave')).toBe(
      'fb-own-web_2e_app_5f_2--wipe-leave',
    )
  })
})

describe('resolveTransition', () => {
  it('draws no transition when neither page nor frame holds one', () => {
    expect(resolveTransition(null, null)).toEqual({
      name: 'none',
      direction: null,
      ms: 0,
    })
  })

  it('takes the page transition with its defaults filled in', () => {
    expect(resolveTransition({ name: 'slide' }, undefined)).toEqual({
      name: 'slide',
      direction: 'left',
      ms: 500,
    })
  })

  it('lets a frame override win over its page', () => {
    expect(
      resolveTransition(
        { name: 'fade', ms: 800 },
        { name: 'push', direction: 'down' },
      ),
    ).toEqual({ name: 'push', direction: 'down', ms: 800 })
  })

  it('cuts on a frame override of none under a page transition', () => {
    expect(resolveTransition({ name: 'zoom' }, { name: 'none' })).toEqual({
      name: 'none',
      direction: null,
      ms: 0,
    })
  })

  it('gives an undirected transition no direction', () => {
    expect(
      resolveTransition({ name: 'flip', direction: 'up' }, null).direction,
    ).toBeNull()
  })
})
