import {
  Copy,
  Download,
  Hand,
  Link,
  Maximize,
  MousePointer2,
  PanelLeft,
  Pencil,
  Play,
  Scaling,
  ScanSearch,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useEffect } from 'react'

import {
  type Action,
  type Command,
  refreshActions,
  registerActions,
} from '@/client/actions/registry'
import { toast } from '@/client/components/ui/toast'
import { liveStore } from '@/client/live/store'
import { frameTheme, shownTheme, themeStore } from '@/client/theme/store'
import type { FrameRecord } from '@/shared/records/list'
import type { Theme } from '@/shared/theme'

import {
  clipboardBackend,
  copyFrameImage,
  copyFramesToClipboard,
  copyStitchedImage,
  readClipboardBackend,
} from './copy-image'
import { focusOnBoard } from './element/actions'
import { stepFrom, stepOrder } from './frame-order'
import { withDrawn, withPending, writeBoxes } from './geometry/write'
import {
  exportFileNames,
  exportFrame,
  exportStore,
} from './inspector/export-store'
import { boxesSizedTo, FRAME_TOOL_GROUPS } from './inspector/presets'
import { reportRefusal } from './left-panel/page-actions'
import { type ModeState, modeStore } from './mode'
import { notesUi } from './notes/tool'
import { select, selectionStore } from './selection'
import { canvasView, reportHandMove } from './view'

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

const STEPS = [
  { name: 'next', label: 'Next frame', key: 'Tab', by: 1 },
  { name: 'previous', label: 'Previous frame', key: 'Shift+Tab', by: -1 },
] as const

/**
 * Registers the board's own tools, modes, Hide UI, zoom, and pan while a
 * board screen is mounted, and rereads their state whenever the mode store,
 * the selection, or the mounted canvas changes.
 */
