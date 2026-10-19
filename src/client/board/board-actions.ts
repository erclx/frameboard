import { useEffect } from 'react'

import {
  type Action,
  refreshActions,
  registerActions,
} from '@/client/actions/registry'
import { liveStore } from '@/client/live/store'
import { frameTheme } from '@/client/theme/store'
import type { FrameRecord } from '@/shared/records/list'

import { copyFrameImage } from './copy-image'
import { withPending } from './geometry/write'
import { type ModeState, modeStore } from './mode'
import { selectionStore } from './selection'
import { canvasView } from './view'

/** How far one zoom in or out step scales the view. */
const ZOOM_STEP = 2

/** How far, in screen pixels, an arrow pans the view with nothing selected, and with Shift. */
const PAN_STEP = 40
const PAN_STEP_FAR = 200

const PANS = [
  { name: 'left', key: 'ArrowLeft', dx: -1, dy: 0 },
  { name: 'right', key: 'ArrowRight', dx: 1, dy: 0 },
  { name: 'up', key: 'ArrowUp', dx: 0, dy: -1 },
  { name: 'down', key: 'ArrowDown', dx: 0, dy: 1 },
] as const

/**
 * Registers the board's own tools, modes, Hide UI, zoom, and pan while a
 * board screen is mounted, and rereads their state whenever the mode store,
 * the selection, or the mounted canvas changes.
 */
export function useBoardActions(): void {
  useEffect(() => {
    const unregister = registerActions(boardActions())
    const unsubscribeMode = modeStore.subscribe(refreshActions)
    const unsubscribeSelection = selectionStore.subscribe(refreshActions)
    const unsubscribeCanvas = canvasView.onAttach(refreshActions)
    return () => {
      unsubscribeCanvas()
      unsubscribeSelection()
      unsubscribeMode()
      unregister()
    }
  }, [])
}

/** The selected frames as drawn, read from the board the server last sent. */
function selectedFrames(): FrameRecord[] {
  const { page, frames } = selectionStore.getState()
  const shown = liveStore
    .getState()
    .board?.projects.flatMap((project) => project.pages)
    .find((candidate) => candidate.ref === page)
    ?.frames.filter((frame) => frames.includes(frame.ref))
  return withPending(shown ?? [])
}

function boardActions(): Action[] {
  const read = () => modeStore.getState()
  const set = (patch: Partial<ModeState>) => modeStore.setState(patch)
  const zoom = (action: Omit<Action, 'group' | 'enabled'>): Action => ({
    ...action,
    group: 'view',
    enabled: canvasView.attached,
  })
  const onCanvas = (selected: (count: number) => boolean) => () =>
    canvasView.attached() &&
    read().mode === 'edit' &&
    selected(selectionStore.getState().frames.length)
  return [
    {
      id: 'tool.move',
      label: 'Move',
      group: 'tool',
      keys: ['v'],
      // Picking a tool returns to Edit, since a tool only works there.
      run: () => set({ tool: 'move', mode: 'edit' }),
      checked: () => read().mode === 'edit' && read().tool === 'move',
    },
    {
      id: 'tool.hand',
      label: 'Hand',
      group: 'tool',
      keys: ['h'],
      run: () => set({ tool: 'hand', mode: 'edit' }),
      checked: () => read().mode === 'edit' && read().tool === 'hand',
    },
    {
      id: 'mode.edit',
      label: 'Edit',
      group: 'mode',
      run: () => set({ mode: 'edit' }),
      checked: () => read().mode === 'edit',
    },
    {
      id: 'mode.play',
      label: 'Play',
      group: 'mode',
      run: () => set({ mode: 'play' }),
      checked: () => read().mode === 'play',
    },
    {
      id: 'mode.exitPlay',
      label: 'Exit Play',
      group: 'mode',
      keys: ['Escape'],
      enabled: () => read().mode === 'play',
      run: () => {
        // A click in Play leaves focus inside the frame, where the board's keys never arrive.
        if (document.activeElement instanceof HTMLIFrameElement) {
          document.activeElement.blur()
        }
        set({ mode: 'edit' })
      },
    },
    {
      id: 'view.hideUi',
      label: 'Hide UI',
      group: 'view',
      keys: ['$mod+Backslash'],
      run: () => set({ hideUi: !read().hideUi }),
      checked: () => read().hideUi,
    },
    zoom({
      id: 'view.zoomIn',
      label: 'Zoom in',
      keys: ['$mod+Equal'],
      run: () => canvasView.zoomBy(ZOOM_STEP),
    }),
    zoom({
      id: 'view.zoomOut',
      label: 'Zoom out',
      keys: ['$mod+Minus'],
      run: () => canvasView.zoomBy(1 / ZOOM_STEP),
    }),
    zoom({
      id: 'view.zoomToFit',
      label: 'Zoom to fit',
      keys: ['Shift+Digit1'],
      run: canvasView.fit,
    }),
    {
      id: 'view.zoomToSelection',
      label: 'Zoom to selection',
      group: 'view',
      keys: ['Shift+Digit2'],
      enabled: onCanvas((count) => count > 0),
      run: () => canvasView.fitTo(selectedFrames().map((frame) => frame.box)),
    },
    ...PANS.flatMap(({ name, key, dx, dy }) => [
      {
        id: `view.pan.${name}`,
        label: `Pan ${name}`,
        group: 'view',
        keys: [key],
        // An arrow nudges the selection instead, so it pans with nothing selected.
        enabled: onCanvas((count) => count === 0),
        run: () => canvasView.panBy(dx * PAN_STEP, dy * PAN_STEP),
      },
      {
        id: `view.pan.${name}Far`,
        label: `Pan ${name} further`,
        group: 'view',
        keys: [`Shift+${key}`],
        enabled: onCanvas((count) => count === 0),
        run: () => canvasView.panBy(dx * PAN_STEP_FAR, dy * PAN_STEP_FAR),
      },
    ]),
    {
      id: 'frame.copyPng',
      label: 'Copy as PNG',
      group: 'frame',
      keys: ['$mod+Shift+KeyC'],
      enabled: onCanvas((count) => count === 1),
      run: () => {
        const [frame] = selectedFrames()
        if (!frame) return
        // The board says nothing on either outcome until the kit has a toast.
        copyFrameImage(frame.ref, frameTheme(frame.ref)).catch(() => {})
      },
    },
    zoom({
      id: 'view.zoom50',
      label: 'Zoom to 50%',
      run: () => canvasView.zoomTo(0.5),
    }),
    zoom({
      id: 'view.zoom100',
      label: 'Zoom to 100%',
      run: () => canvasView.zoomTo(1),
    }),
    zoom({
      id: 'view.zoom200',
      label: 'Zoom to 200%',
      run: () => canvasView.zoomTo(2),
    }),
  ]
}
