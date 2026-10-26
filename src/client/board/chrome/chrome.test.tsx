import '../../styles.css'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { type Action, registerActions } from '@/client/actions/registry'
import { TooltipProvider } from '@/client/components/ui/tooltip'
import type { ProjectRecord } from '@/shared/records/list'

import { reportZoom } from '../view'
import { initials } from './author'
import { AvatarMenu } from './avatar-menu'
import { HiddenPills } from './hidden-pills'
import { ZoomControl } from './zoom-control'

const cleanups: (() => void)[] = []

function register(...actions: Action[]): void {
  cleanups.push(registerActions(actions))
}

function counted(id: string, label: string): Action & { runs: number } {
  const made = {
    id,
    label,
    group: 'view',
    runs: 0,
    run: () => {
      made.runs += 1
    },
  }
  return made
}

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
  act(() => reportZoom(1))
})

describe('AvatarMenu', () => {
  it('names who notes are signed as, from git', async () => {
    render(<AvatarMenu name="Eric Le" />)

    await userEvent.click(screen.getByRole('button', { name: /Eric Le/ }))

    expect(await screen.findByText('From git user.name')).toBeInTheDocument()
  })

  it('leaves the name row out when git has no name', async () => {
    render(<AvatarMenu name={null} />)

    await userEvent.click(screen.getByRole('button', { name: 'Account' }))

    await screen.findByRole('menu')
    expect(screen.queryByText('From git user.name')).toBeNull()
  })

  it('shows Keyboard shortcuts disabled until its action registers', async () => {
    render(<AvatarMenu name="Eric Le" />)

    await userEvent.click(screen.getByRole('button', { name: /Eric Le/ }))

    expect(
      await screen.findByRole('menuitem', { name: /Keyboard shortcuts/ }),
    ).toHaveAttribute('aria-disabled', 'true')
  })
})

describe('initials', () => {
  it('takes the first letters of the first two words', () => {
    expect(initials('eric van le')).toBe('EV')
  })
})

describe('ZoomControl', () => {
  it('shows the zoom level the canvas reports', () => {
    render(<ZoomControl />)

    act(() => reportZoom(0.35))

    expect(screen.getByRole('button', { name: 'Zoom' })).toHaveTextContent(
      '35%',
    )
  })

  it('runs the zoom action picked from its menu', async () => {
    const hundred = counted('view.zoom100', '100%')
    register(hundred)
    render(<ZoomControl />)

    await userEvent.click(screen.getByRole('button', { name: 'Zoom' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: '100%' }))

    expect(hundred.runs).toBe(1)
  })
})

describe('HiddenPills', () => {
  const studio: ProjectRecord = {
    name: 'studio',
    path: '/board/studio',
    modifiedAt: '2026-10-15T00:00:00.000Z',
    createdAt: null,
    projectFileError: null,
    pages: [],
  }

  function renderPills() {
    render(
      <TooltipProvider>
        <HiddenPills project={studio} page="home" />
      </TooltipProvider>,
    )
  }

  it('brings the panels back from the project pill', async () => {
    const hideUi = counted('view.hideUi', 'Hide UI')
    register(hideUi)
    renderPills()

    await userEvent.click(screen.getByRole('button', { name: 'Show UI' }))

    expect(hideUi.runs).toBe(1)
  })

  it('links home from the project pill', () => {
    renderPills()

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/',
    )
  })

  it("opens the project's menu from the project pill", async () => {
    const home = counted('nav.home', 'All projects')
    register(home)
    renderPills()

    await userEvent.click(screen.getByRole('button', { name: 'Project menu' }))
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'All projects' }),
    )

    expect(home.runs).toBe(1)
  })
})
