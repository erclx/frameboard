import { afterEach, describe, expect, it } from 'vitest'

import { setActiveStep } from './walkthrough'

function renderWalk(): HTMLElement {
  document.body.innerHTML = `
    <div data-walk>
      <ol>
        <li class="step on" data-step="0" aria-current="step">Writes</li>
        <li class="step" data-step="1">Checks</li>
        <li class="step" data-step="2">Tweak</li>
      </ol>
      <div class="stick">
        <img alt="" data-step="0" />
        <img alt="" data-step="1" hidden />
        <img alt="" data-step="2" hidden />
      </div>
    </div>`
  const walk = document.querySelector<HTMLElement>('[data-walk]')
  if (!walk) throw new Error('walk did not render')
  return walk
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('setActiveStep', () => {
  it('marks only the step being read as current', () => {
    const walk = renderWalk()

    setActiveStep(walk, 2)

    const current = walk.querySelectorAll('[aria-current="step"]')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveTextContent('Tweak')
    expect(walk.querySelectorAll('.step.on')).toHaveLength(1)
  })

  it('shows the still paired with the step and hides the rest', () => {
    const walk = renderWalk()

    setActiveStep(walk, 1)

    const shown = walk.querySelectorAll('.stick img:not([hidden])')
    expect(shown).toHaveLength(1)
    expect(shown[0]).toHaveAttribute('data-step', '1')
  })

  it('leaves the step list itself visible', () => {
    const walk = renderWalk()

    setActiveStep(walk, 1)

    expect(walk.querySelectorAll('.step[hidden]')).toHaveLength(0)
  })
})
