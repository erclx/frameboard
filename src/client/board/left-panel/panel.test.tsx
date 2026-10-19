import '../../styles.css'

import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { registerActions } from '@/client/actions/registry'
import { TooltipProvider } from '@/client/components/ui/tooltip'
import { liveStore } from '@/client/live/store'
import { createStructure } from '@/client/live/structure'
import type {
  FrameRecord,
  PageRecord,
  ProjectRecord,
} from '@/shared/records/list'

import { LeftPanel } from './panel'

function frame(name: string, extra: Partial<FrameRecord> = {}): FrameRecord {
  return {
    ref: `studio/home/${name}`,
    project: 'studio',
    page: 'home',
    name,
    path: `/board/studio/home/${name}.html`,
    box: { x: 0, y: 0, width: 400, height: 300 },
    order: 0,
    hidden: false,
    locked: false,
    placed: true,
    modifiedAt: '2026-10-15T00:00:00.000Z',
    ...extra,
  }
}

function page(name: string, frames: FrameRecord[] = [], index = 0): PageRecord {
  return {
    ref: `studio/${name}`,
    project: 'studio',
    name,
    path: `/board/studio/${name}`,
    index,
    layoutError: null,
    frames,
  }
}

function project(pages: PageRecord[]): ProjectRecord {
  return {
    name: 'studio',
    path: '/board/studio',
    modifiedAt: '2026-10-15T00:00:00.000Z',
    createdAt: null,
    projectFileError: null,
    pages,
  }
}

/** A request the panel sent, by route and body. */
interface Sent {
  path: string
  body: unknown
}

/** Answers every write with `data`, recording what was sent. */
function server(data: unknown = {}) {
  const sent: Sent[] = []
  const calls = createStructure(async (path, init) => {
    sent.push({ path: String(path), body: JSON.parse(String(init?.body)) })
    return Response.json({ ok: true, data })
  })
  return { sent, calls }
}

function renderPanel(
  record: ProjectRecord,
  current = 'home',
  assets?: ReactNode,
  {
    calls,
    storage,
  }: {
    calls?: ReturnType<typeof createStructure>
    storage?: Map<string, string>
  } = {},
) {
  const location = memoryLocation({ path: '/', record: true })
  const kept = storage ?? new Map<string, string>()
  render(
    <Router hook={location.hook}>
      <TooltipProvider>
        {/* The panel fills a board's column, so the divider has a height to share. */}
        <div className="h-[600px]">
          <LeftPanel
            project={record}
            page={current}
            assets={assets}
            calls={calls}
            storage={{
              getItem: (key) => kept.get(key) ?? null,
              setItem: (key, value) => kept.set(key, value),
            }}
          />
        </div>
      </TooltipProvider>
    </Router>,
  )
  return location
}

const THREE = () =>
  project([page('home', [], 0), page('pricing', [], 1), page('about', [], 2)])

const cleanups: (() => void)[] = []

beforeEach(() => {
  liveStore.setState({ canWrite: true })
})

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
  liveStore.setState({ canWrite: false })
})

