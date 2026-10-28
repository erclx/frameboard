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
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { setCharacterKeys } from '@/client/actions/character-keys'
import { bindKeys } from '@/client/actions/registry'
import { Toaster } from '@/client/components/ui/toast'
import { liveStore } from '@/client/live/store'
import { createStructure, type Structure } from '@/client/live/structure'
import { unseenStore } from '@/client/live/unseen'
import { projectStore } from '@/client/projects/actions'
import { themeStore } from '@/client/theme/store'
import type { FrameRecord, ProjectRecord } from '@/shared/records/list'

import { Home } from './home'
import type { HomeLayout } from './layout'
import { dropPin, togglePin } from './pins'
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
      sections: [],
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
    hugWidth: false,
    hugHeight: false,
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
  liveStore.setState({ thumbnails: { light: {}, dark: {} } })
  themeStore.setState({ choice: 'system', system: 'light' })
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

describe('Projects by the arrow keys', () => {
  const FIVE = ['alpha', 'bravo', 'charlie', 'delta', 'echo'].map((name) =>
    project(name, '2026-10-13T12:00:00.000Z'),
  )

  function renderFive(layout: HomeLayout) {
    render(
      <Router hook={memoryLocation({ path: '/' }).hook}>
        <Projects projects={FIVE} layout={layout} now={NOW} />
        <button type="button">After</button>
      </Router>,
    )
  }

  const card = (name: string) =>
    screen.getByRole('link', { name: new RegExp(`^${name}`) })

  afterEach(() => {
    projectStore.setState({ focused: null, renaming: null })
  })

  it('moves across a row of the grid and down a whole row', async () => {
    renderFive('grid')
    act(() => card('alpha').focus())
    const start = card('alpha').getBoundingClientRect()

    await userEvent.keyboard('{ArrowRight}')
    const across = document.activeElement
    await userEvent.keyboard('{ArrowLeft}{ArrowDown}')
    const below = (
      document.activeElement as HTMLElement
    ).getBoundingClientRect()

    expect(across).toBe(card('bravo'))
    expect([below.left, below.top > start.bottom]).toEqual([start.left, true])
  })

  it('moves up from the rest to the pinned card above it', async () => {
    act(() => togglePin('alpha'))
    renderFive('grid')
    act(() => card('charlie').focus())

    await userEvent.keyboard('{ArrowUp}')

    expect(document.activeElement).toBe(card('alpha'))
    act(() => dropPin('alpha'))
  })

  it('moves down and up the list', async () => {
    renderFive('list')
    act(() => card('alpha').focus())

    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}')

    expect(document.activeElement).toBe(card('bravo'))
  })

  it('jumps to the ends on Home and End', async () => {
    renderFive('list')
    act(() => card('bravo').focus())

    await userEvent.keyboard('{End}')
    const last = document.activeElement
    await userEvent.keyboard('{Home}')

    expect([last, document.activeElement]).toEqual([
      card('echo'),
      card('alpha'),
    ])
  })

  describe('hjkl', () => {
    afterEach(() => {
      setCharacterKeys(true)
    })

    it('moves across the grid on l and h', async () => {
      renderFive('grid')
      act(() => card('alpha').focus())

      await userEvent.keyboard('ll')
      const across = document.activeElement
      await userEvent.keyboard('h')

      expect([across, document.activeElement]).toEqual([
        card('charlie'),
        card('bravo'),
      ])
    })

    it('moves down and up the list on j and k', async () => {
      renderFive('list')
      act(() => card('alpha').focus())

      await userEvent.keyboard('jjk')

      expect(document.activeElement).toBe(card('bravo'))
    })

    it('moves no card while single-key shortcuts are off', async () => {
      setCharacterKeys(false)
      renderFive('list')
      act(() => card('alpha').focus())

      await userEvent.keyboard('j')

      expect(document.activeElement).toBe(card('alpha'))
    })
  })

  it('leaves the set on one Tab', async () => {
    renderFive('grid')
    act(() => card('alpha').focus())

    await userEvent.keyboard('{ArrowRight}')
    await userEvent.tab()

    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'After' }),
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

  it('draws a stamped frame capture over its box, naming the stamp', () => {
    liveStore.setState({
      thumbnails: { light: { 'sketch/home/hero': 'r1-0-1440x900' }, dark: {} },
    })
    const { container } = renderOne(
      withFrames([frame('hero', { x: 20, y: 10, width: 1440, height: 900 })]),
    )
    const image = container.querySelector('[data-skeleton] image')

    expect(
      ['x', 'y', 'width', 'height', 'href'].map((name) =>
        image?.getAttribute(name),
      ),
    ).toEqual([
      '20',
      '10',
      '1440',
      '900',
      '/api/thumbnails/png?ref=sketch%2Fhome%2Fhero&theme=light&v=r1-0-1440x900',
    ])
  })

  it('draws only the box of a frame with no stamp yet', () => {
    liveStore.setState({
      thumbnails: { light: { 'sketch/home/hero': 'r1-0-1440x900' }, dark: {} },
    })
    const { container } = renderOne(
      withFrames([
        frame('hero', { x: 0, y: 0, width: 1440, height: 900 }),
        frame('mobile', { x: 1520, y: 0, width: 390, height: 844 }),
      ]),
    )

    expect([
      container.querySelectorAll('[data-skeleton] rect').length,
      container.querySelectorAll('[data-skeleton] image').length,
    ]).toEqual([2, 1])
  })

  it('draws the capture of the theme the board shows', () => {
    themeStore.setState({ choice: 'dark' })
    liveStore.setState({
      thumbnails: { light: { 'sketch/home/hero': 'r1-0-1440x900' }, dark: {} },
    })
    const { container } = renderOne(
      withFrames([frame('hero', { x: 0, y: 0, width: 1440, height: 900 })]),
    )

    expect(container.querySelector('[data-skeleton] image')).toBeNull()
  })

  it("draws no capture in a list row's mark", () => {
    liveStore.setState({
      thumbnails: { light: { 'sketch/home/hero': 'r1-0-1440x900' }, dark: {} },
    })
    const { container } = renderOne(
      withFrames([frame('hero', { x: 0, y: 0, width: 1440, height: 900 })]),
      'list',
    )

    expect([
      container.querySelectorAll('[data-skeleton] rect').length,
      container.querySelectorAll('[data-skeleton] image').length,
    ]).toEqual([1, 0])
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

describe('Home from nothing focused', () => {
  const FIVE = ['alpha', 'bravo', 'charlie', 'delta', 'echo'].map((name) =>
    project(name, '2026-10-13T12:00:00.000Z'),
  )
  const unbinds: (() => void)[] = []

  function renderKeyed() {
    unbinds.push(bindKeys(window))
    renderHome(FIVE)
  }

  const card = (name: string) =>
    screen.getByRole('link', { name: new RegExp(`^${name}`) })

  afterEach(() => {
    cleanup()
    while (unbinds.length > 0) unbinds.pop()?.()
    setCharacterKeys(true)
    projectStore.setState({ focused: null, renaming: null })
  })

  it('lands the first arrow on the tab stop card', async () => {
    renderKeyed()

    await userEvent.keyboard('{ArrowDown}')

    expect(document.activeElement).toBe(card('alpha'))
  })

  it('lands the first arrow on the card that last held focus', async () => {
    renderKeyed()
    act(() => card('charlie').focus())
    act(() => card('charlie').blur())

    await userEvent.keyboard('{ArrowLeft}')

    expect(document.activeElement).toBe(card('charlie'))
  })

  it('lands End on the last card and Home on the first', async () => {
    renderKeyed()
    act(() => card('charlie').focus())
    act(() => card('charlie').blur())

    await userEvent.keyboard('{End}')
    const last = document.activeElement
    act(() => card('echo').blur())
    await userEvent.keyboard('{Home}')

    expect([last, document.activeElement]).toEqual([
      card('echo'),
      card('alpha'),
    ])
  })

  it('lands j on the tab stop card', async () => {
    renderKeyed()

    await userEvent.keyboard('j')

    expect(document.activeElement).toBe(card('alpha'))
  })

  it('leaves j to the browser while single-key shortcuts are off', async () => {
    setCharacterKeys(false)
    renderKeyed()

    await userEvent.keyboard('j')

    expect(document.activeElement).toBe(document.body)
  })

  it('leaves an arrow with the layout toggle that holds focus', async () => {
    renderKeyed()
    const grid = screen.getByRole('button', { name: 'Grid' })
    act(() => grid.focus())

    await userEvent.keyboard('{ArrowDown}')

    expect(document.activeElement).toBe(grid)
  })

  it('moves a focused card once per arrow', async () => {
    localStorage.setItem('frameboard.home.layout', 'list')
    renderKeyed()
    act(() => card('alpha').focus())

    await userEvent.keyboard('{ArrowDown}')

    expect(document.activeElement).toBe(card('bravo'))
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

  it('opens the menu of Open, Rename, Duplicate, Pin, and Delete on a right click', async () => {
    renderLive(PROJECTS, server().calls)

    const menu = await openMenu(/studio/)
    const [open, rename, duplicate, pin, remove, ...rest] =
      within(menu).getAllByRole('menuitem')

    expect(open).toHaveAccessibleName('Open')
    expect(rename).toHaveAccessibleName('Rename')
    expect(duplicate).toHaveAccessibleName('Duplicate')
    expect(pin).toHaveAccessibleName('Pin')
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

describe('Home order and pins', () => {
  const THREE = [
    project('atlas', '2026-10-01T00:00:00.000Z'),
    project('studio', '2026-10-15T09:00:00.000Z'),
    project('webapp', '2026-10-13T12:00:00.000Z'),
  ]

  const shown = () =>
    screen
      .getAllByRole('link')
      .map((link) => link.querySelector('[title]')?.getAttribute('title'))

  async function pin(name: RegExp) {
    const menu = await openMenu(name)
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Pin' }))
  }

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    liveStore.setState({ canWrite: false, board: null })
    projectStore.setState({ focused: null, renaming: null })
  })

  it('shows the last edited first', () => {
    renderLive(THREE, server().calls)

    expect(shown()).toEqual(['studio', 'webapp', 'atlas'])
  })

  it('reorders by name from the sort menu and remembers it', async () => {
    renderLive(THREE, server().calls)

    await userEvent.click(screen.getByRole('button', { name: /^Sort/ }))
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Name' }),
    )
    cleanup()
    renderLive(THREE, server().calls, 'list')

    expect(shown()).toEqual(['atlas', 'studio', 'webapp'])
  })

  it('closes the sort menu once an order is picked', async () => {
    renderLive(THREE, server().calls)

    await userEvent.click(screen.getByRole('button', { name: /^Sort/ }))
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Created' }),
    )

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('reverses the order from the sort menu and remembers it', async () => {
    renderLive(THREE, server().calls)

    await userEvent.click(screen.getByRole('button', { name: /^Sort/ }))
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Oldest first' }),
    )
    cleanup()
    renderLive(THREE, server().calls)

    expect(shown()).toEqual(['atlas', 'webapp', 'studio'])
  })

  it('names the direction after the key, from A for Name', async () => {
    localStorage.setItem('frameboard.home.sort', 'name')
    renderLive(THREE, server().calls)

    await userEvent.click(screen.getByRole('button', { name: /^Sort/ }))

    expect(
      await screen.findByRole('menuitemradio', { name: 'A to Z' }),
    ).toHaveAttribute('aria-checked', 'true')
    expect(
      screen.getByRole('menuitemradio', { name: 'Z to A' }),
    ).toHaveAttribute('aria-checked', 'false')
  })

  it('starts a newly picked key in its own direction', async () => {
    localStorage.setItem('frameboard.home.sort', 'name')
    localStorage.setItem('frameboard.home.sortDirection', 'desc')
    renderLive(THREE, server().calls)

    await userEvent.click(screen.getByRole('button', { name: /^Sort/ }))
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Last edited' }),
    )

    expect(shown()).toEqual(['studio', 'webapp', 'atlas'])
  })

  it('reverses for the visit when storage refuses the write', async () => {
    renderLive(THREE, server().calls)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('refused')
    })

    await userEvent.click(screen.getByRole('button', { name: /^Sort/ }))
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Oldest first' }),
    )

    expect(shown()).toEqual(['atlas', 'webapp', 'studio'])
  })

  it('names the chosen order on the sort button', () => {
    localStorage.setItem('frameboard.home.sort', 'created')

    renderLive(THREE, server().calls)

    expect(screen.getByRole('button', { name: /^Sort/ })).toHaveTextContent(
      'Created',
    )
  })

  it('holds a pinned project first and marks it', async () => {
    renderLive(THREE, server().calls)

    await pin(/atlas/)

    expect(shown()).toEqual(['atlas', 'studio', 'webapp'])
    expect(
      within(screen.getByRole('link', { name: /atlas/ })).getByRole('img', {
        name: 'Pinned',
      }),
    ).toBeInTheDocument()
  })

  it('starts the rest of the grid on a new row under a divider', async () => {
    renderLive(THREE, server().calls)

    await pin(/atlas/)

    const divider = document.querySelector('[data-pin-divider]')
    const first = screen.getByRole('link', { name: /^studio/ })
    const pinned = screen.getByRole('link', { name: /^atlas/ })
    expect(divider?.previousElementSibling).toContainElement(pinned)
    expect(first.getBoundingClientRect().left).toBe(
      pinned.getBoundingClientRect().left,
    )
  })

  it('draws the divider between groups in the list too', async () => {
    renderLive(THREE, server().calls, 'list')

    await pin(/webapp/)

    expect(
      document.querySelector('[data-pin-divider]')?.previousElementSibling,
    ).toContainElement(screen.getByRole('link', { name: /^webapp/ }))
  })

  it('draws no divider while nothing is pinned', () => {
    renderLive(THREE, server().calls)

    expect(document.querySelector('[data-pin-divider]')).toBeNull()
  })

  it('holds a pinned row first in the list too', async () => {
    renderLive(THREE, server().calls, 'list')

    await pin(/webapp/)

    expect(shown()).toEqual(['webapp', 'studio', 'atlas'])
  })

  it('offers Unpin on a pinned project, which puts it back in order', async () => {
    renderLive(THREE, server().calls)
    await pin(/atlas/)

    const menu = await openMenu(/atlas/)
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Unpin' }))

    expect(shown()).toEqual(['studio', 'webapp', 'atlas'])
  })

  it('keeps a pin across a reload', async () => {
    renderLive(THREE, server().calls)
    await pin(/atlas/)

    cleanup()
    renderLive(THREE, server().calls)

    expect(shown()[0]).toBe('atlas')
  })

  it('pins in a tab that may not write', async () => {
    renderLive(THREE, server().calls)
    act(() => liveStore.setState({ canWrite: false }))

    await pin(/atlas/)

    expect(shown()[0]).toBe('atlas')
  })

  it('ignores a stored pin naming no project', () => {
    localStorage.setItem('frameboard.home.pins', JSON.stringify(['gone']))

    renderLive(THREE, server().calls)

    expect(shown()).toEqual(['studio', 'webapp', 'atlas'])
    expect(screen.queryByRole('img', { name: 'Pinned' })).toBeNull()
  })

  it('shows the last edited first when the browser refuses storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('refused')
    })

    renderLive(THREE, server().calls)

    expect(shown()).toEqual(['studio', 'webapp', 'atlas'])
  })

  it('walks the shown order on Home and End, pinned first', async () => {
    renderLive(THREE, server().calls, 'list')
    await pin(/atlas/)
    act(() => screen.getByRole('link', { name: /studio/ }).focus())

    await userEvent.keyboard('{Home}')
    const first = document.activeElement
    await userEvent.keyboard('{End}')

    expect([first, document.activeElement]).toEqual([
      screen.getByRole('link', { name: /atlas/ }),
      screen.getByRole('link', { name: /webapp/ }),
    ])
  })

  it('holds the tab stop on the first shown card', () => {
    renderLive(THREE, server().calls)

    expect(screen.getByRole('link', { name: /studio/ })).toHaveAttribute(
      'tabindex',
      '0',
    )
  })
})
