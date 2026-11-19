import { type ReactElement, useRef } from 'react'

import { type Action, useActions } from '@/client/actions/registry'
import { useKeyboardOpen } from '@/client/components/menu-keyboard'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/client/components/ui/context-menu'
import { liveStore, useLive } from '@/client/live/store'
import { FRAME_GAP } from '@/shared/frame-sizes'
import { drawnExtent } from '@/shared/frame-widths'
import type { FrameRecord, SectionRecord } from '@/shared/records/list'

import { reservedOn } from '../claims/reservations'
import type { Box, Point } from '../geometry/box'
import { modeStore } from '../mode'
import { startSectionRename } from '../sections/actions'
import {
  type ElementKey,
  select,
  selectElement,
  selectionStore,
  selectSection,
  useSelection,
} from '../selection'
import { startFrameRename } from '../structure/actions'
import { menuPlace } from './actions'
import { ElementItems } from './canvas'
import { DeleteRow, MenuRow, MenuTitle } from './items'

const FRAME_IDS = [
  'view.zoomToSelection',
  'frame.duplicate',
  'frame.hide',
  'frame.lock',
  'frame.delete',
] as const

interface FrameRowMenuProps {
  frame: FrameRecord
  /** The page the frame sits on, which opening the menu selects it on. */
  page: string
  /** The frame's row, which keeps focus when the menu closes. */
  trigger: ReactElement
}

/**
 * A layers frame row's menu, selecting the row's frame first. A hidden frame
 * does not select, so its selection items grey rather than act on another one.
 */
export function FrameRowMenu({ frame, page, trigger }: FrameRowMenuProps) {
  const actions = useActions(FRAME_IDS)
  const held = useSelection(
    (state) =>
      state.page === page && !state.element && state.frames.includes(frame.ref),
  )
  const [zoom, duplicate, hide, lock, remove] = held
    ? actions
    : actions.map(() => undefined)
  const canWrite = useLive((state) => state.canWrite)
  const content = useRef<HTMLDivElement>(null)
  const keyboard = useKeyboardOpen(content)
  const rename: Action = {
    id: 'layers.rename',
    label: 'Rename',
    group: 'frame',
    palette: false,
    enabled: () => canWrite && modeStore.getState().mode === 'edit',
    run: () => startFrameRename(frame.ref, 'layers'),
  }
  return (
    <ContextMenu
      onOpenChange={(opened) => {
        if (!opened || frame.hidden || modeStore.getState().mode !== 'edit') {
          return
        }
        const { page: current, frames, element } = selectionStore.getState()
        if (element || current !== page || !frames.includes(frame.ref)) {
          select(selectionStore, page, [frame.ref])
        }
      }}
      onOpenChangeComplete={keyboard.onOpenChangeComplete}
    >
      <ContextMenuTrigger render={trigger} onKeyDown={keyboard.onKeyDown} />
      <ContextMenuContent ref={content} className="w-55">
        <ContextMenuGroup>
          <MenuTitle>Frame in layers</MenuTitle>
          <MenuRow action={zoom}>Zoom to frame</MenuRow>
          <MenuRow action={rename} />
          <MenuRow action={duplicate}>Duplicate</MenuRow>
          <MenuRow action={hide}>Hide</MenuRow>
          <MenuRow action={lock}>
            {lock?.checked?.() ? 'Unlock' : 'Lock'}
          </MenuRow>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <DeleteRow action={remove} />
      </ContextMenuContent>
    </ContextMenu>
  )
}

const SECTION_IDS = ['section.delete'] as const

interface SectionRowMenuProps {
  section: SectionRecord
  /** The page the section sits on, which opening the menu selects it on. */
  page: string
  /** The section's row, which keeps focus when the menu closes. */
  trigger: ReactElement
}

/**
 * The Section menu on a layers section row, opening on the row's section
 * selected. Rename opens the row's field, and Delete takes the box and keeps
 * every frame it held.
 */
