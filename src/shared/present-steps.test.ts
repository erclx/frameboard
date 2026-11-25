import { describe, expect, it } from 'vitest'

import {
  groupSteps,
  reorderSteps,
  type Step,
  type StepAttributes,
  stepOf,
} from './present-steps'

const NONE: StepAttributes = { step: null, effect: null, start: null }

/** A step as its attributes read, with what this case depends on. */
function stepWith(attributes: Partial<StepAttributes>, tag = 'p'): Step {
  const step = stepOf(tag, { ...NONE, step: '1', ...attributes })
  if (!step) throw new Error('No step')
  return step
}

/** Steps in document order, each named for what it stands on. */
function steps(
  ...all: (Partial<StepAttributes> & { id: string })[]
): { of: string; step: Step }[] {
  return all.map(({ id, ...attributes }) => ({
    of: id,
    step: stepWith(attributes),
  }))
}

/** Each press's steps by name. */
function presses(all: { of: string; step: Step }[]): string[][] {
  return groupSteps(all).map((group) => group.map(({ of }) => of))
}

/** Each step's wait past its press by name, across every press. */
function waits(all: { of: string; step: Step }[]): Record<string, number> {
  return Object.fromEntries(
    groupSteps(all)
      .flat()
      .map(({ of, waitMs }) => [of, waitMs]),
  )
}

describe('stepOf', () => {
  it('reads a step holding its number alone at every default', () => {
    expect(stepOf('p', { ...NONE, step: '2' })).toEqual({
      number: 2,
      effect: 'appear',
      start: 'click',
      durationMs: 400,
      delayMs: 0,
      plays: false,
    })
  })

  it('reads every attribute a step holds', () => {
    expect(
      stepOf('video', {
        step: '3',
        effect: 'fly',
        start: 'after',
        duration: '900',
        delay: '250',
        play: '',
      }),
    ).toEqual({
      number: 3,
      effect: 'fly',
      start: 'after',
      durationMs: 900,
      delayMs: 250,
      plays: true,
    })
  })

  it.each(['', '0', 'two', '-1', '1.5'])('reads %j as no step', (number) => {
    expect(stepOf('p', { ...NONE, step: number })).toBeNull()
  })

  it('reads an unknown effect as appear and an unknown start as click', () => {
    expect(stepWith({ effect: 'spin', start: 'later' })).toMatchObject({
      effect: 'appear',
      start: 'click',
    })
  })

  it.each(['', '99', '5001', '400.5', 'long', '-400'])(
    'reads a duration of %j as the default',
    (duration) => {
      expect(stepWith({ duration }).durationMs).toBe(400)
    },
  )

  it.each([
    ['100', 100],
    ['5000', 5000],
  ])('keeps a duration of %s at the end of its range', (duration, ms) => {
    expect(stepWith({ duration }).durationMs).toBe(ms)
  })

  it.each(['', '-1', '10001', '0.5', 'soon'])(
    'reads a delay of %j as none',
    (delay) => {
      expect(stepWith({ delay }).delayMs).toBe(0)
    },
  )

  it('keeps the longest delay', () => {
    expect(stepWith({ delay: '10000' }).delayMs).toBe(10_000)
  })

  it.each([
    ['video', true],
    ['model-viewer', true],
    ['audio', false],
    ['p', false],
  ])('reads a play on a %s as %j', (tag, plays) => {
    expect(stepWith({ play: '' }, tag).plays).toBe(plays)
  })
})

describe('groupSteps', () => {
  it('orders steps by number, keeping document order for ties', () => {
    expect(
      presses(
        steps(
          { id: 'c', step: '3' },
          { id: 'a', step: '1' },
          { id: 'b', step: '2' },
        ),
      ),
    ).toEqual([['a'], ['b'], ['c']])
  })

  it('closes gaps and shows equal numbers together', () => {
    expect(
      presses(
        steps(
          { id: 'one', step: '1' },
          { id: 'three', step: '3' },
          { id: 'three-too', step: '3' },
          { id: 'seven', step: '7' },
        ),
      ),
    ).toEqual([['one'], ['three', 'three-too'], ['seven']])
  })

  it('starts the first step on the press whatever its start', () => {
    expect(
      presses(
        steps({ id: 'a', step: '1', start: 'after' }, { id: 'b', step: '2' }),
      ),
    ).toEqual([['a'], ['b']])
  })

  it('starts a with-last step beside the one before it', () => {
    expect(
      waits(
        steps(
          { id: 'a', step: '1', effect: 'fade' },
          { id: 'b', step: '2', start: 'with' },
        ),
      ),
    ).toEqual({ a: 0, b: 0 })
  })

  it('starts an after-last step once the one before it finishes', () => {
    expect(
      waits(
        steps(
          { id: 'a', step: '1', effect: 'fly' },
          { id: 'b', step: '2', effect: 'fade', start: 'after' },
          { id: 'c', step: '3', start: 'after' },
        ),
      ),
    ).toEqual({ a: 0, b: 400, c: 800 })
  })

  it('counts an after-last step from the end of a step with its own length', () => {
    expect(
      waits(
        steps(
          { id: 'a', step: '1', effect: 'fly', duration: '1500' },
          { id: 'b', step: '2', start: 'after' },
        ),
      ),
    ).toEqual({ a: 0, b: 1500 })
  })

  it('counts no length for an appear, which holds one and runs none', () => {
    expect(
      waits(
        steps(
          { id: 'a', step: '1', duration: '1500' },
          { id: 'b', step: '2', start: 'after' },
        ),
      ),
    ).toEqual({ a: 0, b: 0 })
  })

  it('waits a step’s own delay past the press', () => {
    expect(waits(steps({ id: 'a', step: '1', delay: '300' }))).toEqual({
      a: 300,
    })
  })

  it('counts a with-last step from the start of the one before it without its delay', () => {
    expect(
      waits(
        steps(
          { id: 'a', step: '1', effect: 'fade', delay: '1000' },
          { id: 'b', step: '2', start: 'with', delay: '200' },
        ),
      ),
    ).toEqual({ a: 1000, b: 200 })
  })

  it('counts an after-last step from the end of the one before it with its delay', () => {
    expect(
      waits(
        steps(
          { id: 'a', step: '1', effect: 'fade', delay: '1000' },
          { id: 'b', step: '2', start: 'after', delay: '50' },
        ),
      ),
    ).toEqual({ a: 1000, b: 1450 })
  })

  it('counts a step sharing a number as one starting with the last', () => {
    expect(
      waits(
        steps(
          { id: 'a', step: '1', effect: 'fade', delay: '1000' },
          { id: 'b', step: '1' },
        ),
      ),
    ).toEqual({ a: 1000, b: 0 })
  })

  it('names how each step starts as the walk plays it', () => {
    const groups = groupSteps(
      steps(
        { id: 'first', step: '1', start: 'after' },
        { id: 'shares', step: '1' },
        { id: 'after', step: '1', start: 'after' },
        { id: 'next', step: '2' },
      ),
    )

    expect(
      groups.map((group) => group.map(({ of, start }) => [of, start])),
    ).toEqual([
      [
        ['first', 'click'],
        ['shares', 'with'],
        ['after', 'after'],
      ],
      [['next', 'click']],
    ])
  })
})

