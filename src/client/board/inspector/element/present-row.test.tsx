import '../../../styles.css'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import type { StepAttributes } from '@/shared/present-steps'

import { inspectorTabStore } from '../tab-store'
import { InspectorTabs } from '../tabs'
import { PresentRow } from './present-row'

const NO_STEP: StepAttributes = { step: null, effect: null, start: null }

beforeEach(() => {
  inspectorTabStore.setState({ tab: 'design' })
})

/** The Design tab holding the row, beside a Slides tab standing for the element's steps. */
function mount(step: StepAttributes) {
  render(
    <InspectorTabs
      design={<PresentRow step={step} />}
      slides={<p>The element’s step</p>}
      export={null}
    />,
  )
}

describe('the Present row', () => {
  it('names the step an element holds', () => {
    mount({ step: '2', effect: 'fly', start: 'with' })

    expect(
      screen.getByRole('button', { name: /^Step 2, Fly/ }),
    ).toBeInTheDocument()
  })

  it('reads an element with no step, or a bad number, as no step', () => {
    mount({ step: '0', effect: 'fly', start: null })

    expect(
      screen.getByRole('button', { name: /^Not a step/ }),
    ).toBeInTheDocument()
  })

  it('opens the Slides tab from an element holding a step', async () => {
    mount({ step: '2', effect: null, start: null })

    await userEvent.click(screen.getByRole('button'))

    expect(screen.getByText('The element’s step')).toBeVisible()
  })

  it('opens the Slides tab from an element holding none', async () => {
    mount(NO_STEP)

    await userEvent.click(screen.getByRole('button'))

    expect(screen.getByText('The element’s step')).toBeVisible()
  })

  it('moves focus to the tab it opened, since it leaves with its own', async () => {
    mount(NO_STEP)
    screen.getByRole('button').focus()

    await userEvent.keyboard('{Enter}')

    expect(screen.getByRole('tab', { name: 'Slides' })).toHaveFocus()
  })
})
