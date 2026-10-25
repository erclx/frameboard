import '../../styles.css'

import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { bindKeys, registerActions } from '@/client/actions/registry'
import { TooltipProvider } from '@/client/components/ui/tooltip'
import { liveStore } from '@/client/live/store'
import { createStructure } from '@/client/live/structure'
import { unseenStore } from '@/client/live/unseen'
import { useProjectActions } from '@/client/projects/actions'
import type {
  FrameRecord,
  PageRecord,
  ProjectRecord,
} from '@/shared/records/list'

import { trees } from '../element/tree'
import { closeFind, findStore } from '../find/actions'
import { clear, selectElement, selectionStore } from '../selection'
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
    hugWidth: false,
    hugHeight: false,
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

const divider = () =>
  screen.getByRole('separator', { name: 'Resize the pages list' })

const splitAt = () => divider().getAttribute('aria-valuenow')

const OPEN_STUDIO = () => 'studio'

const THREE = () =>
  project([page('home', [], 0), page('pricing', [], 1), page('about', [], 2)])

const cleanups: (() => void)[] = []

beforeEach(() => {
  liveStore.setState({ canWrite: true })
})

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
  liveStore.setState({ canWrite: false })
  act(() => {
    unseenStore.setState({ unseen: {}, cursor: null })
    clear(selectionStore)
    trees.store.setState({ byRef: {} })
  })
})

const HERO = 'studio/home/hero'
const HASH = 'a'.repeat(64)

