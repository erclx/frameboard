import { describe, expect, it } from 'vitest'

import { resolveTransition, transitionOf } from './present-transition'

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
