import { Frame } from 'lucide-react'
import { useEffect } from 'react'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

import { refreshActions, registerActions } from '@/client/actions/registry'
import { liveStore } from '@/client/live/store'
import { type Structure, structure } from '@/client/live/structure'
import { DEFAULT_FRAME_SIZE, type FrameSizePreset } from '@/shared/frame-sizes'
import { nextFreeName } from '@/shared/names'
import type { FrameRecord } from '@/shared/records/list'

import { reportRefusal } from '../left-panel/page-actions'
import { type ModeStore, modeStore } from '../mode'
import { select, type SelectionStore, selectionStore } from '../selection'

/** The preset the Frame tool's next click places, chosen from the inspector's list. */
export type PresetStore = StoreApi<{ preset: FrameSizePreset }>

export const presetStore: PresetStore = createStore<{
  preset: FrameSizePreset
}>()(() => ({ preset: DEFAULT_FRAME_SIZE }))

export function usePreset(): FrameSizePreset {
  return useStore(presetStore, (state) => state.preset)
}

export function choosePreset(preset: FrameSizePreset): void {
  presetStore.setState({ preset })
}

/** The name a new frame takes, being `frame` or its next free copy among every frame on the page. */
export const NEW_FRAME_NAME = 'frame'

export interface PlaceContext {
  page: string
  /** Every frame on the page, hidden ones included, since they hold names too. */
  frames: readonly FrameRecord[]
  preset?: PresetStore
  selection?: SelectionStore
  mode?: ModeStore
  calls?: Structure
}

/**
 * Adds a frame at the chosen preset with its top left corner on a board
 * point, then selects it and returns to Move, as one click of the Frame tool.
 */
export async function placeFrame(
  point: { x: number; y: number },
  {
    page,
    frames,
    preset = presetStore,
    selection = selectionStore,
    mode = modeStore,
    calls = structure,
  }: PlaceContext,
): Promise<void> {
  const name = nextFreeName(
    NEW_FRAME_NAME,
    frames.map((frame) => frame.name),
  )
  try {
    const added = await calls.addFrame(
      `${page}/${name}`,
      preset.getState().preset,
      Math.round(point.x),
      Math.round(point.y),
    )
    select(selection, page, [added.ref])
    mode.setState({ tool: 'move' })
  } catch (error) {
    reportRefusal("Couldn't add a frame")(error)
  }
}

const canWrite = () => liveStore.getState().canWrite

/**
 * Registers the Frame tool, key F, which fills the toolbar's Frame slot. It
 * writes, so it is enabled only while this tab may, and a tab losing write
 * returns to Move.
 */
export function useFrameTool(): void {
  useEffect(() => {
    const unregister = registerActions([
      {
        id: 'tool.frame',
        label: 'Frame',
        group: 'tool',
        command: { label: 'Add a frame', icon: Frame },
        keys: ['f'],
        enabled: canWrite,
        // Picking a tool returns to Edit, since a tool only works there.
        run: () => modeStore.setState({ tool: 'frame', mode: 'edit' }),
        checked: () =>
          modeStore.getState().mode === 'edit' &&
          modeStore.getState().tool === 'frame',
      },
    ])
    const unsubscribe = liveStore.subscribe((state, previous) => {
      if (state.canWrite === previous.canWrite) return
      refreshActions()
      if (!state.canWrite && modeStore.getState().tool === 'frame') {
        modeStore.setState({ tool: 'move' })
      }
    })
    return () => {
      unsubscribe()
      unregister()
    }
  }, [])
}
