import '../../styles.css'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { TooltipProvider } from '@/client/components/ui/tooltip'

import { ActionTooltip } from './action-tooltip'
import { focusWithoutTooltip } from './quiet-focus'

function renderPresentButton() {
  render(
    <TooltipProvider>
      <button type="button">Before</button>
      <ActionTooltip label="Present page">
        <button type="button" aria-label="Present page" />
      </ActionTooltip>
    </TooltipProvider>,
  )
  return screen.getByRole('button', { name: 'Present page' })
}

describe('ActionTooltip', () => {
  it('opens on keyboard focus', async () => {
    renderPresentButton()
    screen.getByRole('button', { name: 'Before' }).focus()

    await userEvent.tab()

    expect(await screen.findByText('Present page')).toBeInTheDocument()
  })

  it('stays shut when the app moves focus back to its control', async () => {
    const button = renderPresentButton()
    await userEvent.keyboard('{Shift}')

    act(() => focusWithoutTooltip(button))
    await new Promise((resolve) => requestAnimationFrame(resolve))

    expect(document.activeElement).toBe(button)
    expect(screen.queryByText('Present page')).toBeNull()
  })

  it('opens again on the next focus a person gives it', async () => {
    const button = renderPresentButton()
    act(() => focusWithoutTooltip(button))

    await userEvent.tab({ shift: true })
    await userEvent.tab()

    expect(await screen.findByText('Present page')).toBeInTheDocument()
  })
})
