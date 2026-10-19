import { describe, expect, it } from 'vitest'

import type { Action } from '@/client/actions/registry'
import { createLiveStore } from '@/client/live/store'
import type { Structure } from '@/client/live/structure'
import type { FrameRecord } from '@/shared/records/list'
import { frameOf } from '@/test/board'

import { createModeStore } from '../mode'
import { createSelectionStore, select, selectElement } from '../selection'
import {
  createClipboardStore,
  renamingFrame,
  stopFrameRename,
  structureActions,
} from './actions'

const PAGE = 'studio/home'
const A = frameOf('a')
const B = frameOf('b', { box: { x: 500, y: 0, width: 390, height: 844 } })
const LOCKED = frameOf('locked', { locked: true })

/** The calls the actions sent, by name with their arguments, each answering as the server would. */
function fakeCalls() {
  const sent: [string, ...unknown[]][] = []
  const answer =
    <T>(name: string, value: T) =>
    async (...args: unknown[]) => {
      sent.push([name, ...args])
      return value
    }
  const copies = [frameOf('a-2'), frameOf('b-2')]
  const calls = {
    duplicateFrames: answer('duplicateFrames', copies),
    deleteFrames: answer('deleteFrames', []),
    flagFrames: answer('flagFrames', []),
    copyFrames: answer('copyFrames', { held: 2 }),
    cutFrames: answer('cutFrames', { held: 1 }),
    pasteFrames: answer('pasteFrames', copies),
  } as unknown as Structure
  return { sent, calls, copies }
}

function setup(frames: FrameRecord[] = [A, B, LOCKED]) {
  const selection = createSelectionStore()
  const mode = createModeStore(1280)
  const live = createLiveStore()
  live.setState({ canWrite: true })
  const clipboard = createClipboardStore()
  const { sent, calls, copies } = fakeCalls()
  const actions = structureActions({
    page: () => PAGE,
    frames: () => frames,
    selection,
    mode,
    live,
    clipboard,
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
    sent,
    copies,
    action,
    actions,
    enabled,
  }
}

/** Lets the call a run started answer and its `then` run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const SELECTION_ACTIONS = [
  'frame.duplicate',
  'frame.delete',
  'frame.hide',
  'frame.lock',
  'frame.copy',
  'frame.cut',
]

describe('structureActions', () => {
  it('lists every action in the palette', () => {
    const { actions } = setup()

    expect(actions.filter((action) => !action.command)).toEqual([])
  })

  it.each(SELECTION_ACTIONS)(
    'enables %s with a frame selected in Edit',
    (id) => {
      const { selection, enabled } = setup()
      select(selection, PAGE, [A.ref])

      expect(enabled(id)).toBe(true)
    },
  )

  it.each(SELECTION_ACTIONS)('disables %s with nothing selected', (id) => {
    const { enabled } = setup()

    expect(enabled(id)).toBe(false)
  })

  it.each(SELECTION_ACTIONS)('disables %s in Play', (id) => {
    const { selection, mode, enabled } = setup()
    select(selection, PAGE, [A.ref])
    mode.setState({ mode: 'play' })

    expect(enabled(id)).toBe(false)
  })

  it.each(SELECTION_ACTIONS)(
    'disables %s while the tab may not write',
    (id) => {
      const { selection, live, enabled } = setup()
      select(selection, PAGE, [A.ref])
      live.setState({ canWrite: false })

      expect(enabled(id)).toBe(false)
    },
  )

  it.each([...SELECTION_ACTIONS, 'frame.rename'])(
    'disables %s while an element is selected',
    (id) => {
      const { selection, enabled } = setup()
      selectElement(selection, PAGE, { frame: A.ref, index: 3, hash: 'h' })

      expect(enabled(id)).toBe(false)
    },
  )

  it('disables a selection on another page', () => {
    const { selection, enabled } = setup()
    select(selection, 'studio/pricing', ['studio/pricing/plans'])

    expect(enabled('frame.delete')).toBe(false)
  })

  it.each(['frame.delete', 'frame.cut'])(
    'disables %s when a selected frame is locked',
    (id) => {
      const { selection, enabled } = setup()
      select(selection, PAGE, [A.ref, LOCKED.ref])

      expect(enabled(id)).toBe(false)
    },
  )

  it('still copies a locked frame', () => {
    const { selection, enabled } = setup()
    select(selection, PAGE, [LOCKED.ref])

    expect(enabled('frame.copy')).toBe(true)
  })

  it('opens the rename on the inspector, leaving the Frame tool', () => {
    const { selection, mode, action } = setup()
    select(selection, PAGE, [A.ref])
    mode.setState({ tool: 'frame' })

    action('frame.rename').run()

    expect(renamingFrame()).toEqual({ ref: A.ref, surface: 'inspector' })
    expect(mode.getState().tool).toBe('move')
    stopFrameRename()
  })

  it('disables rename while the panels are hidden', () => {
    const { selection, mode, enabled } = setup()
    select(selection, PAGE, [A.ref])
    mode.setState({ hideUi: true })

    expect(enabled('frame.rename')).toBe(false)
  })

  it('renames only one selected frame', () => {
    const { selection, enabled } = setup()
    select(selection, PAGE, [A.ref, B.ref])

    expect(enabled('frame.rename')).toBe(false)
  })

  it('duplicates the selection in one call and selects the copies', async () => {
    const { selection, sent, copies, action } = setup()
    select(selection, PAGE, [A.ref, B.ref])

    action('frame.duplicate').run()
    await settle()

    expect(sent).toEqual([['duplicateFrames', [A.ref, B.ref]]])
    expect(selection.getState().frames).toEqual(copies.map((copy) => copy.ref))
  })

  it('locks a selection holding an unlocked frame, and unlocks one all locked', () => {
    const { selection, sent, action } = setup()
    select(selection, PAGE, [A.ref, LOCKED.ref])
    action('frame.lock').run()
    select(selection, PAGE, [LOCKED.ref])
    action('frame.lock').run()

    expect(sent).toEqual([
      ['flagFrames', [A.ref, LOCKED.ref], 'locked', true],
      ['flagFrames', [LOCKED.ref], 'locked', false],
    ])
  })

  it('keeps paste disabled until something is copied', async () => {
    const { selection, enabled, action } = setup()
    expect(enabled('frame.paste')).toBe(false)
    select(selection, PAGE, [A.ref])

    action('frame.copy').run()
    await settle()

    expect(enabled('frame.paste')).toBe(true)
  })

  it('pastes onto the page on the canvas and selects what it pasted', async () => {
    const { selection, clipboard, sent, copies, action } = setup()
    clipboard.setState({ held: 2 })

    action('frame.paste').run()
    await settle()

    expect(sent).toEqual([['pasteFrames', PAGE]])
    expect(selection.getState().frames).toEqual(copies.map((copy) => copy.ref))
  })
})
