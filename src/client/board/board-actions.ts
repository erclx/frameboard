import { useEffect } from 'react'

import {
  type Action,
  refreshActions,
  registerActions,
} from '@/client/actions/registry'

import { type ModeState, modeStore } from './mode'
import { canvasView } from './view'

/** How far one zoom in or out step scales the view. */
const ZOOM_STEP = 2

/**
 * Registers the board's own tools, modes, Hide UI, and zoom while a board
 * screen is mounted, and rereads their state whenever the mode store or the
 * mounted canvas changes.
 */
export function useBoardActions(): void {
  useEffect(() => {
    const unregister = registerActions(boardActions())
    const unsubscribeMode = modeStore.subscribe(refreshActions)
    const unsubscribeCanvas = canvasView.onAttach(refreshActions)
    return () => {
      unsubscribeCanvas()
      unsubscribeMode()
      unregister()
    }
  }, [])
}

function boardActions(): Action[] {
  const read = () => modeStore.getState()
  const set = (patch: Partial<ModeState>) => modeStore.setState(patch)
  const zoom = (action: Omit<Action, 'group' | 'enabled'>): Action => ({
    ...action,
    group: 'view',
    enabled: canvasView.attached,
  })
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
