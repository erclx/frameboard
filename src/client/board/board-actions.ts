import {
  Copy,
  Maximize,
  PanelLeft,
  Pencil,
  Play,
  ScanSearch,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useEffect } from 'react'

import {
  type Action,
  refreshActions,
  registerActions,
} from '@/client/actions/registry'
import { toast } from '@/client/components/ui/toast'
import { liveStore } from '@/client/live/store'
import { frameTheme, shownTheme, themeStore } from '@/client/theme/store'
import type { FrameRecord } from '@/shared/records/list'

import {
  clipboardBackend,
  copyFrameImage,
  copyFramesToClipboard,
  copyStitchedImage,
} from './copy-image'
import { withPending } from './geometry/write'
import { reportRefusal } from './left-panel/page-actions'
import { type ModeState, modeStore } from './mode'
import { notesUi } from './notes/tool'
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
    // Asked ahead, since a several-frame copy picks its path inside the key press.
    clipboardBackend()
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
      command: { label: 'Switch to Edit', icon: Pencil },
      run: () => set({ mode: 'edit' }),
      checked: () => read().mode === 'edit',
    },
    {
      id: 'mode.play',
      label: 'Play',
      group: 'mode',
      command: { label: 'Switch to Play', icon: Play },
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
      id: 'tool.disarm',
      label: 'Back to Move',
      group: 'tool',
      keys: ['Escape'],
      // The selection's Esc keys stand aside while a tool is armed, so the
      // selection stays, and an open note card takes the press to close.
      enabled: () =>
        read().mode === 'edit' &&
        read().tool !== 'move' &&
        notesUi.getState().open === null,
      run: () => {
        // The button that armed the tool keeps its ring once Move takes over.
        const focused = document.activeElement
        if (
          focused instanceof HTMLElement &&
          focused.closest('[role="toolbar"]')
        ) {
          focused.blur()
        }
        set({ tool: 'move' })
      },
    },
    {
      id: 'view.hideUi',
      label: 'Hide UI',
      group: 'view',
      command: { label: 'Hide UI', icon: PanelLeft },
      keys: ['$mod+Backslash'],
      run: () => set({ hideUi: !read().hideUi }),
      checked: () => read().hideUi,
    },
    zoom({
      id: 'view.zoomIn',
      label: 'Zoom in',
      command: { label: 'Zoom in', icon: ZoomIn },
      keys: ['$mod+Equal'],
      run: () => canvasView.zoomBy(ZOOM_STEP),
    }),
    zoom({
      id: 'view.zoomOut',
      label: 'Zoom out',
      command: { label: 'Zoom out', icon: ZoomOut },
      keys: ['$mod+Minus'],
      run: () => canvasView.zoomBy(1 / ZOOM_STEP),
    }),
    zoom({
      id: 'view.zoomToFit',
      label: 'Zoom to fit',
      command: { label: 'Zoom to fit', icon: Maximize },
      keys: ['Shift+Digit1'],
      run: canvasView.fit,
    }),
    {
      id: 'view.zoomToSelection',
      label: 'Zoom to selection',
      group: 'view',
      command: { label: 'Zoom to selection', icon: ScanSearch },
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
      command: { label: 'Copy as PNG', icon: Copy },
      keys: ['$mod+Shift+KeyC'],
      enabled: onCanvas((count) => count > 0),
      run: () => {
        const frames = selectedFrames()
        const [frame] = frames
        if (!frame) return
        if (frames.length > 1) {
          copyFrames(frames)
          return
        }
        const theme = frameTheme(frame.ref)
        // Nothing on the canvas shows a copy, so its outcome toasts.
        copyFrameImage(frame.ref, theme).then(
          () =>
            toast.add({
              title: `Copied ${frame.name}`,
              description: `PNG on the clipboard, in the ${theme} theme.`,
              type: 'success',
            }),
          reportRefusal(`Couldn't copy ${frame.name}`),
        )
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
      keys: ['Shift+Digit0'],
      run: () => canvasView.zoomTo(1),
    }),
    zoom({
      id: 'view.zoom200',
      label: 'Zoom to 200%',
      run: () => canvasView.zoomTo(2),
    }),
  ]
}

/**
 * Copies several frames in the board's theme: as files on the OS clipboard
 * where the server holds a backend, so one paste lands each, and otherwise
 * as one image laid out as on the canvas.
 */
function copyFrames(frames: readonly FrameRecord[]): void {
  const theme = shownTheme(themeStore.getState())
  const count = frames.length
  if (clipboardBackend() !== null) {
    toast.promise(
      copyFramesToClipboard(
        frames.map((frame) => frame.ref),
        theme,
      ),
      {
        loading: { title: `Copying ${count} frames`, type: 'loading' },
        success: {
          title: `Copied ${count} frames`,
          description: `${count} PNG files on the clipboard, in the ${theme} theme.`,
          type: 'success',
        },
        error: copyRefusal,
      },
    )
    return
  }
  const canvas = document.querySelector('[data-canvas]')
  const background = canvas ? getComputedStyle(canvas).backgroundColor : 'white'
  toast.promise(copyStitchedImage(frames, theme, background), {
    loading: { title: `Copying ${count} frames`, type: 'loading' },
    success: {
      title: `Copied ${count} frames as one image`,
      description:
        'This system takes one image, so the frames are laid out as on the canvas.',
      type: 'success',
    },
    error: copyRefusal,
  })
}

function copyRefusal(error: unknown) {
  return {
    title: "Couldn't copy the frames",
    description: error instanceof Error ? error.message : String(error),
    type: 'error',
  }
}
