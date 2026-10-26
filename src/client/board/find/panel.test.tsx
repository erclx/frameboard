import '../../styles.css'

import { act, render, renderHook, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { IS_MAC } from '@/client/actions/keys'
import { bindKeys, registerActions } from '@/client/actions/registry'
import type { FindHit, FindResult } from '@/shared/records/find'

import { createTrees, type Trees } from '../element/tree'
import { createModeStore } from '../mode'
import {
  closeFind,
  createFindStore,
  findStore,
  useFindActions,
} from './actions'
import { FindPanel } from './panel'

const HASH = 'a'.repeat(64)

function hit(
  kind: FindHit['kind'],
  page: string,
  extra: Partial<FindHit> = {},
): FindHit {
  const frame = extra.frame ?? 'hero'
  return {
    kind,
    page,
    frame,
    ref: `studio/${page}/${frame}`,
    index: kind === 'frame' ? null : 3,
    hash: kind === 'frame' ? null : HASH,
    name: 'Get started',
    snippet: kind === 'text' ? 'Get started in minutes' : null,
    ...extra,
  }
}

const HITS: FindHit[] = [
  hit('text', 'home', { frame: 'hello', index: 4 }),
  hit('element', 'home', { frame: 'hello', index: 7 }),
  hit('frame', 'home', { frame: 'Getting started', name: 'Getting started' }),
  hit('text', 'onboarding', {
    frame: 'welcome',
    snippet: 'Let us get you started',
  }),
]

function answering(hits: FindHit[], truncated = false) {
  return async (project: string, query: string): Promise<FindResult> => ({
    project,
    query,
    hits,
    truncated,
  })
}

/** Every frame's tree, read at `HASH`, holding a row flex at 7 and an ellipse at 8. */
function heldTrees(): Trees {
  return createTrees(async (ref) => ({
    ref,
    hash: HASH,
    elements: [
      {
        index: 7,
        parent: null,
        tag: 'div',
        name: 'Get started',
        textOnly: false,
        layout: 'row',
        round: false,
      },
      {
        index: 8,
        parent: null,
        tag: 'div',
        name: 'Dot',
        textOnly: false,
        layout: 'block',
        round: true,
      },
    ],
  }))
}

function renderFind({
  page = 'home',
  hits = HITS,
  truncated = false,
  picked = [] as FindHit[],
  trees = heldTrees(),
} = {}) {
  render(
    <div className="h-[600px]">
      <FindPanel
        project="studio"
        page={page}
        load={answering(hits, truncated)}
        pick={(_project, picking) => picked.push(picking)}
        trees={trees}
      />
    </div>,
  )
  return { picked }
}

async function search(text: string) {
  const user = userEvent.setup()
  await user.type(
    screen.getByRole('combobox', { name: 'Find in studio' }),
    text,
  )
  await screen.findAllByRole('option')
  return user
}

function groupNamed(page: string) {
  return screen.getByRole('group', { name: page })
}

beforeEach(() => {
  findStore.setState({ open: true })
})

afterEach(() => {
  act(() => closeFind())
})

describe('FindPanel', () => {
  it('groups the hits by page with their counts, the page on the canvas first', async () => {
    renderFind({ page: 'onboarding' })

    await search('started')

    const groups = screen
      .getAllByRole('group')
      .filter((group) => group.closest('[role="listbox"]'))
    expect(
      groups.map((group) => [
        within(group).getAllByText(/./)[0]?.textContent,
        within(group).getAllByRole('option').length,
      ]),
    ).toEqual([
      ['onboarding', 1],
      ['home', 3],
    ])
  })

  it('names each kind of hit as the reference does', async () => {
    renderFind()

    await search('started')

    expect(
      within(groupNamed('home'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'Text in hello“Get started in minutes”',
      'Get startedin hello',
      'Getting startedframe',
    ])
  })

  it('draws the Frame glyph for a frame hit and the Layers glyph for an element hit', async () => {
    renderFind({
      hits: [
        hit('element', 'home', { index: 7 }),
        hit('element', 'home', { index: 8, name: 'Dot started' }),
        hit('frame', 'home', {
          frame: 'Getting started',
          name: 'Getting started',
        }),
      ],
    })

    await search('started')

    const options = within(groupNamed('home')).getAllByRole('option')
    await expect
      .poll(() =>
        options.map((option) => option.querySelector('svg')?.classList[1]),
      )
      .toEqual(['lucide-layout-row-glyph', 'lucide-circle', 'lucide-frame'])
  })

  it('marks the match in each row', async () => {
    renderFind()

    await search('STARTED')

    const marks = within(groupNamed('home')).getAllByText('started', {
      selector: 'mark',
    })
    expect(marks).toHaveLength(3)
  })

  it('shows one kind alone under its chip and counts that kind', async () => {
    renderFind()
    const user = await search('started')

    await user.click(screen.getByRole('button', { name: 'Text' }))

    expect([
      within(groupNamed('home')).getAllByRole('option').length,
      screen.getAllByRole('option').length,
    ]).toEqual([1, 2])
  })

  it('offers all kinds back when a chip matches none', async () => {
    renderFind({ hits: [hit('text', 'home')] })
    const user = await search('started')
    await user.click(screen.getByRole('button', { name: 'Frames' }))

    await user.click(screen.getByRole('button', { name: 'Show all' }))

    expect(screen.getAllByRole('option')).toHaveLength(1)
  })

  it('says a chip with none in a capped list may hold more past the cut', async () => {
    renderFind({ hits: [hit('text', 'home')], truncated: true })
    const user = await search('started')

    await user.click(screen.getByRole('button', { name: 'Frames' }))

    expect(
      screen.getByText(/The first 1 matches hold no frame/),
    ).toBeInTheDocument()
  })

  it('says the list is cut when the search capped its hits', async () => {
    renderFind({ truncated: true })

    await search('started')

    expect(screen.getByText(/Showing the first 4 matches/)).toBeInTheDocument()
  })

  it('says nothing matched rather than showing an empty list', async () => {
    renderFind({ hits: [] })
    const user = userEvent.setup()

    await user.type(screen.getByRole('combobox'), 'zebra')

    expect(
      await screen.findByText('Nothing in studio matches “zebra”.'),
    ).toBeInTheDocument()
  })

  it('picks the active hit on Enter after the arrows move it', async () => {
    const { picked } = renderFind()
    const user = await search('started')

    await user.keyboard('{ArrowDown}{Enter}')

    expect(picked).toEqual([HITS[1]])
  })

  it('picks a hit on a click', async () => {
    const { picked } = renderFind()
    const user = await search('started')

    await user.click(within(groupNamed('onboarding')).getByRole('option'))

    expect(picked).toEqual([HITS[3]])
  })

  it('closes on Esc in the field without the key reaching the board', async () => {
    renderFind()
    const user = userEvent.setup()
    const pressed: string[] = []
    const unbind = bindKeys(window)
    const unregister = registerActions([
      {
        id: 'selection.clear',
        label: 'Clear',
        group: 'selection',
        keys: ['Escape'],
        run: () => pressed.push('clear'),
      },
    ])

    await user.click(screen.getByRole('combobox'))
    await user.keyboard('{Escape}')
    unregister()
    unbind()

    expect([findStore.getState().open, pressed]).toEqual([false, []])
  })

  it('closes from the clear button once the field is empty, and clears it first', async () => {
    renderFind()
    const user = await search('started')

    await user.click(screen.getByRole('button', { name: 'Clear the search' }))
    const cleared = (screen.getByRole('combobox') as HTMLInputElement).value
    await user.click(screen.getByRole('button', { name: 'Close find' }))

    expect([cleared, findStore.getState().open]).toEqual(['', false])
  })
})

describe('useFindActions', () => {
  it('opens find on Cmd+F with the panels shown, leaving the Frame tool off', async () => {
    const store = createFindStore()
    const mode = createModeStore(1280)
    mode.setState({ hideUi: true })
    const framed: string[] = []
    const unregister = registerActions([
      {
        id: 'tool.frame',
        label: 'Frame',
        group: 'tool',
        keys: ['f'],
        run: () => framed.push('f'),
      },
    ])
    const unbind = bindKeys(window)
    const { unmount } = renderHook(() => useFindActions(store, mode))
    const user = userEvent.setup()

    // `$mod` is Meta on macOS and Control elsewhere, as on the CI runners.
    await user.keyboard(IS_MAC ? '{Meta>}f{/Meta}' : '{Control>}f{/Control}')
    const seen = [store.getState().open, mode.getState().hideUi, framed]
    unmount()
    unbind()
    unregister()

    expect(seen).toEqual([true, false, []])
  })

  it('closes find when the board unmounts', () => {
    const store = createFindStore()
    store.setState({ open: true })
    const { unmount } = renderHook(() =>
      useFindActions(store, createModeStore(1280)),
    )

    unmount()

    expect(store.getState().open).toBe(false)
  })
})
