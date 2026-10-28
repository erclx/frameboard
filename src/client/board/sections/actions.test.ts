import { afterEach, describe, expect, it } from 'vitest'

import type { Action } from '@/client/actions/registry'
import { createLiveStore } from '@/client/live/store'
import type { Structure } from '@/client/live/structure'
import type { SectionRecord } from '@/shared/records/list'
import { frameOf } from '@/test/board'

import { createModeStore } from '../mode'
import {
  createSelectionStore,
  select,
  selectElement,
  selectSection,
} from '../selection'
import {
  boxToolStore,
  placeSection,
  sectionActions,
  stopSectionRename,
} from './actions'

const PAGE = 'studio/home'
const A = frameOf('a', { box: { x: 0, y: 0, width: 400, height: 300 } })
const B = frameOf('b', { box: { x: 500, y: 100, width: 200, height: 400 } })
const FLOW: SectionRecord = {
  name: 'flow',
  box: { x: -40, y: -80, width: 800, height: 660 },
  order: 0,
  frames: ['a', 'b'],
}

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
    addSection: answer('addSection', FLOW),
    deleteSection: answer('deleteSection', { deleted: 'flow' }),
  } as unknown as Structure
  return { sent, calls }
}

function setup() {
  const selection = createSelectionStore()
  const mode = createModeStore(1280)
  const live = createLiveStore()
  live.setState({ canWrite: true })
  const { sent, calls } = fakeCalls()
  const writes: unknown[][] = []
  const actions = sectionActions({
    page: () => PAGE,
    frames: () => [A, B],
    sections: () => [FLOW],
    selection,
    mode,
    live,
    calls,
    write: async (...args) => {
      writes.push(args)
      return true
    },
  })
  const action = (id: string): Action => {
    const found = actions.find((candidate) => candidate.id === id)
    if (!found) throw new Error(`no action ${id}`)
    return found
  }
  const enabled = (id: string) => action(id).enabled?.() ?? true
  return { selection, mode, live, sent, writes, calls, action, enabled }
}

/** Lets the call a run started answer and its `then` run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('sectionActions', () => {
  afterEach(() => {
    stopSectionRename()
    boxToolStore.setState({ tool: 'frame' })
  })

  it('wraps the selected frames in one padded box and selects it', async () => {
    const { selection, sent, action } = setup()
    select(selection, PAGE, [A.ref, B.ref])

    action('section.wrap').run()
    await settle()

    expect(sent).toEqual([
      ['addSection', PAGE, { x: -40, y: -80, width: 780, height: 620 }],
    ])
    expect(selection.getState()).toMatchObject({ frames: [], section: 'flow' })
  })

  it('wraps nothing with no frame selected', () => {
    const { enabled } = setup()

    expect(enabled('section.wrap')).toBe(false)
  })

  it('deletes the selected section and keeps its frames', async () => {
    const { selection, sent, action } = setup()
    selectSection(selection, PAGE, 'flow')

    action('section.delete').run()
    await settle()

    expect(sent).toEqual([['deleteSection', PAGE, 'flow']])
    expect(selection.getState().page).toBeNull()
  })

  it('leaves Delete to the frame while a frame is selected', () => {
    const { selection, enabled } = setup()
    select(selection, PAGE, [A.ref])

    expect([enabled('section.delete'), enabled('section.rename')]).toEqual([
      false,
      false,
    ])
  })

  it('takes nothing while an element is selected', () => {
    const { selection, enabled } = setup()
    selectElement(selection, PAGE, { frame: A.ref, index: 3, hash: 'a' })

    expect(enabled('section.wrap')).toBe(false)
  })

  it.each(['section.wrap', 'section.rename', 'section.delete', 'tool.section'])(
    'greys out %s in a read-only tab',
    (id) => {
      const { selection, live, enabled } = setup()
      select(selection, PAGE, [A.ref])
      selectSection(selection, PAGE, 'flow')
      live.setState({ canWrite: false })

      expect(enabled(id)).toBe(false)
    },
  )

  it('nudges the selected section 10 px with its frames in one write', () => {
    const { selection, writes, action } = setup()
    selectSection(selection, PAGE, 'flow')

    action('section.nudgeRightFar').run()

    expect(writes).toEqual([
      [
        PAGE,
        {
          [A.ref]: { ...A.box, x: 10 },
          [B.ref]: { ...B.box, x: 510 },
        },
        { [A.ref]: A.box, [B.ref]: B.box },
        undefined,
        {
          boxes: { flow: { ...FLOW.box, x: -30 } },
          expected: { flow: FLOW.box },
        },
      ],
    ])
  })

  it('leaves the arrows to the frames while frames are selected', () => {
    const { selection, enabled } = setup()
    select(selection, PAGE, [A.ref])

    expect(enabled('section.nudgeLeft')).toBe(false)
  })

  it('turns the Section tool on and shows it in the Frame slot', () => {
    const { mode, action } = setup()
    mode.setState({ mode: 'play' })

    action('tool.section').run()

    expect([mode.getState(), boxToolStore.getState().tool]).toMatchObject([
      { mode: 'edit', tool: 'section' },
      'section',
    ])
  })
})

describe('placeSection', () => {
  it('draws the clicked size from the point, selects it, and returns to Move', async () => {
    const selection = createSelectionStore()
    const mode = createModeStore(1280)
    mode.setState({ tool: 'section' })
    const { sent, calls } = fakeCalls()

    await placeSection(PAGE, { x: 10.4, y: 20.6 }, { calls, selection, mode })

    expect([sent, mode.getState().tool, selection.getState().section]).toEqual([
      [['addSection', PAGE, { x: 10, y: 21, width: 800, height: 600 }]],
      'move',
      'flow',
    ])
  })
})