/** Holds hero's tree as the server would answer it: a card holding a headline, then a footer. */
function heroTree(): void {
  trees.store.setState({
    byRef: {
      [HERO]: {
        status: 'ready',
        version: 0,
        tree: {
          ref: HERO,
          hash: HASH,
          elements: [
            {
              index: 6,
              parent: null,
              tag: 'div',
              name: 'Card',
              textOnly: false,
            },
            {
              index: 7,
              parent: 6,
              tag: 'h1',
              name: 'Headline',
              textOnly: true,
            },
            {
              index: 8,
              parent: null,
              tag: 'footer',
              name: 'footer',
              textOnly: false,
            },
          ],
        },
      },
    },
  })
}

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

  it('shows find in place of the tabs under the same header while open, and the layers once closed', () => {
    renderPanel(project([page('home')]))

    act(() => findStore.setState({ open: true }))
    const finding = [
      screen.queryByRole('tab', { name: 'Design' }),
      screen.getByRole('combobox', { name: 'Find in studio' }),
      screen.getByRole('button', { name: 'Hide UI' }),
    ]
    act(() => closeFind())

    expect([
      finding[0],
      finding[1] !== null,
      finding[2] !== null,
      screen.getByRole('tab', { name: 'Design' }),
    ]).toEqual([null, true, true, expect.anything()])
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

  describe('the project header', () => {
    const atlas: ProjectRecord = {
      ...project([]),
      name: 'atlas',
      path: '/board/atlas',
      pages: [{ ...page('index'), ref: 'atlas/index', project: 'atlas' }],
    }

    /** The board's project actions on `studio`, with the board holding both projects. */
    function withProjectActions(calls: ReturnType<typeof createStructure>) {
      const studio = project([page('home')])
      liveStore.setState({
        board: { root: '/board', projects: [studio, atlas] },
      })
      const hook = renderHook(() => useProjectActions(OPEN_STUDIO, { calls }))
      cleanups.push(hook.unmount, () => liveStore.setState({ board: null }))
      return studio
    }

    it('renames the project from a click on its name and follows it', async () => {
      const { sent, calls } = server()
      const studio = withProjectActions(calls)
      const location = renderPanel(studio, 'home', undefined, { calls })

      await userEvent.click(screen.getByRole('button', { name: 'studio' }))
      const field = screen.getByRole('textbox', {
        name: 'Rename project studio',
      })
      await userEvent.clear(field)
      await userEvent.type(field, 'gallery{Enter}')

      await expect.poll(() => location.history?.at(-1)).toBe('/p/gallery/home')
      expect(sent).toEqual([
        {
          path: '/api/project/rename',
          body: { ref: 'studio', name: 'gallery' },
        },
      ])
    })

    it('duplicates the project from its menu', async () => {
      const { sent, calls } = server({ name: 'studio-copy' })
      const studio = withProjectActions(calls)
      renderPanel(studio, 'home', undefined, { calls })

      await userEvent.click(
        screen.getByRole('button', { name: 'Project menu' }),
      )
      await userEvent.click(
        await screen.findByRole('menuitem', { name: 'Duplicate' }),
      )

      await expect
        .poll(() => sent)
        .toEqual([{ path: '/api/project/duplicate', body: { ref: 'studio' } }])
    })

    it('switches to another project from its menu', async () => {
      const studio = withProjectActions(server().calls)
      const location = renderPanel(studio)

      await userEvent.click(
        screen.getByRole('button', { name: 'Project menu' }),
      )
      await userEvent.click(
        await screen.findByRole('menuitem', { name: 'Switch project' }),
      )
      await userEvent.click(
        await screen.findByRole('menuitem', { name: 'atlas' }),
      )

      expect(location.history?.at(-1)).toBe('/p/atlas/index')
    })

    it('goes to all projects from its menu', async () => {
      let runs = 0
      cleanups.push(
        registerActions([
          {
            id: 'nav.home',
            label: 'All projects',
            group: 'project',
            run: () => (runs += 1),
          },
        ]),
      )
      renderPanel(project([page('home')]))

      await userEvent.click(
        screen.getByRole('button', { name: 'Project menu' }),
      )
      await userEvent.click(
        await screen.findByRole('menuitem', { name: 'All projects' }),
      )

      expect(runs).toBe(1)
    })
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

    it('keeps a split per project', async () => {
      const storage = new Map<string, string>()
      renderPanel(THREE(), 'home', undefined, { storage })
      const fitted = splitAt()
      act(() => divider().focus())
      await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
      await expect.poll(() => storage.size).toBe(1)
      cleanup()

      renderPanel(
        { ...THREE(), name: 'marketing', path: '/board/marketing' },
        'home',
        undefined,
        { storage },
      )

      expect(splitAt()).toBe(fitted)
    })

    it('saves nothing for a double-click on a split already at its fit', async () => {
      const storage = new Map<string, string>()
      const kept = {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => void storage.set(key, value),
      }
      const location = memoryLocation({ path: '/', record: true })
      const panel = (record: ProjectRecord) => (
        <Router hook={location.hook}>
          <TooltipProvider>
            <div className="h-[600px]">
              <LeftPanel project={record} page="home" storage={kept} />
            </div>
          </TooltipProvider>
        </Router>
      )
      const { rerender } = render(panel(THREE()))
      await userEvent.dblClick(divider())

      rerender(
        panel({ ...THREE(), name: 'marketing', path: '/board/marketing' }),
      )

      await expect.poll(splitAt).not.toBeNull()
      expect(storage.size).toBe(0)
    })

    it('saves a double-click reset', async () => {
      const storage = new Map<string, string>()
      renderPanel(THREE(), 'home', undefined, { storage })
      const fitted = splitAt()
      act(() => divider().focus())
      await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
      await expect.poll(() => storage.size).toBe(1)
      await userEvent.dblClick(divider())
      await expect.poll(splitAt).toBe(fitted)
      cleanup()

      renderPanel(THREE(), 'home', undefined, { storage })

      expect(splitAt()).toBe(fitted)
    })
  })

  describe('element rows', () => {
    it("lists a frame's elements once its row opens", async () => {
      heroTree()
      renderPanel(project([page('home', [frame('hero')])]))

      await userEvent.click(
        screen.getByRole('button', { name: 'Show the elements of hero' }),
      )

      const rows = within(
        screen.getByRole('list', { name: 'Elements of hero' }),
      )
      expect(
        rows.getAllByRole('listitem').map((row) => row.textContent),
      ).toEqual(['Card', 'footer'])
    })

    it('selects the element a row names', async () => {
      heroTree()
      renderPanel(project([page('home', [frame('hero')])]))
      await userEvent.click(
        screen.getByRole('button', { name: 'Show the elements of hero' }),
      )

      await userEvent.click(screen.getByRole('button', { name: 'footer' }))

      expect(selectionStore.getState()).toEqual({
        page: 'studio/home',
        frames: [HERO],
        element: { frame: HERO, index: 8, hash: HASH },
      })
    })

    it('opens the frame and the rows above an element selected elsewhere', () => {
      heroTree()
      renderPanel(project([page('home', [frame('hero')])]))

      act(() =>
        selectElement(selectionStore, 'studio/home', {
          frame: HERO,
          index: 7,
          hash: HASH,
        }),
      )

      expect(screen.getByRole('button', { name: 'Headline' })).toHaveAttribute(
        'aria-current',
        'true',
      )
    })

    it('closes every row from the collapse-all button', async () => {
      heroTree()
      renderPanel(project([page('home', [frame('hero')])]))
      act(() =>
        selectElement(selectionStore, 'studio/home', {
          frame: HERO,
          index: 7,
          hash: HASH,
        }),
      )

      await userEvent.click(
        screen.getByRole('button', { name: 'Collapse all layers' }),
      )

      expect(
        screen.queryByRole('list', { name: 'Elements of hero' }),
      ).not.toBeInTheDocument()
    })

    describe('renaming an element', () => {
      /** Records each frame edit the board sends, answering it as written. */
      function edits() {
        const sent: unknown[] = []
        vi.stubGlobal(
          'fetch',
          async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).endsWith('/api/frames/edit')) {
              sent.push(JSON.parse(String(init?.body)))
            }
            return Response.json({ ok: true, data: { hash: 'b'.repeat(64) } })
          },
        )
        cleanups.push(() => vi.unstubAllGlobals())
        return sent
      }

      async function openHero() {
        heroTree()
        renderPanel(project([page('home', [frame('hero')])]))
        await userEvent.click(
          screen.getByRole('button', { name: 'Show the elements of hero' }),
        )
      }

      it('writes data-name from a double-click', async () => {
        const sent = edits()
        await openHero()

        await userEvent.dblClick(screen.getByRole('button', { name: 'footer' }))
        await userEvent.keyboard('Site footer{Enter}')

        await waitFor(() =>
          expect(sent).toEqual([
            {
              ref: HERO,
              index: 8,
              hash: HASH,
              change: {
                kind: 'attribute',
                name: 'data-name',
                value: 'Site footer',
              },
            },
          ]),
        )
      })

      it('opens the field on F2, and Esc writes nothing', async () => {
        const sent = edits()
        await openHero()
        const pressed: string[] = []
        const board = (event: KeyboardEvent) => pressed.push(event.key)
        addEventListener('keydown', board)
        cleanups.push(() => removeEventListener('keydown', board))

        screen.getByRole('button', { name: 'footer' }).focus()
        await userEvent.keyboard('{F2}')
        expect(
          screen.getByRole('textbox', { name: 'Rename footer' }),
        ).toHaveFocus()
        await userEvent.keyboard('Gone{Escape}')

        expect(pressed).not.toContain('F2')
        expect(sent).toEqual([])
        expect(
          screen.getByRole('button', { name: 'footer' }),
        ).toBeInTheDocument()
      })

      it('writes nothing for an emptied name', async () => {
        const sent = edits()
        await openHero()

        await userEvent.dblClick(screen.getByRole('button', { name: 'footer' }))
        await userEvent.clear(
          screen.getByRole('textbox', { name: 'Rename footer' }),
        )
        await userEvent.keyboard('{Enter}')

        expect(sent).toEqual([])
      })

      it('opens nothing in a tab that may only view', async () => {
        liveStore.setState({ canWrite: false })
        await openHero()

        await userEvent.dblClick(screen.getByRole('button', { name: 'footer' }))
        screen.getByRole('button', { name: 'footer' }).focus()
        await userEvent.keyboard('{F2}')

        expect(
          screen.queryByRole('textbox', { name: 'Rename footer' }),
        ).toBeNull()
      })
    })

    it('says a frame the server refused cannot be addressed', async () => {
      trees.store.setState({
        byRef: {
          [HERO]: { status: 'refused', version: 0, message: 'builds a tbody' },
        },
      })
      renderPanel(project([page('home', [frame('hero')])]))

      await userEvent.click(
        screen.getByRole('button', { name: 'Show the elements of hero' }),
      )

      expect(
        screen.getByText('This frame cannot be addressed'),
      ).toBeInTheDocument()
    })
  })

  describe('unseen changes', () => {
    function markUnseen(...refs: string[]): void {
      unseenStore.setState({
        unseen: Object.fromEntries(
          refs.map((ref) => [
            ref,
            {
              id: `c-${ref}`,
              frame: ref,
              at: '2026-10-19T12:00:00.000Z',
              hash: 'h',
              author: null,
              elements: [],
              removed: 0,
              whole: true,
              created: false,
            },
          ]),
        ),
      })
    }

    it('counts the unseen frames on each page row', () => {
      markUnseen('studio/home/hero', 'studio/home/about', 'studio/pricing/a')

      renderPanel(THREE())

      const pages = screen.getByRole('navigation', { name: 'Pages' })
      expect(
        within(pages)
          .getAllByRole('img', { name: /unseen/ })
          .map((count) => count.getAttribute('aria-label')),
      ).toEqual(['2 unseen changes', '1 unseen change'])
    })

    it('dots the layers row of a frame an agent changed', () => {
      markUnseen(HERO)

      renderPanel(project([page('home', [frame('hero'), frame('about')])]))

      const layers = screen.getByRole('region', { name: 'Layers' })
      expect(
        within(
          within(layers).getByRole('listitem', { name: 'hero' }),
        ).getByRole('img', { name: 'Unseen change' }),
      ).toBeInTheDocument()
      expect(
        within(
          within(layers).getByRole('listitem', { name: 'about' }),
        ).queryByRole('img', { name: 'Unseen change' }),
      ).toBeNull()
    })
  })

  describe('frame rows', () => {
    /** Three frames as the server sends them, bottom of the stack first. */
    const STACK = () =>
      project([
        page('home', [
          frame('back', { order: 0 }),
          frame('middle', { order: 1 }),
          frame('front', { order: 2 }),
        ]),
      ])

    it('lists the top of the stack first', () => {
      renderPanel(STACK())

      expect(
        within(screen.getByRole('region', { name: 'Layers' }))
          .getAllByRole('button', { name: /^Select / })
          .map((row) => row.textContent),
      ).toEqual(['front', 'middle', 'back'])
    })

    it('selects a frame from its row, and Shift-click adds another', async () => {
      const user = userEvent.setup()
      renderPanel(STACK())

      await user.click(screen.getByRole('button', { name: 'Select front' }))
      await user.keyboard('{Shift>}')
      await user.click(screen.getByRole('button', { name: 'Select back' }))
      await user.keyboard('{/Shift}')

      expect(selectionStore.getState()).toMatchObject({
        page: 'studio/home',
        frames: ['studio/home/front', 'studio/home/back'],
      })
    })

    it('selects a locked frame from its row', async () => {
      renderPanel(project([page('home', [frame('hero', { locked: true })])]))

      await userEvent.click(screen.getByRole('button', { name: 'Select hero' }))

      expect(selectionStore.getState().frames).toEqual([HERO])
    })

    it('leaves a hidden frame unselected', async () => {
      renderPanel(project([page('home', [frame('hero', { hidden: true })])]))

      await userEvent.click(screen.getByRole('button', { name: 'Select hero' }))

      expect(selectionStore.getState().frames).toEqual([])
    })

    it('renames a frame on a double-click', async () => {
      const { sent, calls } = server(frame('banner'))
      renderPanel(project([page('home', [frame('hero')])]), 'home', undefined, {
        calls,
      })

      await userEvent.dblClick(
        screen.getByRole('button', { name: 'Select hero' }),
      )
      await userEvent.keyboard('banner{Enter}')

      expect(sent).toEqual([
        { path: '/api/frame/rename', body: { ref: HERO, name: 'banner' } },
      ])
    })

    it('renames in the row on F2 there, leaving the board F2 alone', async () => {
      let boardRenames = 0
      cleanups.push(
        registerActions([
          {
            id: 'frame.rename',
            label: 'Rename frame',
            group: 'frame',
            keys: ['F2'],
            run: () => (boardRenames += 1),
          },
        ]),
        bindKeys(window),
      )
      renderPanel(project([page('home', [frame('hero')])]))
      act(() => screen.getByRole('button', { name: 'Select hero' }).focus())

      await userEvent.keyboard('{F2}')

      expect([
        boardRenames,
        screen.getByRole('textbox', { name: /hero/ }) !== null,
      ]).toEqual([0, true])
    })

    it('hides a frame from its eye and locks one from its lock', async () => {
      const { sent, calls } = server([])
      renderPanel(project([page('home', [frame('hero')])]), 'home', undefined, {
        calls,
      })

      await userEvent.click(screen.getByRole('button', { name: 'Hide hero' }))
      await userEvent.click(screen.getByRole('button', { name: 'Lock hero' }))

      expect(sent).toEqual([
        {
          path: '/api/frame/flag',
          body: { refs: [HERO], flag: 'hidden', on: true },
        },
        {
          path: '/api/frame/flag',
          body: { refs: [HERO], flag: 'locked', on: true },
        },
      ])
    })

    it('shows a hidden frame again from its eye', async () => {
      const { sent, calls } = server([])
      renderPanel(
        project([page('home', [frame('hero', { hidden: true })])]),
        'home',
        undefined,
        { calls },
      )

      await userEvent.click(screen.getByRole('button', { name: 'Show hero' }))

      expect(sent[0]?.body).toEqual({ refs: [HERO], flag: 'hidden', on: false })
    })

    it('restacks a row dropped above the top one to the top of the stack', async () => {
      const { sent, calls } = server(frame('back'))
      renderPanel(STACK(), 'home', undefined, { calls })
      const row = (name: string) =>
        screen.getByRole('listitem', { name }) as HTMLElement

      await dragOnto(row('back'), row('front'), 'top')

      expect(sent).toEqual([
        {
          path: '/api/frame/order',
          body: { ref: 'studio/home/back', index: 2 },
        },
      ])
    })
  })

  describe('row menus', () => {
    const rightClick = (target: Element) =>
      userEvent.pointer({ keys: '[MouseRight]', target })

    it('moves the canvas to the page whose row opened the menu', async () => {
      const location = renderPanel(THREE())

      await rightClick(screen.getByRole('link', { name: 'pricing' }))

      expect(
        within(await screen.findByRole('menu'))
          .getAllByRole('menuitem')
          .map((item) => item.textContent),
      ).toEqual([
        'Rename',
        'Duplicate',
        'New page below',
        'Move up',
        'Move down',
        'Delete⌫',
      ])
      expect(location.history.at(-1)).toBe('/p/studio/pricing')
    })

    it('runs page.new from New page below, which adds after the page on the canvas', async () => {
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
      await rightClick(screen.getByRole('link', { name: 'pricing' }))

      await userEvent.click(
        within(await screen.findByRole('menu')).getByRole('menuitem', {
          name: 'New page below',
        }),
      )

      expect(runs).toBe(1)
    })

    it('leaves the canvas where it is when the row is the page on it', async () => {
      const location = renderPanel(THREE())

      await rightClick(screen.getByRole('link', { name: 'home' }))

      await screen.findByRole('menu')
      expect(location.history).toEqual(['/'])
    })

    it('opens on Shift+F10 at a focused row with focus inside, and Esc gives it back', async () => {
      cleanups.push(
        registerActions([
          {
            id: 'page.rename',
            label: 'Rename page',
            group: 'page',
            run: () => {},
          },
        ]),
      )
      renderPanel(THREE())
      const row = screen.getByRole('link', { name: 'home' })
      row.focus()

      await userEvent.keyboard('{Shift>}{F10}{/Shift}')
      await expect
        .poll(() => document.activeElement?.textContent)
        .toBe('Rename')
      await userEvent.keyboard('{Escape}')

      await expect.poll(() => document.activeElement).toBe(row)
    })

    it('selects the frame alone whose layers row opened the menu', async () => {
      renderPanel(
        project([page('home', [frame('back'), frame('front', { order: 1 })])]),
      )
      act(() =>
        selectionStore.setState({
          page: 'studio/home',
          frames: ['studio/home/back'],
        }),
      )

      await rightClick(screen.getByRole('button', { name: 'Select front' }))

      expect(
        within(await screen.findByRole('menu'))
          .getAllByRole('menuitem')
          .map((item) => item.textContent?.replace(/[^A-Za-z ].*$/, '')),
      ).toEqual([
        'Zoom to frame',
        'Rename',
        'Duplicate',
        'Hide',
        'Lock',
        'Delete',
      ])
      expect(selectionStore.getState().frames).toEqual(['studio/home/front'])
    })

    it("greys a hidden frame's selection items rather than acting on the frame already selected", async () => {
      renderPanel(
        project([
          page('home', [
            frame('back'),
            frame('sketch', { order: 1, hidden: true }),
          ]),
        ]),
      )
      act(() =>
        selectionStore.setState({
          page: 'studio/home',
          frames: ['studio/home/back'],
        }),
      )
      cleanups.push(
        registerActions([
          {
            id: 'frame.delete',
            label: 'Delete',
            group: 'frame',
            run: () => {},
          },
        ]),
      )

      await rightClick(screen.getByRole('button', { name: 'Select sketch' }))

      expect(
        within(await screen.findByRole('menu')).getByRole('menuitem', {
          name: /Delete/,
        }),
      ).toHaveAttribute('aria-disabled', 'true')
    })

    it("opens the row's own rename field from the layers menu", async () => {
      renderPanel(project([page('home', [frame('hero')])]))
      await rightClick(screen.getByRole('button', { name: 'Select hero' }))

      await userEvent.click(
        within(await screen.findByRole('menu')).getByRole('menuitem', {
          name: 'Rename',
        }),
      )

      await expect
        .poll(() => document.activeElement)
        .toBe(screen.getByRole('textbox', { name: 'Rename frame hero' }))
    })

    it('selects the element whose row opened the menu', async () => {
      heroTree()
      renderPanel(project([page('home', [frame('hero')])]))
      await userEvent.click(
        screen.getByRole('button', { name: 'Show the elements of hero' }),
      )

      await rightClick(screen.getByRole('button', { name: 'footer' }))

      expect(
        within(await screen.findByRole('menu')).getByText('Element'),
      ).toBeTruthy()
      expect(selectionStore.getState().element).toEqual({
        frame: HERO,
        index: 8,
        hash: HASH,
      })
    })
  })
})

const nextFrame = () =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)))

/** Drags one row onto an edge of another through the native events the drag library listens to. */
async function dragOnto(
  source: HTMLElement,
  target: HTMLElement,
  edge: 'top' | 'bottom',
): Promise<void> {
  const dataTransfer = new DataTransfer()
  const from = source.getBoundingClientRect()
  const to = target.getBoundingClientRect()
  const at = {
    clientX: to.left + to.width / 2,
    clientY: edge === 'top' ? to.top + 2 : to.bottom - 2,
  }
  const fire = (element: HTMLElement, type: string, point: object) =>
    element.dispatchEvent(
      new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        ...point,
      }),
    )
  fire(source, 'dragstart', {
    clientX: from.left + 4,
    clientY: from.top + 4,
  })
  await nextFrame()
  fire(target, 'dragenter', at)
  fire(target, 'dragover', at)
  await nextFrame()
  fire(target, 'drop', at)
  await nextFrame()
}
