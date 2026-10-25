import { SunMoon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { createStore, type StoreApi } from 'zustand/vanilla'

import {
  type Action,
  refreshActions,
  registerActions,
} from '@/client/actions/registry'
import { type LiveStore, liveStore } from '@/client/live/store'
import { type Structure, structure } from '@/client/live/structure'
import {
  flipFrame,
  frameTheme,
  type ThemeStore,
  themeStore,
} from '@/client/theme/store'
import type { FrameRecord } from '@/shared/records/list'
import { oppositeTheme } from '@/shared/theme'

import type { Point } from '../geometry/box'
import { reportRefusal } from '../left-panel/page-actions'
import { type ModeStore, modeStore } from '../mode'
import { notesUi } from '../notes/tool'
import { select, type SelectionStore, selectionStore } from '../selection'
import { type ClipboardStore, clipboardStore } from '../structure/actions'
import { placeFrame, type PresetStore, presetStore } from '../structure/tool'

/** Where the open canvas menu was opened: the board point and the frame under it, null while none is open. */
export interface MenuPlace {
  at: Point | null
  frame: string | null
}

export type MenuPlaceStore = StoreApi<MenuPlace>

export function createMenuPlace(): MenuPlaceStore {
  return createStore<MenuPlace>()(() => ({ at: null, frame: null }))
}

/** The one place the canvas menu writes on opening and its actions read. */
export const menuPlace = createMenuPlace()

export interface MenuContext {
  /** The page the canvas shows. */
  page: () => string
  /** Every frame on it, hidden ones included, since they hold names too. */
  frames: () => readonly FrameRecord[]
  /** The `modifiedAt` of the file a frame's iframe last showed, null before its first load. */
  renderedAt: (ref: string) => string | null
  place: MenuPlaceStore
  selection: SelectionStore
  mode: ModeStore
  live: LiveStore
  clipboard: ClipboardStore
  theme: ThemeStore
  preset: PresetStore
  notes: typeof notesUi
  calls: Structure
}

/**
 * The actions only a menu needs. `frame.flipTheme` flips the selected frames
 * to the opposite of the one right-clicked, or of the first selected from
 * the palette, labelling itself with the theme it flips to.
 * `frame.pasteAt`, `frame.newAt`, and `note.addHere` act at the board point
 * the menu opened at, so they stay disabled with no menu open. Each acts in
 * Edit alone, and each writing one while the tab may write.
 */
export function menuActions(context: MenuContext): Action[] {
  const { place, selection, mode, live, clipboard, theme, notes, calls } =
    context
  const editing = () => mode.getState().mode === 'edit'
  const writable = () => editing() && live.getState().canWrite
  const selected = () => {
    const { page, frames } = selection.getState()
    return page === context.page() ? frames : []
  }
  /** The frame whose theme the flip reads, being the right-clicked one when it is selected. */
  const flipFrom = () => {
    const refs = selected()
    const clicked = place.getState().frame
    return clicked && refs.includes(clicked) ? clicked : refs[0]
  }
  const flipTo = () => {
    const from = flipFrom()
    return from ? oppositeTheme(frameTheme(from, theme)) : null
  }

  return [
    {
      id: 'frame.flipTheme',
      get label() {
        const to = flipTo()
        return to ? `Flip to ${to}` : 'Flip frame theme'
      },
      group: 'frame',
      command: { label: 'Flip frame theme', icon: SunMoon },
      enabled: () => editing() && selected().length > 0,
      run: () => {
        const to = flipTo()
        if (!to) return
        for (const ref of selected()) {
          if (frameTheme(ref, theme) !== to) flipFrame(ref, theme)
        }
      },
    },
    {
      id: 'frame.pasteAt',
      label: 'Paste here',
      group: 'frame',
      enabled: () =>
        writable() &&
        clipboard.getState().held > 0 &&
        place.getState().at !== null,
      run: () => {
        const { at } = place.getState()
        if (!at) return
        const page = context.page()
        calls
          .pasteFrames(page, { x: Math.round(at.x), y: Math.round(at.y) })
          .then(
            (frames) =>
              select(
                selection,
                page,
                frames.map((frame) => frame.ref),
              ),
            reportRefusal("Couldn't paste"),
          )
      },
    },
    {
      id: 'frame.newAt',
      label: 'New frame here',
      group: 'frame',
      enabled: () => writable() && place.getState().at !== null,
      run: () => {
        const { at } = place.getState()
        if (!at) return
        void placeFrame(at, {
          page: context.page(),
          frames: context.frames(),
          preset: context.preset,
          selection,
          mode,
          calls,
        })
      },
    },
    {
      id: 'note.addHere',
      label: 'Add a note here',
      group: 'note',
      enabled: () =>
        writable() &&
        Boolean(selection.getState().element) &&
        selected().length > 0 &&
        place.getState().at !== null,
      run: () => {
        const { at } = place.getState()
        const { element } = selection.getState()
        const frame = context
          .frames()
          .find((candidate) => candidate.ref === element?.frame)
        if (!at || !element || !frame) return
        // A frame that has not finished a load names no file, so its note
        // goes on the frame, as a Note tool click there does.
        const renderedAt = context.renderedAt(frame.ref)
        mode.setState({ tool: 'note' })
        notes.setState({
          open: {
            kind: 'new',
            pick: {
              frame: { ref: frame.ref, name: frame.name },
              element: renderedAt ? element.index : null,
              renderedAt,
              at,
            },
          },
        })
      },
    },
    {
      id: 'note.addOnFrame',
      label: 'Add a note',
      group: 'note',
      enabled: () =>
        writable() &&
        place.getState().at !== null &&
        place.getState().frame !== null,
      run: () => {
        const { at, frame: ref } = place.getState()
        const frame = context
          .frames()
          .find((candidate) => candidate.ref === ref)
        if (!at || !frame) return
        mode.setState({ tool: 'note' })
        notes.setState({
          open: {
            kind: 'new',
            pick: {
              frame: { ref: frame.ref, name: frame.name },
              element: null,
              renderedAt: null,
              at,
            },
          },
        })
      },
    },
  ]
}

/**
 * Registers the menu actions for the page a canvas shows, rereading them as
 * the selection, the mode, the clipboard, the themes, the open menu, or the
 * board change.
 */
export function useMenuActions(
  page: string,
  frames: readonly FrameRecord[],
  renderedAt: (ref: string) => string | null,
): void {
  const pageRef = useRef(page)
  const framesRef = useRef(frames)
  const renderedAtRef = useRef(renderedAt)
  useEffect(() => {
    pageRef.current = page
    framesRef.current = frames
    renderedAtRef.current = renderedAt
  }, [page, frames, renderedAt])
  useEffect(() => {
    const unregister = registerActions(
      menuActions({
        page: () => pageRef.current,
        frames: () => framesRef.current,
        renderedAt: (ref) => renderedAtRef.current(ref),
        place: menuPlace,
        selection: selectionStore,
        mode: modeStore,
        live: liveStore,
        clipboard: clipboardStore,
        theme: themeStore,
        preset: presetStore,
        notes: notesUi,
        calls: structure,
      }),
    )
    const unsubscribe = [
      menuPlace.subscribe(refreshActions),
      themeStore.subscribe(refreshActions),
      selectionStore.subscribe(refreshActions),
      modeStore.subscribe(refreshActions),
      clipboardStore.subscribe(refreshActions),
      liveStore.subscribe(refreshActions),
    ]
    return () => {
      for (const stop of unsubscribe) stop()
      unregister()
    }
  }, [])
}
