import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  DropdownMenu,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
import { Toaster } from '@/client/components/ui/toast'
import { liveStore } from '@/client/live/store'
import { createStructure } from '@/client/live/structure'

import { ChromeMenuContent } from '../chrome/menu'
import { RulesOff } from './rules-off'

function renderMenu(checksOff: string[], calls = server().calls) {
  render(
    <>
      <DropdownMenu>
        <DropdownMenuTrigger>Project menu</DropdownMenuTrigger>
        <ChromeMenuContent>
          <RulesOff project={{ name: 'studio', checksOff }} calls={calls} />
        </ChromeMenuContent>
      </DropdownMenu>
      <Toaster />
    </>,
  )
}

function server(answer = () => Response.json({ ok: true, data: {} })) {
  const sent: { path: string; body: unknown }[] = []
  const calls = createStructure(async (path, init) => {
    sent.push({ path: String(path), body: JSON.parse(String(init?.body)) })
    return answer()
  })
  return { sent, calls }
}

async function openRules() {
  await userEvent.click(screen.getByRole('button', { name: 'Project menu' }))
  await userEvent.click(
    await screen.findByRole('menuitem', { name: 'Rules turned off' }),
  )
}

describe('RulesOff', () => {
  beforeEach(() => {
    liveStore.setState({ connected: true, canWrite: true })
  })

  afterEach(() => {
    cleanup()
  })

  it('lists each rule the project turns off, one written by hand among them', async () => {
    renderMenu(['generic-font', 'retired-rule'])

    await openRules()

    expect(
      (await screen.findAllByRole('menuitem', { name: /, Turn on$/ })).map(
        (row) => row.getAttribute('aria-label'),
      ),
    ).toEqual(['generic-font, Turn on', 'retired-rule, Turn on'])
  })

  it('disables the submenu where the project turns no rule off', async () => {
    renderMenu([])

    await userEvent.click(screen.getByRole('button', { name: 'Project menu' }))

    expect(
      await screen.findByRole('menuitem', { name: 'Rules turned off' }),
    ).toHaveAttribute('aria-disabled', 'true')
  })

  it('turns the pressed rule on for the project', async () => {
    const { sent, calls } = server()
    renderMenu(['generic-font', 'theme'], calls)
    await openRules()

    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'theme, Turn on' }),
    )

    await expect
      .poll(() => sent)
      .toEqual([
        {
          path: '/api/project/rule',
          body: { project: 'studio', rule: 'theme', off: false },
        },
      ])
  })

  it('names the rule and the project in a toast once it is on', async () => {
    renderMenu(['theme'])
    await openRules()

    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'theme, Turn on' }),
    )

    expect(
      await screen.findByText('Turned on theme in studio'),
    ).toBeInTheDocument()
  })

  it('toasts that the rule stays off when the server refuses', async () => {
    const { calls } = server(() =>
      Response.json(
        { ok: false, error: { code: 'project-not-found', message: 'Gone' } },
        { status: 404 },
      ),
    )
    renderMenu(['theme'], calls)
    await openRules()

    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'theme, Turn on' }),
    )

    expect(
      await screen.findByText('Could not turn on theme'),
    ).toBeInTheDocument()
  })

  it('lists the rules and presses none in a tab that may not write', async () => {
    liveStore.setState({ canWrite: false })
    const { sent, calls } = server()
    renderMenu(['theme'], calls)
    await openRules()

    const row = await screen.findByRole('menuitem', { name: 'theme' })
    await userEvent.click(row)

    expect([row.getAttribute('aria-disabled'), sent]).toEqual(['true', []])
  })
})
