import { MoveHorizontal } from 'lucide-react'
import { useEffect } from 'react'

import {
  type Action,
  refreshActions,
  registerActions,
} from '@/client/actions/registry'
import { type LiveStore, liveStore } from '@/client/live/store'
import { presetAt, previewWidth } from '@/shared/frame-sizes'

import { boxOf } from '../changes/follow'
import { PRESETS, rangeLabel } from '../inspector/presets'
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
 * draw the frames at the width without writing anything. Like the inspector's
 * Preview row, a preset reads checked while every width shown sits in its
 * range, and running it keeps a width already in range.
 */
export function previewActions(
  selection: SelectionStore = selectionStore,
  live: LiveStore = liveStore,
): Action[] {
  const selected = () => selection.getState().frames
  const shownWidth = (ref: string) =>
    previewOf(ref)?.width ?? boxOf(live.getState().board, ref)?.width
  return [
    ...PRESETS.map(({ preset, label, icon }) => {
      const named = `Preview at ${label.toLowerCase()} width`
      return {
        id: `preview.${preset}`,
        label: named,
        group: 'preview',
        command: { label: named, icon, hint: () => rangeLabel(preset) },
        enabled: () => selected().length > 0,
        checked: () =>
          selected().length > 0 &&
          selected().every((ref) => {
            const width = shownWidth(ref)
            return width !== undefined && presetAt(width) === preset
          }),
        run: () => {
          // A frame the board no longer shows takes the preset's default.
          for (const ref of selected()) {
            setPreview([ref], previewWidth(preset, shownWidth(ref) ?? 0))
          }
        },
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
