import '../../../styles.css'

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { StepAttributes } from '@/shared/present-steps'

import { StepSection } from './step'
import type { ElementChange } from './write'

const NO_STEP: StepAttributes = { step: null, effect: null, start: null }

/** Renders the section over `step`, answering the changes it writes. */
function mount(step: StepAttributes, previews: string[] = []) {
  const written: ElementChange[] = []
  render(
    <StepSection
      step={step}
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
  it('describes the field with when its step shows', () => {
    mount(NO_STEP)

    expect(field()).toHaveAccessibleDescription(
      'Shown on that press while presenting. Edit mode and export show every step.',
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
