import { MoveHorizontal } from 'lucide-react'
import { useEffect } from 'react'

import {
  type Action,
  refreshActions,
  registerActions,
} from '@/client/actions/registry'
import { liveStore } from '@/client/live/store'
import { FRAME_SIZES } from '@/shared/frame-sizes'

import { PRESETS } from '../inspector/presets'
import { type SelectionStore, selectionStore } from '../selection'
import {
  endPreview,
  followPreview,
  onPreviewChange,
  previewOf,
  setPreview,
} from './store'

/**
 * Preview at phone, tablet, and desktop width and End preview, each acting
 * on every selected frame. They live in the palette alone, with no key, and
 * draw the frames at the width without writing anything.
 */
export function previewActions(
  selection: SelectionStore = selectionStore,
): Action[] {
  const selected = () => selection.getState().frames
  return [
    ...PRESETS.map(({ preset, label, icon }) => {
      const { width } = FRAME_SIZES[preset]
      const named = `Preview at ${label.toLowerCase()} width`
      return {
        id: `preview.${preset}`,
        label: named,
        group: 'preview',
        command: { label: named, icon, hint: () => `${width}` },
        enabled: () => selected().length > 0,
        checked: () =>
          selected().length > 0 &&
          selected().every((ref) => previewOf(ref)?.width === width),
        run: () => setPreview(selected(), width),
      }
    }),
    {
      id: 'preview.end',
      label: 'End preview',
      group: 'preview',
      command: { label: 'End preview', icon: MoveHorizontal },
      enabled: () => selected().some((ref) => previewOf(ref) !== undefined),
      run: () => endPreview(selected()),
    },
  ]
}

/**
 * Registers the preview actions while a board screen is mounted, rereading
 * them as the selection or a preview changes, and drops the preview of a
 * frame the board no longer shows.
 */
export function usePreviewActions(): void {
  useEffect(() => {
    const unregister = registerActions(previewActions())
    const stops = [
      selectionStore.subscribe(refreshActions),
      onPreviewChange(refreshActions),
      followPreview(liveStore),
    ]
    return () => {
      for (const stop of stops) stop()
      unregister()
    }
  }, [])
}
