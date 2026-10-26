import { describe, expect, it } from 'vitest'
import { createStore } from 'zustand/vanilla'

import type { Structure } from '@/client/live/structure'
import type { FrameSizeName } from '@/shared/frame-sizes'
import { frameOf } from '@/test/board'

import type { Box } from '../geometry/box'
import { createModeStore } from '../mode'
import { createSelectionStore } from '../selection'
import { placeFrame } from './tool'

const PAGE = 'studio/home'

/** The view's board area, 1000 by 800 from the origin. */
const VISIBLE: Box = { x: 0, y: 0, width: 1000, height: 800 }

function setup(answer: () => Promise<unknown>) {
  const sent: unknown[][] = []
  const calls = {
    addFrame: async (...args: unknown[]) => {
      sent.push(args)
      return answer()
    },
  } as unknown as Structure
  const selection = createSelectionStore()
  const mode = createModeStore(1280)
  mode.setState({ tool: 'frame' })
  const preset = createStore<{ preset: FrameSizeName }>()(() => ({
    preset: 'tablet',
  }))
  const centered: Box[] = []
  const renamed: string[] = []
  const view = { centerOn: (box: Box) => void centered.push(box) }
  const rename = (ref: string) => void renamed.push(ref)
  return {
    sent,
    calls,
    selection,
    mode,
    preset,
    centered,
    renamed,
    view,
    rename,
  }
}

describe('placeFrame', () => {
  it('adds a frame at the chosen preset with its corner on the clicked point', async () => {
    const { sent, calls, selection, mode, preset } = setup(async () =>
      frameOf('tablet'),
    )

    await placeFrame(
      { x: 120.4, y: -40.6 },
      { page: PAGE, frames: [], calls, selection, mode, preset },
    )

    expect(sent).toEqual([
      ['studio/home/tablet', { width: 834, height: 1194 }, 120, -41],
    ])
  })

  it('adds a picked device at its size, named for it', async () => {
    const { sent, calls, selection, mode, preset } = setup(async () =>
      frameOf('iphone-16'),
    )
    preset.setState({ preset: 'iphone-16' })

    await placeFrame(
      { x: 0, y: 0 },
      { page: PAGE, frames: [], calls, selection, mode, preset },
    )

    expect(sent).toEqual([
      ['studio/home/iphone-16', { width: 393, height: 852 }, 0, 0],
    ])
  })

  it('selects the new frame and returns to Move', async () => {
    const { calls, selection, mode, preset } = setup(async () =>
      frameOf('tablet'),
    )

    await placeFrame(
      { x: 0, y: 0 },
      { page: PAGE, frames: [], calls, selection, mode, preset },
    )

    expect(selection.getState()).toMatchObject({
      page: PAGE,
      frames: ['studio/home/tablet'],
    })
    expect(mode.getState().tool).toBe('move')
  })

  it("takes the preset's next free name, counting hidden frames", async () => {
    const { sent, calls, selection, mode, preset } = setup(async () =>
      frameOf('tablet-2'),
    )

    await placeFrame(
      { x: 0, y: 0 },
      {
        page: PAGE,
        frames: [frameOf('tablet', { hidden: true })],
        calls,
        selection,
        mode,
        preset,
      },
    )

    expect(sent[0]?.[0]).toBe('studio/home/tablet-2')
  })

  it('centers a new frame placed partly out of view', async () => {
    const box = { x: 900, y: 100, width: 834, height: 1194 }
    const { calls, selection, mode, preset, centered, view } = setup(async () =>
      frameOf('tablet', { box }),
    )

    await placeFrame(
      { x: 900, y: 100 },
      {
        page: PAGE,
        frames: [],
        calls,
        selection,
        mode,
        preset,
        view,
        visible: VISIBLE,
      },
    )

    expect(centered).toEqual([box])
  })

  it('leaves the view on a new frame wholly in it', async () => {
    const box = { x: 10, y: 10, width: 390, height: 600 }
    const { calls, selection, mode, preset, centered, view } = setup(async () =>
      frameOf('phone', { box }),
    )

    await placeFrame(
      { x: 10, y: 10 },
      {
        page: PAGE,
        frames: [],
        calls,
        selection,
        mode,
        preset,
        view,
        visible: VISIBLE,
      },
    )

    expect(centered).toEqual([])
  })

  it("opens the new frame's rename in the inspector", async () => {
    const { calls, selection, mode, preset, renamed, rename } = setup(
      async () => frameOf('tablet'),
    )

    await placeFrame(
      { x: 0, y: 0 },
      { page: PAGE, frames: [], calls, selection, mode, preset, rename },
    )

    expect(renamed).toEqual(['studio/home/tablet'])
  })

  it('resolves to the frame the server added', async () => {
    const added = frameOf('tablet')
    const { calls, selection, mode, preset } = setup(async () => added)

    const placed = await placeFrame(
      { x: 0, y: 0 },
      { page: PAGE, frames: [], calls, selection, mode, preset },
    )

    expect(placed).toBe(added)
  })

  it('resolves to null when the add is refused', async () => {
    const { calls, selection, mode, preset } = setup(async () => {
      throw new Error('refused')
    })

    const placed = await placeFrame(
      { x: 0, y: 0 },
      { page: PAGE, frames: [], calls, selection, mode, preset },
    )

    expect(placed).toBeNull()
  })

  it('stays on the Frame tool and selects nothing when the add is refused', async () => {
    const { calls, selection, mode, preset } = setup(async () => {
      throw new Error('refused')
    })

    await placeFrame(
      { x: 0, y: 0 },
      { page: PAGE, frames: [], calls, selection, mode, preset },
    )

    expect(selection.getState().frames).toEqual([])
    expect(mode.getState().tool).toBe('frame')
  })
})
