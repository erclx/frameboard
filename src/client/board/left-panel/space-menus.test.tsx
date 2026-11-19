import '../../styles.css'

import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { registerActions } from '@/client/actions/registry'
import { TooltipProvider } from '@/client/components/ui/tooltip'
import { liveStore, receiveClaims } from '@/client/live/store'
import type { ProjectRecord } from '@/shared/records/list'
import { frameOf, pageOf } from '@/test/board'

import { menuPlace } from '../menus/actions'
import { LayersList } from './layers-list'
import { PagesList } from './pages-list'
import { LeftPanel } from './panel'

const cleanups: (() => void)[] = []

afterEach(() => {
  cleanup()
  while (cleanups.length > 0) cleanups.pop()?.()
})

/** Registers an action that counts its runs, enabled as asked. */
function counted(id: string, label: string, enabled = true) {
  const runs = { count: 0 }
  cleanups.push(
    registerActions([
      {
        id,
        label,
        group: 'page',
        palette: false,
        enabled: () => enabled,
        run: () => (runs.count += 1),
      },
    ]),
  )
  return runs
}

function space(root: HTMLElement): Element {
  const found = root.querySelector('li[aria-hidden]')
  if (!found) throw new Error('no empty space')
  return found
}

function renderPages() {
  const pages = [pageOf([], 'home'), pageOf([], 'about')]
  return render(
    <Router hook={memoryLocation({ path: '/' }).hook}>
      <TooltipProvider>
        <PagesList pages={pages} current="home" />
      </TooltipProvider>
    </Router>,
  )
}

describe('the empty space menus', () => {
  it('opens New page below the last page and runs it', async () => {
    const runs = counted('page.new', 'New page')
    const { container } = renderPages()

    await userEvent.pointer({ keys: '[MouseRight]', target: space(container) })
    await userEvent.click(
      await screen.findByRole('menuitem', { name: /^New page/ }),
    )

    expect(runs.count).toBe(1)
  })

  it('opens a page row its own menu, never the space', async () => {
    counted('page.new', 'New page')
    renderPages()

    await userEvent.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('link', { name: 'home' }),
    })

    const menu = await screen.findByRole('menu')
    expect(within(menu).getByText('Page')).toBeInTheDocument()
    expect(within(menu).queryByText('Pages')).toBeNull()
  })

  it('opens New frame and Paste below the last layer', async () => {
    const added = counted('frame.newAt', 'New frame here')
    counted('frame.paste', 'Paste', false)
    const { container } = render(
      <TooltipProvider>
        <LayersList frames={[frameOf('hero')]} />
      </TooltipProvider>,
    )

    await userEvent.pointer({ keys: '[MouseRight]', target: space(container) })
    const menu = await screen.findByRole('menu')
    expect(
      within(menu)
        .getByRole('menuitem', { name: /^Paste/ })
        .hasAttribute('data-disabled'),
    ).toBe(true)
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: /^New frame/ }),
    )

    expect(added.count).toBe(1)
  })

  it('opens New frame on a page with no frames', async () => {
    const added = counted('frame.newAt', 'New frame here')
    const { container } = render(
      <TooltipProvider>
        <LayersList frames={[]} />
      </TooltipProvider>,
    )

    await userEvent.pointer({
      keys: '[MouseRight]',
      target: container.querySelector('div[aria-hidden]') as Element,
    })
    await userEvent.click(
      await screen.findByRole('menuitem', { name: /^New frame/ }),
    )

    expect(added.count).toBe(1)
  })

  it('places New frame past an agent reservation on a page with no frames', async () => {
    counted('frame.newAt', 'New frame here')
    act(() =>
      receiveClaims(liveStore, [
        {
          frame: 'studio/home/pricing',
          session: 'sess-a',
          agent: 'claude',
          tag: 'claude · a',
          claimedAt: '2026-10-19T10:00:00.000Z',
          expiresAt: '2999-01-01T00:00:00.000Z',
          box: { x: 0, y: 0, width: 300, height: 200 },
          set: 'set-1',
        },
      ]),
    )
    cleanups.push(() => act(() => receiveClaims(liveStore, [])))
    const { container } = render(
      <TooltipProvider>
        <LayersList shown="studio/home" frames={[]} />
      </TooltipProvider>,
    )

    await userEvent.pointer({
      keys: '[MouseRight]',
      target: container.querySelector('div[aria-hidden]') as Element,
    })
    await screen.findByRole('menu')

    expect(menuPlace.getState().at).toEqual({ x: 300 + 80, y: 0 })
  })

  it('places New frame past the drawn width of the last frame, linked widths included', async () => {
    counted('frame.newAt', 'New frame here')
    const wide = frameOf('wide', {
      box: { x: 0, y: 40, width: 400, height: 300 },
      widths: [{ width: 200, height: 300 }],
    })
    const { container } = render(
      <TooltipProvider>
        <LayersList frames={[wide]} />
      </TooltipProvider>,
    )

    await userEvent.pointer({ keys: '[MouseRight]', target: space(container) })
    await screen.findByRole('menu')

    // The linked width draws one gap past the frame, then the gap past that.
    expect(menuPlace.getState().at).toEqual({ x: 400 + 80 + 200 + 80, y: 40 })
  })
})

describe('the empty space size', () => {
  function renderPanel(): HTMLElement {
    const home = pageOf([frameOf('hero')], 'home')
    const record: ProjectRecord = {
      name: 'studio',
      path: '/board/studio',
      modifiedAt: '2026-10-15T00:00:00.000Z',
      title: null,
      createdAt: null,
      group: null,
      archived: false,
      projectFileError: null,
      transitions: [],
      checksOff: [],
      kits: [],
      pages: [home],
    }
    const { container } = render(
      <Router hook={memoryLocation({ path: '/' }).hook}>
        <TooltipProvider>
          <div className="h-[600px]">
            <LeftPanel
              project={record}
              page="home"
              storage={{ getItem: () => null, setItem: () => {} }}
            />
          </div>
        </TooltipProvider>
      </Router>,
    )
    return container
  }

  it('fills the pages list below its last row', () => {
    const container = renderPanel()
    const nav = container.querySelector('nav[aria-labelledby="pages-heading"]')
    const filler = nav?.querySelector('li[aria-hidden]')
    expect(filler?.getBoundingClientRect().height).toBeGreaterThan(40)
  })

  it('fills the layers list below its last row', () => {
    const container = renderPanel()
    const section = container.querySelector(
      'section[aria-labelledby="layers-heading"]',
    )
    const filler = section?.querySelector('li[aria-hidden]')
    expect(filler?.getBoundingClientRect().height).toBeGreaterThan(40)
  })
})
