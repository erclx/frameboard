import '../styles.css'

import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { Toaster } from '@/client/components/ui/toast'
import { liveStore } from '@/client/live/store'
import { createStructure, type Structure } from '@/client/live/structure'
import { unseenStore } from '@/client/live/unseen'
import type { FrameRecord, ProjectRecord } from '@/shared/records/list'

import { Home } from './home'
import type { HomeLayout } from './layout'
import { Projects } from './projects'

const NOW = Date.parse('2026-10-15T12:00:00.000Z')
const NEW = '2026-10-15T11:59:00.000Z'

function project(
  name: string,
  modifiedAt: string,
  pages = ['home'],
  createdAt: string | null = null,
): ProjectRecord {
  return {
    name,
    path: `/board/${name}`,
    modifiedAt,
    createdAt,
    projectFileError: null,
    pages: pages.map((page, index) => ({
      ref: `${name}/${page}`,
      project: name,
      name: page,
      path: `/board/${name}/${page}`,
      index,
      layoutError: null,
      frames: [],
    })),
  }
}

function frame(
  name: string,
  box: FrameRecord['box'],
  hidden = false,
): FrameRecord {
  return {
    ref: `sketch/home/${name}`,
    project: 'sketch',
    page: 'home',
    name,
    path: `/board/sketch/home/${name}.html`,
    box,
    order: 0,
    hidden,
    locked: false,
    placed: true,
    modifiedAt: '2026-10-15T09:00:00.000Z',
  }
}

function withFrames(frames: FrameRecord[]): ProjectRecord {
  const record = project('sketch', '2026-10-15T09:00:00.000Z')
  return {
    ...record,
    pages: record.pages.map((page) => ({ ...page, frames })),
  }
}

function renderOne(record: ProjectRecord, layout: HomeLayout = 'grid') {
  return render(
    <Router hook={memoryLocation({ path: '/' }).hook}>
      <Projects projects={[record]} layout={layout} now={NOW} />
    </Router>,
  )
}

const PROJECTS = [
  project(
    'studio',
    '2026-10-15T09:00:00.000Z',
    ['landing', 'pricing'],
    '2026-09-02T10:00:00.000Z',
  ),
  project('webapp', '2026-10-13T12:00:00.000Z'),
]

function renderProjects(layout: HomeLayout) {
  const memory = memoryLocation({ path: '/', record: true })
  render(
    <Router hook={memory.hook}>
      <Projects projects={PROJECTS} layout={layout} now={NOW} />
    </Router>,
  )
  return memory
}

function renderHome(projects: ProjectRecord[]) {
  render(
    <Router hook={memoryLocation({ path: '/' }).hook}>
      <Home projects={projects} />
    </Router>,
  )
}

afterEach(() => {
  localStorage.clear()
  unseenStore.setState({ unseen: {}, cursor: null })
})

