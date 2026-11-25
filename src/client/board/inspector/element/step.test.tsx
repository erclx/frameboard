import '../../../styles.css'

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { StepAttributes } from '@/shared/present-steps'

import { StepSection } from './step'
import type { ElementChange } from './write'

const NO_STEP: StepAttributes = { step: null, effect: null, start: null }

/** Renders the section over `step`, answering the changes it writes. */
function mount(
  step: StepAttributes,
  previews: string[] = [],
  clip?: 'held' | 'none',
) {
  const written: ElementChange[] = []
  render(
    <StepSection
      step={step}
      clip={clip}
      disabled={false}
      write={async (change) => {
        written.push(change)
        return true
      }}
      onPreview={(effect) => previews.push(effect)}
      onPreviewEnd={() => previews.push('end')}
    />,
  )
  return written
}

const field = () => screen.getByRole('textbox', { name: 'Appears on step' })

describe('the step field', () => {
  it('describes the field as a place in the order, which is not a press', () => {
    mount(NO_STEP)

    expect(field()).toHaveAccessibleDescription(
      'Its place in the order a slide’s steps show while presenting. Edit mode and export show every step.',
    )
  })

  it('focuses the field on a click of its label', async () => {
    mount(NO_STEP)

    await userEvent.click(screen.getByText('Appears on step'))

    expect(field()).toHaveFocus()
  })

  it('writes data-step on Enter', async () => {
    const written = mount(NO_STEP)

    await userEvent.type(field(), '3{Enter}')

    expect(written).toEqual([
      { kind: 'attribute', name: 'data-step', value: '3' },
    ])
  })

  it('drops data-step once emptied', async () => {
    const written = mount({ step: '2', effect: 'fade', start: null })

    await userEvent.clear(field())
    await userEvent.tab()

    expect(written).toEqual([
      { kind: 'attribute', name: 'data-step', remove: true },
    ])
  })

  it('puts the stored value back on a number below one, writing nothing', async () => {
    const written = mount({ step: '2', effect: null, start: null })

    await userEvent.clear(field())
    await userEvent.type(field(), '0{Enter}')

    expect(written).toEqual([])
    expect(field()).toHaveValue('2')
  })

  it('offers Effect and Starts only once the element holds a step', () => {
    mount(NO_STEP)

    expect(screen.queryAllByRole('radiogroup')).toEqual([])
  })

  it('writes data-step-effect from the Effect tiles', async () => {
    const written = mount({ step: '1', effect: null, start: null })
    const effects = screen.getByRole('radiogroup', { name: 'Effect' })

    await userEvent.click(within(effects).getByRole('radio', { name: 'Fly' }))

    expect(written).toEqual([
      { kind: 'attribute', name: 'data-step-effect', value: 'fly' },
    ])
  })

  it('reads an unknown effect as Appear', () => {
    mount({ step: '1', effect: 'spin', start: null })
    const effects = screen.getByRole('radiogroup', { name: 'Effect' })

    expect(
      within(effects).getByRole('radio', { checked: true }),
    ).toHaveAccessibleName('Appear')
  })

  it('previews a hovered effect on the element, writing nothing', async () => {
    const previews: string[] = []
    const written = mount({ step: '1', effect: null, start: null }, previews)
    const effects = screen.getByRole('radiogroup', { name: 'Effect' })

    await userEvent.hover(within(effects).getByRole('radio', { name: 'Wipe' }))

    expect([previews, written]).toEqual([['wipe'], []])
  })

  it('previews a hovered effect for the step’s own length', async () => {
    const lengths: number[] = []
    render(
      <StepSection
        step={{ step: '1', effect: 'fade', start: null, duration: '900' }}
        disabled={false}
        write={async () => true}
        onPreview={(_effect, ms) => lengths.push(ms)}
      />,
    )

    await userEvent.hover(screen.getByRole('radio', { name: 'Wipe' }))

    expect(lengths).toEqual([900])
  })

  it('writes data-step-start from the Starts buttons', async () => {
    const written = mount({ step: '2', effect: null, start: null })
    const starts = screen.getByRole('radiogroup', { name: 'Starts' })

    await userEvent.click(
      within(starts).getByRole('radio', { name: 'With last' }),
    )

    expect(written).toEqual([
      { kind: 'attribute', name: 'data-step-start', value: 'with' },
    ])
  })

  it('moves the start with an arrow key', async () => {
    const written = mount({ step: '2', effect: null, start: 'with' })
    const starts = screen.getByRole('radiogroup', { name: 'Starts' })
    within(starts).getByRole('radio', { name: 'With last' }).focus()

    await userEvent.keyboard('{ArrowRight}')

    expect(written).toEqual([
      { kind: 'attribute', name: 'data-step-start', value: 'after' },
    ])
  })
})

