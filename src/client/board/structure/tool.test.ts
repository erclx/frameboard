import { describe, expect, it } from 'vitest'
import { createStore } from 'zustand/vanilla'

import type { Structure } from '@/client/live/structure'
import type { FrameSizePreset } from '@/shared/frame-sizes'
import { frameOf } from '@/test/board'

import { createModeStore } from '../mode'
import { createSelectionStore } from '../selection'
import { placeFrame } from './tool'

const PAGE = 'studio/home'

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
  const preset = createStore<{ preset: FrameSizePreset }>()(() => ({
    preset: 'tablet',
  }))
  return { sent, calls, selection, mode, preset }
}

describe('placeFrame', () => {
  it('adds a frame at the chosen preset with its corner on the clicked point', async () => {
    const { sent, calls, selection, mode, preset } = setup(async () =>
      frameOf('frame'),
    )

    await placeFrame(
      { x: 120.4, y: -40.6 },
      { page: PAGE, frames: [], calls, selection, mode, preset },
    )

    expect(sent).toEqual([['studio/home/frame', 'tablet', 120, -41]])
  })

  it('selects the new frame and returns to Move', async () => {
    const { calls, selection, mode, preset } = setup(async () =>
      frameOf('frame'),
    )

    await placeFrame(
      { x: 0, y: 0 },
      { page: PAGE, frames: [], calls, selection, mode, preset },
    )

    expect(selection.getState()).toMatchObject({
      page: PAGE,
      frames: ['studio/home/frame'],
    })
    expect(mode.getState().tool).toBe('move')
  })

  it('takes the next free name, counting hidden frames', async () => {
    const { sent, calls, selection, mode, preset } = setup(async () =>
      frameOf('frame-2'),
    )

    await placeFrame(
      { x: 0, y: 0 },
      {
        page: PAGE,
        frames: [frameOf('frame', { hidden: true })],
        calls,
        selection,
        mode,
        preset,
      },
    )

    expect(sent[0]?.[0]).toBe('studio/home/frame-2')
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