export function SectionRowMenu({
  section,
  page,
  trigger,
}: SectionRowMenuProps) {
  const [remove] = useActions(SECTION_IDS)
  const canWrite = useLive((state) => state.canWrite)
  const content = useRef<HTMLDivElement>(null)
  const keyboard = useKeyboardOpen(content)
  const rename: Action = {
    id: 'layers.renameSection',
    label: 'Rename',
    group: 'section',
    palette: false,
    enabled: () => canWrite && modeStore.getState().mode === 'edit',
    run: () => startSectionRename(section.name),
  }
  return (
    <ContextMenu
      onOpenChange={(opened) => {
        if (opened && modeStore.getState().mode === 'edit') {
          selectSection(selectionStore, page, section.name)
        }
      }}
      onOpenChangeComplete={keyboard.onOpenChangeComplete}
    >
      <ContextMenuTrigger render={trigger} onKeyDown={keyboard.onKeyDown} />
      <ContextMenuContent ref={content} className="w-55">
        <ContextMenuGroup>
          <MenuTitle>Section</MenuTitle>
          <MenuRow action={rename} />
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <DeleteRow action={remove} />
      </ContextMenuContent>
    </ContextMenu>
  )
}

interface ElementRowMenuProps {
  /** The page the element's frame sits on. */
  page: string
  /** The row's element, which opening the menu selects. */
  element: ElementKey
  trigger: ReactElement
}

/**
 * The Element menu on a layers element row, opening on the row's element
 * selected. It lists the canvas element menu's items but Add a note here,
 * which needs a point on the canvas a row has none of.
 */
export function ElementRowMenu({
  page,
  element,
  trigger,
}: ElementRowMenuProps) {
  const content = useRef<HTMLDivElement>(null)
  const keyboard = useKeyboardOpen(content)
  return (
    <ContextMenu
      onOpenChange={(opened) => {
        if (opened) selectElement(selectionStore, page, element)
      }}
      onOpenChangeComplete={keyboard.onOpenChangeComplete}
    >
      <ContextMenuTrigger render={trigger} onKeyDown={keyboard.onKeyDown} />
      <ContextMenuContent ref={content} className="w-[230px]">
        <ElementItems noteable={false} />
      </ContextMenuContent>
    </ContextMenu>
  )
}

const SPACE_IDS = ['frame.newAt', 'frame.paste'] as const

/**
 * Where a new frame lands from the layers space, which is where the CLI's next
 * row starts, past every frame's drawn extent and the page's reserved boxes, at
 * the top of the topmost one, or the origin on an empty page.
 */
function nextFreeSpot(
  frames: readonly FrameRecord[],
  reserved: readonly Box[],
): Point {
  const boxes = [
    ...frames.map(({ box, widths, device }) =>
      drawnExtent(box, widths, device),
    ),
    ...reserved,
  ]
  if (boxes.length === 0) return { x: 0, y: 0 }
  return {
    x: Math.max(...boxes.map(({ x, width }) => x + width)) + FRAME_GAP,
    y: Math.min(...boxes.map(({ y }) => y)),
  }
}

interface LayersSpaceMenuProps {
  /** The page the list shows, whose reserved boxes the new frame's spot clears. */
  page: string
  /** Every frame on the page, which the new frame's spot is read from. */
  frames: readonly FrameRecord[]
  /** The empty space below the last layer row, which keeps focus when the menu closes. */
  trigger: ReactElement
}

/**
 * The menu of the layers list's empty space, holding New frame at the page's
 * next free spot and Paste. New frame reads the point the canvas menu's does,
 * so opening sets it and closing clears it.
 */
export function LayersSpaceMenu({
  page,
  frames,
  trigger,
}: LayersSpaceMenuProps) {
  const [newAt, paste] = useActions(SPACE_IDS)
  const content = useRef<HTMLDivElement>(null)
  const keyboard = useKeyboardOpen(content)
  return (
    <ContextMenu
      onOpenChange={(opened) => {
        if (!opened) return
        const reserved = reservedOn(liveStore.getState().claims, frames, page)
        menuPlace.setState({
          at: nextFreeSpot(
            frames,
            reserved.map(({ claim }) => claim.box),
          ),
          frame: null,
        })
      }}
      onOpenChangeComplete={(opened) => {
        keyboard.onOpenChangeComplete(opened)
        if (!opened) menuPlace.setState({ at: null, frame: null })
      }}
    >
      <ContextMenuTrigger render={trigger} onKeyDown={keyboard.onKeyDown} />
      <ContextMenuContent ref={content} className="w-55">
        <ContextMenuGroup>
          <MenuTitle>Layers</MenuTitle>
          <MenuRow action={newAt}>New frame</MenuRow>
          <MenuRow action={paste}>Paste</MenuRow>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  )
}
