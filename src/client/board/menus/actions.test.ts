import { describe, expect, it } from 'vitest'
import { createStore } from 'zustand/vanilla'

import type { Action } from '@/client/actions/registry'
import { createLiveStore } from '@/client/live/store'
import type { Structure } from '@/client/live/structure'
import { createThemeStore, frameTheme } from '@/client/theme/store'
import { DEFAULT_FRAME_SIZE } from '@/shared/frame-sizes'
import { frameOf } from '@/test/board'

import { createModeStore } from '../mode'
import type { NotesUiState } from '../notes/tool'
import { createSelectionStore, select, selectElement } from '../selection'
import { createClipboardStore } from '../structure/actions'
import { presetStore } from '../structure/tool'
import { createMenuPlace, menuActions } from './actions'

const PAGE = 'studio/home'
const A = frameOf('a')
const B = frameOf('b', { box: { x: 500, y: 0, width: 390, height: 844 } })

/** The calls the actions sent, by name with their arguments, each answering as the server would. */
function fakeCalls() {
  const sent: [string, ...unknown[]][] = []
  const answer =
    <T>(name: string, value: T) =>
    async (...args: unknown[]) => {
      sent.push([name, ...args])
      return value
    }
  const calls = {
    pasteFrames: answer('pasteFrames', [frameOf('a-2'), frameOf('b-2')]),
    addFrame: answer('addFrame', frameOf('frame')),
  } as unknown as Structure
  return { sent, calls }
}

function setup({
  renderedAt = '2026-10-19T00:00:00.000Z' as string | null,
} = {}) {
  const selection = createSelectionStore()
  const mode = createModeStore(1280)
  const live = createLiveStore()
  live.setState({ canWrite: true })
  const clipboard = createClipboardStore()
  const theme = createThemeStore()
  const place = createMenuPlace()
  const notes = createStore<NotesUiState>()(() => ({ open: null, drafts: {} }))
  const { sent, calls } = fakeCalls()
  const actions = menuActions({
    page: () => PAGE,
    frames: () => [A, B],
    renderedAt: () => renderedAt,
    place,
    selection,
    mode,
    live,
    clipboard,
    theme,
    preset: presetStore,
    notes,
    calls,
  })
  const action = (id: string): Action => {
    const found = actions.find((candidate) => candidate.id === id)
    if (!found) throw new Error(`no action ${id}`)
    return found
  }
  const enabled = (id: string) => action(id).enabled?.() ?? true
  return {
    selection,
    mode,
    live,
    clipboard,
    theme,
    place,
    notes,
    sent,
    actions,
    action,
    enabled,
  }
}

