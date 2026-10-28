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
import { useLive } from '@/client/live/store'
import type { FrameRecord, SectionRecord } from '@/shared/records/list'

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
 * The Frame in layers menu of `canon/design/menus/context` on a layers frame
 * row. Opening it selects the row's frame alone, unless it is already among
 * the frames selected, so every item acts on what the row shows selected.
 * Rename opens the row's own field rather than the inspector's, since the
 * developer is at the row. A hidden frame does not select, as its row click
 * does not, so the items acting on the selection grey whenever the row's
 * frame is not among the frames selected, never acting on another one.
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