describe('reorderSteps', () => {
  it('numbers every row from 1 in its new order', () => {
    expect(
      reorderSteps(
        steps(
          { id: 'a', step: '1' },
          { id: 'b', step: '4' },
          { id: 'c', step: '9' },
        ),
        2,
        0,
      ),
    ).toEqual([
      { of: 'c', name: 'data-step', value: '1' },
      { of: 'a', name: 'data-step', value: '2' },
      { of: 'b', name: 'data-step', value: '3' },
    ])
  })

  it('counts its places in the order the walk plays', () => {
    expect(
      reorderSteps(
        steps({ id: 'second', step: '2' }, { id: 'first', step: '1' }),
        0,
        1,
      ),
    ).toEqual([
      { of: 'second', name: 'data-step', value: '1' },
      { of: 'first', name: 'data-step', value: '2' },
    ])
  })

  it('leaves a row whose number already stands alone', () => {
    expect(
      reorderSteps(
        steps(
          { id: 'a', step: '1' },
          { id: 'b', step: '2' },
          { id: 'c', step: '3' },
        ),
        1,
        2,
      ),
    ).toEqual([
      { of: 'c', name: 'data-step', value: '2' },
      { of: 'b', name: 'data-step', value: '3' },
    ])
  })

  it('writes with on a row that shared its press by its number', () => {
    expect(
      reorderSteps(
        steps(
          { id: 'a', step: '1' },
          { id: 'shares', step: '1' },
          { id: 'b', step: '2' },
          { id: 'c', step: '3' },
        ),
        3,
        2,
      ),
    ).toEqual([
      { of: 'shares', name: 'data-step', value: '2' },
      { of: 'shares', name: 'data-step-start', value: 'with' },
      { of: 'b', name: 'data-step', value: '4' },
    ])
  })

  it('writes the press a first row showed once another row goes ahead of it', () => {
    expect(
      reorderSteps(
        steps({ id: 'a', step: '1', start: 'after' }, { id: 'b', step: '2' }),
        1,
        0,
      ),
    ).toEqual([
      { of: 'b', name: 'data-step', value: '1' },
      { of: 'a', name: 'data-step', value: '2' },
      { of: 'a', name: 'data-step-start', value: 'click' },
    ])
  })

  it('keeps the start of a row left first, which starts on the press anyway', () => {
    expect(
      reorderSteps(
        steps({ id: 'a', step: '1' }, { id: 'b', step: '2', start: 'with' }),
        1,
        0,
      ),
    ).toEqual([
      { of: 'b', name: 'data-step', value: '1' },
      { of: 'a', name: 'data-step', value: '2' },
    ])
  })

  it('plays an untouched press the same once renumbered', () => {
    const before = steps(
      { id: 'a', step: '1' },
      { id: 'b', step: '1', effect: 'fade' },
      { id: 'c', step: '2', start: 'after' },
      { id: 'd', step: '5' },
      { id: 'e', step: '7' },
    )

    const written = reorderSteps(before, 4, 3)

    const held = (of: string, name: string) =>
      written.find((write) => write.of === of && write.name === name)?.value
    const after = before.map(({ of, step }) => ({
      of,
      step: stepWith({
        step: held(of, 'data-step') ?? String(step.number),
        start: held(of, 'data-step-start') ?? step.start,
        effect: step.effect,
      }),
    }))
    expect([presses(before), presses(after)]).toEqual([
      [['a', 'b', 'c'], ['d'], ['e']],
      [['a', 'b', 'c'], ['e'], ['d']],
    ])
  })

  it('writes nothing for a row that is not there', () => {
    expect(reorderSteps(steps({ id: 'a', step: '1' }), 4, 0)).toEqual([])
  })
})
