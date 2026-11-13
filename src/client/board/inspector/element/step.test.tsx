import '../../../styles.css'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { type LiveStep, StepSection } from './step'
import type { ElementChange } from './write'

const NO_STEP: LiveStep = { step: null, effect: null, start: null }

/** Renders the section over `step`, answering the changes it writes. */
function mount(step: LiveStep) {
  const written: ElementChange[] = []
  render(
    <StepSection
      step={step}
      disabled={false}
      write={async (change) => {
        written.push(change)
        return true
      }}
    />,
  )
  return written
}

const field = () => screen.getByRole('textbox', { name: 'Appears on step' })

describe('the step field', () => {
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

  it('offers Effect and Start only once the element holds a step', () => {
    mount(NO_STEP)

    expect(screen.queryByRole('button', { name: 'Effect' })).toBeNull()
  })

  it('writes data-step-effect from the Effect menu', async () => {
    const written = mount({ step: '1', effect: null, start: null })

    await userEvent.click(screen.getByRole('button', { name: 'Effect' }))
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Fly in' }),
    )

    expect(written).toEqual([
      { kind: 'attribute', name: 'data-step-effect', value: 'fly' },
    ])
  })

  it('reads an unknown effect as Appear', () => {
    mount({ step: '1', effect: 'spin', start: null })

    expect(screen.getByRole('button', { name: 'Effect' })).toHaveTextContent(
      'Appear',
    )
  })
})
