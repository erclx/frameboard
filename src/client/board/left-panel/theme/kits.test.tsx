import '../../../styles.css'

import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { liveStore } from '@/client/live/store'
import { createStructure } from '@/client/live/structure'
import type { KitRecord } from '@/shared/kits'
import type { ProjectKitRecord } from '@/shared/records/list'
import { boardOf, frameOf, pageOf } from '@/test/board'

import { closeNote, newNoteDraft, notesUi } from '../../notes/tool'
import { clear, select, selectionStore } from '../../selection'
import { closeTheme, openTheme, themeDialogStore } from './dialog-store'
import { ASK_FOR_KIT, KitsSection } from './kits'

const SKETCH: ProjectKitRecord = {
  name: 'sketch',
  title: 'Sketch',
  frameCount: 3,
}
const WIREFRAME: ProjectKitRecord = {
  name: 'wireframe',
  title: 'Wireframe',
  frameCount: 0,
}

function kit(name: string, extra: Partial<KitRecord> = {}): KitRecord {
  return {
    name,
    title: name[0]?.toUpperCase() + name.slice(1),
    description: '',
    source: 'shipped',
    preview: null,
    ...extra,
  }
}

const LISTED = [
  kit('clean'),
  kit('sketch'),
  kit('wireframe'),
  kit('brand', { source: 'board' }),
]
const loadKits = async () => LISTED

/** Puts a board whose `studio` project added `kits` on the live store. */
function liveBoard(kits: ProjectKitRecord[], canWrite = true) {
  const board = boardOf(pageOf([frameOf('hero'), frameOf('pricing')]))
  const [project] = board.projects
  if (project) project.kits = kits
  act(() => liveStore.setState({ board, canWrite }))
}

/** A structure recording each path and body it posts, answering ok. */
function recordingCalls() {
  const sent: { path: string; body: unknown }[] = []
  const calls = createStructure(async (path, init) => {
    sent.push({ path: String(path), body: JSON.parse(String(init?.body)) })
    return Response.json({ ok: true, data: {} })
  })
  return { sent, calls }
}

function renderSection(calls = recordingCalls()) {
  render(
    <KitsSection project="studio" loadKits={loadKits} calls={calls.calls} />,
  )
  return calls.sent
}

async function openList() {
  await userEvent.click(screen.getByRole('button', { name: 'Add kit' }))
  return screen.findByRole('menu')
}

beforeEach(() => {
  liveBoard([SKETCH, WIREFRAME])
})

afterEach(() => {
  act(() => {
    liveStore.setState({ board: null, canWrite: false })
    closeTheme()
    clear(selectionStore)
    closeNote()
    notesUi.setState({ drafts: {} })
  })
})

describe('KitsSection', () => {
  it("lists the project's kits with how many frames use each", () => {
    renderSection()

    const list = screen.getByRole('list')
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Sketch3 frames', 'Wireframenot used'])
  })

  it('says how to start while the project holds no kit', () => {
    liveBoard([])
    renderSection()

    expect(
      screen.getByText(
        'No kits yet. Add one, then set it on frames in the inspector.',
      ),
    ).toBeInTheDocument()
  })

  it('marks the added kits in Add kit and names a saved one', async () => {
    renderSection()

    const menu = await openList()
    const items = await within(menu).findAllByRole('menuitem')

    expect(items.map((item) => item.textContent)).toEqual([
      'Clean',
      'Sketchadded',
      'Wireframeadded',
      'Brandsaved on this board',
      expect.stringMatching(/^Ask the agent for a new kit/),
    ])
    expect(
      within(menu).getByRole('menuitem', { name: /^Sketch/ }),
    ).toHaveAttribute('aria-disabled', 'true')
  })

  it('adds a kit picked in Add kit', async () => {
    const sent = renderSection()

    const menu = await openList()
    await userEvent.click(
      await within(menu).findByRole('menuitem', { name: 'Clean' }),
    )

    expect(sent).toEqual([
      { path: '/api/kits/install', body: { project: 'studio', kit: 'clean' } },
    ])
  })

  it('confirms Remove of a kit in use with its frame count before removing it', async () => {
    const sent = renderSection()

    await userEvent.click(screen.getByRole('button', { name: 'Remove Sketch' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Remove Sketch?',
    })

    expect(dialog).toHaveTextContent('The 3 frames using it')
    expect(sent).toEqual([])
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Remove' }),
    )
    expect(sent).toEqual([
      { path: '/api/kits/remove', body: { project: 'studio', kit: 'sketch' } },
    ])
  })

  it('removes nothing when the confirm is cancelled', async () => {
    const sent = renderSection()

    await userEvent.click(screen.getByRole('button', { name: 'Remove Sketch' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    )

    expect(sent).toEqual([])
  })

  it('removes a kit no frame uses with no confirm', async () => {
    const sent = renderSection()

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove Wireframe' }),
    )

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(sent).toEqual([
      {
        path: '/api/kits/remove',
        body: { project: 'studio', kit: 'wireframe' },
      },
    ])
  })

  it('disables Ask the agent with a hint while no frame is selected', async () => {
    renderSection()

    const menu = await openList()
    const ask = within(menu).getByRole('menuitem', {
      name: /^Ask the agent for a new kit/,
    })

    expect(ask).toHaveAttribute('aria-disabled', 'true')
    expect(ask).toHaveTextContent('Select a frame to pin the note on')
  })

  it('opens a prefilled note on the selected frame from Ask the agent', async () => {
    act(() => select(selectionStore, 'studio/home', ['studio/home/pricing']))
    renderSection()

    const menu = await openList()
    await userEvent.click(
      within(menu).getByRole('menuitem', {
        name: 'Ask the agent for a new kit',
      }),
    )

    const open = notesUi.getState().open
    expect(open?.kind === 'new' ? open.pick.frame.ref : null).toBe(
      'studio/home/pricing',
    )
    expect(notesUi.getState().drafts[newNoteDraft('studio/home/pricing')]).toBe(
      ASK_FOR_KIT,
    )
  })

  it('closes the Theme dialog ahead of the note, with nothing to hand the focus back to', async () => {
    act(() => {
      select(selectionStore, 'studio/home', ['studio/home/pricing'])
      openTheme('kits', 'kits')
    })
    let openAsTheNoteOpened: boolean | undefined
    const unsubscribe = notesUi.subscribe(() => {
      openAsTheNoteOpened ??= themeDialogStore.getState().open
    })
    renderSection()

    const menu = await openList()
    await userEvent.click(
      within(menu).getByRole('menuitem', {
        name: 'Ask the agent for a new kit',
      }),
    )
    unsubscribe()

    expect(openAsTheNoteOpened).toBe(false)
    expect(themeDialogStore.getState().opener).toBeNull()
  })

  it('disables Add kit and Remove on a tab that may not write, saying why', () => {
    liveBoard([SKETCH], false)
    renderSection()

    expect(screen.getByRole('button', { name: 'Add kit' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove Sketch' })).toBeDisabled()
    expect(
      screen.getByText('View only, so kits can’t be added or removed here.'),
    ).toBeInTheDocument()
  })
})