export function useBoardActions(): void {
  useEffect(() => {
    // Asked ahead, since a several-frame copy picks its path inside the key press.
    void readClipboardBackend()
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

/**
 * The frame a step of `by` lands on from the one selected frame, in Layers
 * order on its page, undefined with no frame, several, or an element
 * selected, or no other frame to step to.
 */
function steppedFrame(by: 1 | -1): FrameRecord | undefined {
  const { page, frames, element } = selectionStore.getState()
  const [ref] = frames
  if (frames.length !== 1 || !ref || element) return undefined
  const shown = liveStore
    .getState()
    .board?.projects.flatMap((project) => project.pages)
    .find((candidate) => candidate.ref === page)
  const next = shown
    ? stepFrom(stepOrder(shown.frames, shown.sections), ref, by)
    : undefined
  // A page of one frame steps onto itself, so Tab keeps moving focus there.
  return next?.ref === ref ? undefined : next
}

function boardActions(): Action[] {
  const read = () => modeStore.getState()
  const set = (patch: Partial<ModeState>) => modeStore.setState(patch)
  const zoom = (
    action: Pick<Action, 'id' | 'label' | 'keys' | 'run'> & {
      command: Command
    },
  ): Action => ({
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
      command: { label: 'Use the move tool', icon: MousePointer2 },
      keys: ['v'],
      // Picking a tool returns to Edit, since a tool only works there.
      run: () => set({ tool: 'move', mode: 'edit' }),
      checked: () => read().mode === 'edit' && read().tool === 'move',
    },
    {
      id: 'tool.hand',
      label: 'Hand',
      group: 'tool',
      command: { label: 'Use the hand tool', icon: Hand, keywords: ['pan'] },
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
      id: 'mode.toggle',
      label: 'Edit or Play',
      group: 'mode',
      // Switch to Edit and Switch to Play are its rows, so one key never belongs to two.
      palette: false,
      keys: ['p'],
      run: () => set({ mode: read().mode === 'play' ? 'edit' : 'play' }),
    },
    {
      id: 'mode.exitPlay',
      label: 'Exit Play',
      group: 'mode',
      // Switch to Edit is the row for the same move.
      palette: false,
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
      palette: false,
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
    // Tab walks an element's siblings while one is selected, and moves focus
    // off the board, so a step takes it only for one frame with focus on it.
    ...STEPS.map(({ name, label, key, by }): Action => ({
      id: `frame.${name}`,
      label,
      group: 'view',
      // Focus sits in the palette while it is open, so a step could never run there.
      palette: false,
      keys: [key],
      enabled: () =>
        onCanvas((count) => count === 1)() &&
        focusOnBoard() &&
        steppedFrame(by) !== undefined,
      run: () => {
        const next = steppedFrame(by)
        if (!next) return
        select(selectionStore, `${next.project}/${next.page}`, [next.ref])
        // A preview draws the frame wider than its stored box, so center what draws.
        const [drawn] = withDrawn([next])
        reportHandMove()
        canvasView.centerOn((drawn ?? next).box)
      },
    })),
    ...PANS.flatMap(({ name, key, dx, dy }): Action[] => [
      {
        id: `view.pan.${name}`,
        label: `Pan ${name}`,
        group: 'view',
        palette: false,
        keys: [key],
        // An arrow nudges the selection instead, so it pans with nothing selected.
        enabled: onCanvas((count) => count === 0),
        run: () => canvasView.panBy(dx * PAN_STEP, dy * PAN_STEP),
      },
      {
        id: `view.pan.${name}Far`,
        label: `Pan ${name} further`,
        group: 'view',
        palette: false,
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
    {
      id: 'frame.copyRef',
      label: 'Copy frame ref',
      group: 'frame',
      command: {
        label: 'Copy frame ref',
        icon: Link,
        hint: () => {
          const { frames } = selectionStore.getState()
          return frames.length === 1
            ? (frames[0] ?? '')
            : `${frames.length} frames`
        },
        keywords: ['path', 'reference', 'agent'],
      },
      enabled: onCanvas((count) => count > 0),
      run: () => {
        const refs = selectionStore.getState().frames
        // The ref is what an agent names a frame by, one to a line.
        navigator.clipboard.writeText(refs.join('\n')).then(
          () =>
            toast.add({
              title:
                refs.length === 1
                  ? 'Copied the frame ref'
                  : `Copied ${refs.length} frame refs`,
              description: refs.join(', '),
              type: 'success',
            }),
          reportRefusal("Couldn't copy the frame ref"),
        )
      },
    },
    {
      id: 'frame.exportPng',
      label: 'Export as PNG',
      group: 'frame',
      command: {
        label: 'Export as PNG',
        icon: Download,
        hint: () => {
          const { scale, theme } = exportStore.getState()
          return `${scale}x · ${theme === 'both' ? 'both themes' : `${theme} theme`}`
        },
        keywords: ['download', 'image', 'save'],
      },
      // The inspector's Export section exports one frame, at the settings it last picked.
      enabled: onCanvas((count) => count === 1),
      run: () => {
        const [frame] = selectedFrames()
        if (!frame) return
        const settings = exportStore.getState()
        // The palette has closed, so the render the download waits on toasts.
        toast.promise(exportFrame(frame, settings), {
          loading: { title: `Exporting ${frame.name}`, type: 'loading' },
          success: {
            title: `Exported ${frame.name}`,
            description: exportFileNames(frame.name, settings).join(' and '),
            type: 'success',
          },
          error: (error: unknown) => ({
            title: `Couldn't export ${frame.name}`,
            description: error instanceof Error ? error.message : String(error),
            type: 'error',
          }),
        })
      },
    },
    // One row per size the Frame tool places, found by a query alone, since
    // every size at once would bury what an empty palette opens on.
    ...FRAME_TOOL_GROUPS.flatMap(({ rows }) => rows).map((row): Action => ({
      id: `frame.resizeTo.${row.name}`,
      label: `Resize to ${row.label}`,
      group: 'frame',
      command: {
        label: `Resize to ${row.label}`,
        icon: Scaling,
        hint: () => `${row.width} × ${row.height}`,
        keywords: ['size', 'device'],
        searchOnly: true,
      },
      enabled: () =>
        onCanvas((count) => count > 0)() &&
        liveStore.getState().canWrite &&
        selectedFrames().every((frame) => !frame.locked),
      run: () => {
        const { page } = selectionStore.getState()
        if (!page) return
        const { boxes, expected } = boxesSizedTo(selectedFrames(), row.name)
        void writeBoxes(page, boxes, expected)
      },
    })),
    zoom({
      id: 'view.zoom50',
      label: 'Zoom to 50%',
      command: { label: 'Zoom to 50%', icon: ZoomOut },
      run: () => canvasView.zoomTo(0.5),
    }),
    zoom({
      id: 'view.zoom100',
      label: 'Zoom to 100%',
      command: {
        label: 'Zoom to 100%',
        icon: ScanSearch,
        keywords: ['actual size'],
      },
      keys: ['Shift+Digit0'],
      run: () => canvasView.zoomTo(1),
    }),
    zoom({
      id: 'view.zoom200',
      label: 'Zoom to 200%',
      command: { label: 'Zoom to 200%', icon: ZoomIn },
      run: () => canvasView.zoomTo(2),
    }),
  ]
}

/**
 * Copies several frames, each in the theme it shows: as files on the OS
 * clipboard where the server holds a backend and this tab may write, so one
 * paste lands each, and otherwise as one image laid out as on the canvas. A
 * view-only tab stitches, since the route takes the board key and the PNG
 * route does not. Only a frame flipped from the board's theme names its own,
 * so an unflipped selection posts the body it always did.
 */
function copyFrames(frames: readonly FrameRecord[]): void {
  const theme = shownTheme(themeStore.getState())
  const flips: Record<string, Theme> = {}
  for (const frame of frames) {
    const own = frameTheme(frame.ref)
    if (own !== theme) flips[frame.ref] = own
  }
  const count = frames.length
  if (clipboardBackend() !== null && liveStore.getState().canWrite) {
    const mixed = Object.keys(flips).length > 0
    toast.promise(
      copyFramesToClipboard(
        frames.map((frame) => frame.ref),
        theme,
        flips,
      ),
      {
        loading: { title: `Copying ${count} frames`, type: 'loading' },
        success: {
          title: `Copied ${count} frames`,
          description: mixed
            ? `${count} PNG files on the clipboard, each in the theme it shows.`
            : `${count} PNG files on the clipboard, in the ${theme} theme.`,
          type: 'success',
        },
        error: copyRefusal,
      },
    )
    return
  }
  const canvas = document.querySelector('[data-canvas]')
  const background = canvas ? getComputedStyle(canvas).backgroundColor : 'white'
  const stitched = frames.map((frame) => ({
    ref: frame.ref,
    box: frame.box,
    theme: flips[frame.ref],
  }))
  toast.promise(copyStitchedImage(stitched, theme, background), {
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