describe('LeftPanel', () => {
  it('opens on the Design tab with Theme waiting on its body', () => {
    renderPanel(project([page('home')]))

    expect(screen.getByRole('tab', { name: 'Design' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: 'Theme' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('leaves Assets disabled with no body and opens it when given one', async () => {
    renderPanel(project([page('home')]))
    expect(screen.getByRole('tab', { name: 'Assets' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    cleanup()

    renderPanel(project([page('home')]), 'home', <p>the files</p>)
    await userEvent.click(screen.getByRole('tab', { name: 'Assets' }))

    expect(screen.getByText('the files')).toBeVisible()
  })

  it("lists the page's frames, a hidden one marked so", () => {
    renderPanel(
      project([
        page('home', [frame('hero'), frame('footer', { hidden: true })]),
      ]),
    )

    expect(
      screen.getAllByRole('listitem').map((item) => item.ariaLabel),
    ).toContain('footer, hidden')
  })

  it('says when the page has no frames', () => {
    renderPanel(project([page('home')]))

    expect(screen.getByText('No frames on this page')).toBeInTheDocument()
  })

  it('hides the UI from its header button', async () => {
    let runs = 0
    cleanups.push(
      registerActions([
        {
          id: 'view.hideUi',
          label: 'Hide UI',
          group: 'view',
          run: () => (runs += 1),
        },
      ]),
    )
    renderPanel(project([page('home')]))

    await userEvent.click(screen.getByRole('button', { name: 'Hide UI' }))

    expect(runs).toBe(1)
  })

  describe('pages', () => {
    it('adds a page through page.new', async () => {
      let runs = 0
      cleanups.push(
        registerActions([
          {
            id: 'page.new',
            label: 'Add page',
            group: 'page',
            run: () => (runs += 1),
          },
        ]),
      )
      renderPanel(THREE())

      await userEvent.click(screen.getByRole('button', { name: 'Add page' }))

      expect(runs).toBe(1)
    })

    it('renames the page on the canvas inline and follows it', async () => {
      const { sent, calls } = server(page('start', [], 0))
      const location = renderPanel(THREE(), 'home', undefined, { calls })

      await userEvent.dblClick(screen.getByRole('link', { name: 'home' }))
      const field = screen.getByRole('textbox', { name: 'Rename page home' })
      expect(field).toHaveFocus()
      await userEvent.keyboard('start{Enter}')

      expect(sent).toEqual([
        {
          path: '/api/page/rename',
          body: { ref: 'studio/home', name: 'start' },
        },
      ])
      await expect.poll(() => location.history.at(-1)).toBe('/p/studio/start')
    })

    it('cancels a rename on Esc and writes nothing', async () => {
      const { sent, calls } = server()
      renderPanel(THREE(), 'home', undefined, { calls })

      await userEvent.dblClick(screen.getByRole('link', { name: 'pricing' }))
      await userEvent.keyboard('{Escape}')

      expect(screen.queryByRole('textbox')).toBeNull()
      expect(screen.getByRole('link', { name: 'pricing' })).toBeVisible()
      expect(sent).toEqual([])
    })

    it('deletes the focused page on the canvas and moves to the next', async () => {
      const { sent, calls } = server({ deleted: 'studio/home' })
      const location = renderPanel(THREE(), 'home', undefined, { calls })

      act(() => screen.getByRole('link', { name: 'home' }).focus())
      await userEvent.keyboard('{Delete}')

      expect(sent).toEqual([
        { path: '/api/page/delete', body: { ref: 'studio/home' } },
      ])
      await expect.poll(() => location.history.at(-1)).toBe('/p/studio/pricing')
    })

    it('keeps the canvas where it is when deleting another page', async () => {
      const { calls } = server({ deleted: 'studio/about' })
      const location = renderPanel(THREE(), 'home', undefined, { calls })

      act(() => screen.getByRole('link', { name: 'about' }).focus())
      await userEvent.keyboard('{Delete}')

      expect(location.history).toEqual(['/'])
    })

    it('filters the pages by name and marks the match', async () => {
      renderPanel(THREE())

      await userEvent.click(
        screen.getByRole('button', { name: 'Search pages' }),
      )
      await userEvent.keyboard('RIC')

      const pages = screen.getByRole('navigation', { name: 'Pages' })
      expect(
        within(pages)
          .getAllByRole('link')
          .map((link) => link.textContent),
      ).toEqual(['pricing'])
      expect(within(pages).getByText('ric').tagName).toBe('MARK')
    })

    it('says when no page matches the search', async () => {
      renderPanel(THREE())

      await userEvent.click(
        screen.getByRole('button', { name: 'Search pages' }),
      )
      await userEvent.keyboard('zzz')

      expect(screen.getByText('No page names match zzz')).toBeVisible()
    })

    it('closes the search on Esc and lists every page again', async () => {
      renderPanel(THREE())
      await userEvent.click(
        screen.getByRole('button', { name: 'Search pages' }),
      )
      await userEvent.keyboard('ric')

      await userEvent.keyboard('{Escape}')

      expect(screen.queryByRole('textbox', { name: 'Search pages' })).toBeNull()
      expect(
        within(screen.getByRole('navigation', { name: 'Pages' })).getAllByRole(
          'link',
        ),
      ).toHaveLength(3)
    })

    it('remembers where the divider was dragged to', async () => {
      const storage = new Map<string, string>()
      renderPanel(THREE(), 'home', undefined, { storage })
      const divider = screen.getByRole('separator', {
        name: 'Resize the pages list',
      })
      act(() => divider.focus())
      await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
      const moved = divider.getAttribute('aria-valuenow')
      await expect.poll(() => storage.size).toBe(1)
      cleanup()

      renderPanel(THREE(), 'home', undefined, { storage })

      expect(
        screen
          .getByRole('separator', { name: 'Resize the pages list' })
          .getAttribute('aria-valuenow'),
      ).toBe(moved)
    })
  })
})