describe('the step’s own time', () => {
  const FADE: StepAttributes = { step: '2', effect: 'fade', start: null }
  const number = (name: string) => screen.getByRole('textbox', { name })

  /** Types `value` into the field named `name` and commits it. */
  async function type(name: string, value: string) {
    await userEvent.clear(number(name))
    await userEvent.type(number(name), `${value}{Enter}`)
  }

  it('shows the defaults on a step holding neither', () => {
    mount(FADE)

    expect(number('Duration')).toHaveValue('400 ms')
    expect(number('Delay')).toHaveValue('0 ms')
  })

  it('shows what the step holds', () => {
    mount({ ...FADE, duration: '900', delay: '250' })

    expect(number('Duration')).toHaveValue('900 ms')
    expect(number('Delay')).toHaveValue('250 ms')
  })

  it('offers neither before the element holds a step', () => {
    mount(NO_STEP)

    expect(screen.queryByRole('textbox', { name: 'Duration' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Delay' })).toBeNull()
  })

  it('writes data-step-duration from a typed length', async () => {
    const written = mount(FADE)

    await type('Duration', '900')

    expect(written).toEqual([
      { kind: 'attribute', name: 'data-step-duration', value: '900' },
    ])
  })

  it('writes data-step-delay from a typed delay', async () => {
    const written = mount(FADE)

    await type('Delay', '250')

    expect(written).toEqual([
      { kind: 'attribute', name: 'data-step-delay', value: '250' },
    ])
  })

  it('drops each attribute back at its resting value', async () => {
    const written = mount({ ...FADE, duration: '900', delay: '250' })

    await type('Duration', '400')
    await type('Delay', '0')

    expect(written).toEqual([
      { kind: 'attribute', name: 'data-step-duration', remove: true },
      { kind: 'attribute', name: 'data-step-delay', remove: true },
    ])
  })

  it('holds a typed length inside its range', async () => {
    const written = mount(FADE)

    await type('Duration', '90000')

    expect(written).toEqual([
      { kind: 'attribute', name: 'data-step-duration', value: '5000' },
    ])
  })

  it('writes a whole number for a fraction', async () => {
    const written = mount(FADE)

    await type('Delay', '250.6')

    expect(written).toEqual([
      { kind: 'attribute', name: 'data-step-delay', value: '251' },
    ])
  })

  it('holds Duration off on an Appear, which runs none', () => {
    mount({ step: '1', effect: null, start: null, duration: '900' })

    expect(number('Duration')).toBeDisabled()
    expect(number('Duration')).toHaveValue('')
    expect(number('Delay')).toBeEnabled()
  })
})

describe('the Play switch', () => {
  const STEP: StepAttributes = { step: '1', effect: null, start: null }
  const play = () =>
    screen.queryByRole('switch', { name: 'Play as it appears' })

  it('shows on an element holding a clip alone', () => {
    mount(STEP)

    expect(play()).toBeNull()
  })

  it('writes data-step-play turned on', async () => {
    const written = mount(STEP, [], 'held')

    await userEvent.click(play() as HTMLElement)

    expect(written).toEqual([
      { kind: 'attribute', name: 'data-step-play', value: '' },
    ])
  })

  it('drops data-step-play turned off', async () => {
    const written = mount({ ...STEP, play: '' }, [], 'held')

    await userEvent.click(play() as HTMLElement)

    expect(written).toEqual([
      { kind: 'attribute', name: 'data-step-play', remove: true },
    ])
  })

  it('turns on nothing for a model with no clip, saying why', () => {
    mount(STEP, [], 'none')

    expect(play()).toBeDisabled()
    expect(screen.getByText('No clip in this file')).toBeVisible()
  })

  it('turns off on a model with no clip, so the file can drop it', async () => {
    const written = mount({ ...STEP, play: '' }, [], 'none')

    await userEvent.click(play() as HTMLElement)

    expect(written).toEqual([
      { kind: 'attribute', name: 'data-step-play', remove: true },
    ])
  })
})
