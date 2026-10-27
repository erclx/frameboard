import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { wireCopyCommands } from './copy-command'

function renderCommand(): HTMLElement {
  document.body.innerHTML = `
    <div data-copy>
      <code>npx frameboard serve</code>
      <button type="button" hidden>Copy</button>
      <span role="status"></span>
    </div>`
  return document.body
}

function stubClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
}

afterEach(() => {
  if (vi.isFakeTimers()) vi.runOnlyPendingTimers()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('wireCopyCommands', () => {
  it('shows the copy button once scripts run', () => {
    const root = renderCommand()

    wireCopyCommands(root)

    expect(screen.getByRole('button', { name: 'Copy' })).toBeVisible()
  })

  it('copies the command and confirms it', async () => {
    const root = renderCommand()
    const user = userEvent.setup()
    const written: string[] = []
    stubClipboard(async (text) => {
      written.push(text)
    })
    wireCopyCommands(root)

    await user.click(screen.getByRole('button', { name: 'Copy' }))
    await vi.waitFor(() => {
      expect(screen.getByRole('button')).toHaveTextContent('Copied')
    })

    expect(written).toEqual(['npx frameboard serve'])
    expect(screen.getByRole('status')).toHaveTextContent('Command copied')
  })

  it('selects the command for a manual copy when the clipboard refuses', async () => {
    const root = renderCommand()
    const user = userEvent.setup()
    stubClipboard(() => Promise.reject(new Error('denied')))
    wireCopyCommands(root)

    await user.click(screen.getByRole('button', { name: 'Copy' }))
    await vi.waitFor(() => {
      expect(screen.getByRole('button')).toHaveTextContent('Press Ctrl+C')
    })

    expect(window.getSelection()?.toString()).toBe('npx frameboard serve')
  })

  it('puts the label back after two seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const root = renderCommand()
    stubClipboard(async () => {})
    wireCopyCommands(root)

    // A real click event, since userEvent waits on timers this test fakes.
    screen.getByRole('button', { name: 'Copy' }).click()
    await vi.advanceTimersByTimeAsync(0)
    expect(screen.getByRole('button')).toHaveTextContent('Copied')
    await vi.advanceTimersByTimeAsync(2000)

    expect(screen.getByRole('button')).toHaveTextContent('Copy')
    expect(screen.getByRole('status')).toHaveTextContent('')
  })
})