function markUnseen(...refs: string[]): void {
  unseenStore.setState({
    unseen: Object.fromEntries(
      refs.map((ref) => [
        ref,
        {
          id: `c-${ref}`,
          frame: ref,
          at: '2026-10-15T11:00:00.000Z',
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

describe('Projects', () => {
  it('shows each project as a card with when it was last edited', () => {
    renderProjects('grid')

    expect(screen.getByRole('link', { name: /studio/ })).toHaveTextContent(
      'Edited 3 hours ago',
    )
    expect(screen.getByRole('link', { name: /webapp/ })).toHaveTextContent(
      'Edited 2 days ago',
    )
  })

  it("counts a card's unseen frames on its name line", () => {
    markUnseen('studio/landing/hero', 'studio/pricing/plans')

    renderProjects('grid')

    expect(
      screen.getByRole('img', { name: '2 unseen changes' }),
    ).toBeInTheDocument()
  })

  it('draws the count at 11px and 600 weight, as the page rows do', () => {
    markUnseen('studio/landing/hero')

    renderProjects('grid')

    const count = getComputedStyle(
      screen.getByRole('img', { name: '1 unseen change' }),
    )
    expect(count.fontSize).toBe('11px')
    expect(count.fontWeight).toBe('600')
  })

  it("counts a row's unseen frames in its name cell", () => {
    markUnseen('studio/landing/hero')

    renderProjects('list')

    expect(screen.getByRole('link', { name: /studio/ })).toContainElement(
      screen.getByRole('img', { name: '1 unseen change' }),
    )
  })

  it('counts nothing on a project with no unseen frames', () => {
    markUnseen('studio/landing/hero')

    renderProjects('grid')

    expect(
      screen
        .getByRole('link', { name: /webapp/ })
        .querySelector('[data-unseen-count]'),
    ).toBeNull()
  })

  it("opens a project's first page", async () => {
    const memory = renderProjects('grid')

    await userEvent.click(screen.getByRole('link', { name: /studio/ }))

    expect(memory.history.at(-1)).toBe('/p/studio/landing')
  })

  it('shows the day a row was made', () => {
    renderProjects('list')

    expect(screen.getByRole('link', { name: /studio/ })).toHaveTextContent(
      '2026-09-02',
    )
  })

  it('leaves the made day empty on a project that records none', () => {
    renderProjects('list')

    expect(screen.getByRole('link', { name: /webapp/ })).toHaveTextContent(
      /^webapp2 days ago$/,
    )
  })
})

describe('FrameSkeleton in a card', () => {
  it('draws a box for each visible frame', () => {
    const { container } = renderOne(
      withFrames([
        frame('hero', { x: 0, y: 0, width: 1440, height: 900 }),
        frame('mobile', { x: 1520, y: 0, width: 390, height: 844 }),
        frame('draft', { x: 4000, y: 4000, width: 390, height: 844 }, true),
      ]),
    )

    expect(container.querySelectorAll('[data-skeleton] rect')).toHaveLength(2)
  })

  it("fits one desktop frame to the card's well, as grid draws it", () => {
    const { container } = renderOne(
      withFrames([frame('hero', { x: 0, y: 0, width: 1440, height: 900 })]),
    )

    expect(
      container.querySelector('[data-skeleton]')?.getAttribute('viewBox'),
    ).toBe('0 0 1440 900')
  })

  it("fits the group to its frames' bounds, centered across and held to the top", () => {
    const { container } = renderOne(
      withFrames([
        frame('hero', { x: 100, y: 50, width: 1440, height: 900 }),
        frame('far', { x: 8000, y: 0, width: 1440, height: 3000 }),
      ]),
    )
    const skeleton = container.querySelector('[data-skeleton]')

    expect([
      skeleton?.getAttribute('viewBox'),
      skeleton?.getAttribute('preserveAspectRatio'),
    ]).toEqual(['100 0 9340 3000', 'xMidYMin meet'])
  })

  it('leaves the well empty for a project with no frames', () => {
    const { container } = renderOne(withFrames([]))

    expect(container.querySelector('[data-skeleton]')).toBeNull()
  })

  it("fills the row's mark with the frames in the list", () => {
    const { container } = renderOne(
      withFrames([frame('hero', { x: 0, y: 0, width: 1440, height: 900 })]),
      'list',
    )

    expect(
      container.querySelector('[data-skeleton]')?.getAttribute('viewBox'),
    ).toBe('0 0 1440 900')
  })
})

describe('Home', () => {
  it('switches to the list and remembers it for the next visit', async () => {
    renderHome(PROJECTS)

    await userEvent.click(screen.getByRole('button', { name: 'List' }))

    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(localStorage.getItem('frameboard.home.layout')).toBe('list')
  })

  it('opens in the list when the list was chosen before', () => {
    localStorage.setItem('frameboard.home.layout', 'list')

    renderHome(PROJECTS)

    expect(screen.getByText('Created')).toBeInTheDocument()
  })

  it('shows New project disabled in a tab that may not write', () => {
    renderHome(PROJECTS)

    expect(screen.getByRole('button', { name: 'New project' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('says how to start a project when the board holds none', () => {
    renderHome([])

    expect(
      screen.getByRole('heading', { name: 'No projects yet' }),
    ).toBeVisible()
    expect(screen.getByText('frameboard project add <name>')).toBeVisible()
  })
})

/** A request the home view sent, by route and body. */
interface Sent {
  path: string
  body: unknown
}

/** Answers each write with what `answer` returns for its route, recording what was sent. */
function server(
  answer: (path: string) => Response = () =>
    Response.json({ ok: true, data: {} }),
) {
  const sent: Sent[] = []
  const calls = createStructure(async (path, init) => {
    sent.push({ path: String(path), body: JSON.parse(String(init?.body)) })
    return answer(String(path))
  })
  return { sent, calls }
}

function refused(code: string, message: string): Response {
  return Response.json({ ok: false, error: { code, message } }, { status: 400 })
}

/** Renders the live home view over `projects`, as the board's store holds them. */
function renderLive(
  projects: ProjectRecord[],
  calls: Structure,
  layout: HomeLayout = 'grid',
) {
  localStorage.setItem('frameboard.home.layout', layout)
  liveStore.setState({ canWrite: true, board: { root: '/board', projects } })
  const memory = memoryLocation({ path: '/', record: true })
  const tree = (current: ProjectRecord[]) => (
    <Router hook={memory.hook}>
      <Toaster>
        <Home projects={current} calls={calls} />
      </Toaster>
    </Router>
  )
  const view = render(tree(projects))
  return {
    memory,
    /** Delivers the board the server would send after a write. */
    receive(next: ProjectRecord[]) {
      act(() =>
        liveStore.setState({ board: { root: '/board', projects: next } }),
      )
      view.rerender(tree(next))
    },
  }
}

async function openMenu(name: RegExp) {
  await userEvent.pointer({
    keys: '[MouseRight]',
    target: screen.getByRole('link', { name }),
  })
  return screen.findByRole('menu')
}

describe('project actions', () => {
  afterEach(() => {
    cleanup()
    liveStore.setState({ canWrite: false, board: null })
  })

  it('adds an untitled project from New project and opens its name for renaming', async () => {
    const { sent, calls } = server(() =>
      Response.json({ ok: true, data: project('untitled', NEW) }),
    )
    const home = renderLive(PROJECTS, calls)

    await userEvent.click(screen.getByRole('button', { name: 'New project' }))
    home.receive([...PROJECTS, project('untitled', NEW)])

    expect(sent).toEqual([{ path: '/api/project/add', body: {} }])
    expect(
      screen.getByRole('textbox', { name: 'Rename project untitled' }),
    ).toHaveFocus()
  })

  it('runs New project from the empty home too', async () => {
    const { sent, calls } = server(() =>
      Response.json({ ok: true, data: project('untitled', NEW) }),
    )
    const home = renderLive([], calls)

    await userEvent.click(screen.getByRole('button', { name: 'New project' }))
    home.receive([project('untitled', NEW)])

    expect(sent.map((request) => request.path)).toEqual(['/api/project/add'])
    expect(
      screen.getByRole('textbox', { name: 'Rename project untitled' }),
    ).toHaveFocus()
  })

  it('opens the menu of Open, Rename, Duplicate, and Delete on a right click', async () => {
    renderLive(PROJECTS, server().calls)

    const menu = await openMenu(/studio/)
    const [open, rename, duplicate, remove, ...rest] =
      within(menu).getAllByRole('menuitem')

    expect(open).toHaveAccessibleName('Open')
    expect(rename).toHaveAccessibleName('Rename')
    expect(duplicate).toHaveAccessibleName('Duplicate')
    expect(remove).toHaveAccessibleName('Delete')
    expect(rest).toEqual([])
    expect(
      within(menu).getByRole('menuitem', { name: 'Delete' }),
    ).toHaveAttribute('aria-keyshortcuts', 'Delete')
  })

  it('opens the menu on a list row', async () => {
    renderLive(PROJECTS, server().calls, 'list')

    const menu = await openMenu(/webapp/)

    expect(
      within(menu).getByRole('menuitem', { name: 'Rename' }),
    ).toBeInTheDocument()
  })

  it('opens the project from the menu', async () => {
    const home = renderLive(PROJECTS, server().calls)

    const menu = await openMenu(/studio/)
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Open' }))

    expect(home.memory.history.at(-1)).toBe('/p/studio/landing')
  })

  it('duplicates the project the menu opened on', async () => {
    const { sent, calls } = server()
    renderLive(PROJECTS, calls)

    const menu = await openMenu(/webapp/)
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Duplicate' }),
    )

    expect(sent).toEqual([
      { path: '/api/project/duplicate', body: { ref: 'webapp' } },
    ])
  })

  it('deletes the project the menu opened on', async () => {
    const { sent, calls } = server()
    renderLive(PROJECTS, calls)

    const menu = await openMenu(/webapp/)
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Delete' }),
    )

    expect(sent).toEqual([
      { path: '/api/project/delete', body: { ref: 'webapp' } },
    ])
  })

  it('opens the menu on Shift+F10 with focus on Open', async () => {
    renderLive(PROJECTS, server().calls)

    screen.getByRole('link', { name: /studio/ }).focus()
    await userEvent.keyboard('{Shift>}{F10}{/Shift}')

    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Open' })).toHaveFocus(),
    )
  })

  it('opens the menu on the menu key with focus on Open', async () => {
    renderLive(PROJECTS, server().calls)

    screen.getByRole('link', { name: /studio/ }).focus()
    await userEvent.keyboard('{ContextMenu}')

    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Open' })).toHaveFocus(),
    )
  })

  it('returns focus to the card when Esc closes the menu', async () => {
    renderLive(PROJECTS, server().calls)

    await openMenu(/studio/)
    await userEvent.keyboard('{Escape}')

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /studio/ })).toHaveFocus(),
    )
  })

  it('shows the card items disabled in a tab that may not write', async () => {
    renderLive(PROJECTS, server().calls)
    act(() => liveStore.setState({ canWrite: false }))

    const menu = await openMenu(/studio/)

    expect(
      within(menu).getByRole('menuitem', { name: 'Delete' }),
    ).toHaveAttribute('aria-disabled', 'true')
  })

  it('renames from the menu, committing on Enter', async () => {
    const { sent, calls } = server(() =>
      Response.json({ ok: true, data: project('site', NEW) }),
    )
    renderLive(PROJECTS, calls)

    const menu = await openMenu(/webapp/)
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Rename' }),
    )
    await userEvent.keyboard('site{Enter}')

    expect(sent).toEqual([
      { path: '/api/project/rename', body: { ref: 'webapp', name: 'site' } },
    ])
  })

  it('drops the unseen count while the name is a rename field', async () => {
    const { calls } = server()
    markUnseen('webapp/home/hero')
    renderLive(PROJECTS, calls)
    expect(
      screen.getByRole('img', { name: '1 unseen change' }),
    ).toBeInTheDocument()

    screen.getByRole('link', { name: /webapp/ }).focus()
    await userEvent.keyboard('{F2}')

    expect(
      screen.getByRole('textbox', { name: 'Rename project webapp' }),
    ).toBeVisible()
    expect(screen.queryByRole('img', { name: /unseen/ })).toBeNull()
  })

  it('cancels a rename on Esc and sends nothing', async () => {
    const { sent, calls } = server()
    renderLive(PROJECTS, calls)

    screen.getByRole('link', { name: /webapp/ }).focus()
    await userEvent.keyboard('{F2}')
    await userEvent.keyboard('site{Escape}')

    expect(sent).toEqual([])
    expect(screen.getByRole('link', { name: /webapp/ })).toBeVisible()
  })

  it('keeps the field open with the reason when the name is refused', async () => {
    const { calls } = server(() =>
      refused('invalid-name', 'my site is not a valid project name.'),
    )
    renderLive(PROJECTS, calls)

    screen.getByRole('link', { name: /webapp/ }).focus()
    await userEvent.keyboard('{F2}')
    await userEvent.keyboard('my site{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'my site is not a valid project name.',
    )
    expect(
      screen.getByRole('textbox', { name: 'Rename project webapp' }),
    ).toHaveValue('my site')
  })

  it('raises the error toast for any other refusal', async () => {
    const { calls } = server(() =>
      refused('name-taken', 'The board already has a project studio-2.'),
    )
    renderLive(PROJECTS, calls)

    const menu = await openMenu(/studio/)
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Duplicate' }),
    )

    expect(await screen.findByText("Couldn't duplicate studio")).toBeVisible()
  })

  it('deletes the focused card on Delete', async () => {
    const { sent, calls } = server()
    renderLive(PROJECTS, calls)

    screen.getByRole('link', { name: /studio/ }).focus()
    await userEvent.keyboard('{Delete}')

    expect(sent).toEqual([
      { path: '/api/project/delete', body: { ref: 'studio' } },
    ])
  })

  it('edits the text on Delete inside the rename field, never the project', async () => {
    const { sent, calls } = server()
    renderLive(PROJECTS, calls)

    screen.getByRole('link', { name: /studio/ }).focus()
    await userEvent.keyboard('{F2}{End}{Backspace}{Delete}')

    expect(sent).toEqual([])
    expect(
      screen.getByRole('textbox', { name: 'Rename project studio' }),
    ).toHaveValue('studi')
  })
})