/** Lets the call a run started answer and its `then` run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('menuActions', () => {
  it('lists the flip alone in the palette, since the rest need a right-clicked point', () => {
    const { actions } = setup()

    expect(
      actions.filter((action) => action.command).map((action) => action.id),
    ).toEqual(['frame.flipTheme'])
  })

  it('disables every action in Play', () => {
    const { selection, place, clipboard, mode, actions } = setup()
    select(selection, PAGE, [A.ref])
    place.setState({ at: { x: 10, y: 10 }, frame: A.ref })
    clipboard.setState({ held: 1 })

    mode.setState({ mode: 'play' })

    expect(actions.filter((action) => action.enabled?.())).toEqual([])
  })

  describe('frame.flipTheme', () => {
    it('names the theme the right-clicked frame does not show', () => {
      const { selection, place, action } = setup()
      select(selection, PAGE, [A.ref])
      place.setState({ at: { x: 10, y: 10 }, frame: A.ref })

      expect(action('frame.flipTheme').label).toBe('Flip to dark')
    })

    it('flips the frame alone and renames itself after it', () => {
      const { selection, place, theme, action } = setup()
      select(selection, PAGE, [A.ref])
      place.setState({ at: { x: 10, y: 10 }, frame: A.ref })

      action('frame.flipTheme').run()

      expect([
        frameTheme(A.ref, theme),
        frameTheme(B.ref, theme),
        action('frame.flipTheme').label,
      ]).toEqual(['dark', 'light', 'Flip to light'])
    })

    it('keeps a flipped frame opposite the board when the board switches', () => {
      const { selection, place, theme, action } = setup()
      select(selection, PAGE, [A.ref])
      place.setState({ at: { x: 10, y: 10 }, frame: A.ref })
      action('frame.flipTheme').run()

      theme.setState({ choice: 'dark' })

      expect([
        frameTheme(A.ref, theme),
        action('frame.flipTheme').label,
      ]).toEqual(['light', 'Flip to dark'])
    })

    it('ends a mixed selection in the theme opposite the right-clicked frame', () => {
      const { selection, place, theme, action } = setup()
      select(selection, PAGE, [A.ref])
      place.setState({ at: { x: 10, y: 10 }, frame: A.ref })
      action('frame.flipTheme').run()
      select(selection, PAGE, [A.ref, B.ref])
      place.setState({ at: { x: 600, y: 10 }, frame: B.ref })

      action('frame.flipTheme').run()

      expect([frameTheme(A.ref, theme), frameTheme(B.ref, theme)]).toEqual([
        'dark',
        'dark',
      ])
    })

    it('writes nothing to the server', () => {
      const { selection, place, sent, action } = setup()
      select(selection, PAGE, [A.ref])
      place.setState({ at: { x: 10, y: 10 }, frame: A.ref })

      action('frame.flipTheme').run()

      expect(sent).toEqual([])
    })
  })

  describe('frame.pasteAt', () => {
    it('stays disabled with nothing held to paste', () => {
      const { place, enabled } = setup()

      place.setState({ at: { x: 10, y: 10 }, frame: null })

      expect(enabled('frame.pasteAt')).toBe(false)
    })

    it('stays disabled with no menu open', () => {
      const { clipboard, enabled } = setup()

      clipboard.setState({ held: 2 })

      expect(enabled('frame.pasteAt')).toBe(false)
    })

    it('pastes at the right-clicked point, rounded, and selects what it pasted', async () => {
      const { clipboard, place, selection, sent, action } = setup()
      clipboard.setState({ held: 2 })
      place.setState({ at: { x: 120.4, y: -39.6 }, frame: null })

      action('frame.pasteAt').run()
      await settle()

      expect(sent).toEqual([['pasteFrames', PAGE, { x: 120, y: -40 }]])
      expect(selection.getState().frames).toEqual([
        'studio/home/a-2',
        'studio/home/b-2',
      ])
    })
  })

  describe('frame.newAt', () => {
    it('adds a frame at the chosen preset with its corner on the point', async () => {
      const { place, sent, action } = setup()
      place.setState({ at: { x: 300.2, y: 40.7 }, frame: null })

      action('frame.newAt').run()
      await settle()

      expect(sent).toEqual([
        [
          'addFrame',
          `studio/home/${DEFAULT_FRAME_SIZE}`,
          { width: 1440, height: 900 },
          300,
          41,
        ],
      ])
    })

    it('stays disabled while the tab may not write', () => {
      const { place, live, enabled } = setup()
      place.setState({ at: { x: 10, y: 10 }, frame: null })

      live.setState({ canWrite: false })

      expect(enabled('frame.newAt')).toBe(false)
    })
  })

  describe('note.addHere', () => {
    it('opens the composer on the selected element at the point', () => {
      const { selection, place, notes, mode, action } = setup()
      selectElement(selection, PAGE, { frame: A.ref, index: 4, hash: 'h' })
      place.setState({ at: { x: 30, y: 60 }, frame: A.ref })

      action('note.addHere').run()

      expect([notes.getState().open, mode.getState().tool]).toEqual([
        {
          kind: 'new',
          pick: {
            frame: { ref: A.ref, name: 'a' },
            element: 4,
            renderedAt: '2026-10-19T00:00:00.000Z',
            at: { x: 30, y: 60 },
          },
        },
        'note',
      ])
    })

    it('opens a frame note when the frame has not finished a load', () => {
      const { selection, place, notes, action } = setup({ renderedAt: null })
      selectElement(selection, PAGE, { frame: A.ref, index: 4, hash: 'h' })
      place.setState({ at: { x: 30, y: 60 }, frame: A.ref })

      action('note.addHere').run()

      expect(notes.getState().open).toMatchObject({
        pick: { element: null, renderedAt: null },
      })
    })

    it('stays disabled with a frame selected rather than an element', () => {
      const { selection, place, enabled } = setup()
      select(selection, PAGE, [A.ref])

      place.setState({ at: { x: 30, y: 60 }, frame: A.ref })

      expect(enabled('note.addHere')).toBe(false)
    })
  })
})
