import { pointer } from 'd3-selection'
import { zoomTransform } from 'd3-zoom'
import { type ReactElement, type RefObject, useState } from 'react'

import { useActions } from '@/client/actions/registry'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/client/components/ui/context-menu'
import type { FrameRecord } from '@/shared/records/list'

import { treeOf } from '../element/tree'
import { up } from '../element/walk'
import { selectedElementBox } from '../geometry/hit'
import { select, selectionStore, useSelection } from '../selection'
import { menuPlace } from './actions'
import { DeleteRow, MenuRow, MenuTitle } from './items'
import { type MenuTarget, menuTarget } from './target'

interface CanvasMenuProps {
  /** The page the canvas shows. */
  page: string
  /** Its shown frames, bottom to top. */
  frames: () => readonly FrameRecord[]
  /** The element `d3-zoom` holds, whose transform maps the screen to the board. */
  viewport: RefObject<HTMLElement | null>
  /** The zoomed layer, which draws the selected element's outline. */
  layer: RefObject<HTMLElement | null>
  /** The hit layer the menu opens on. */
  trigger: ReactElement
}

const WIDTH: Record<MenuTarget['kind'], string> = {
  frame: 'w-55',
  element: 'w-[230px]',
  canvas: 'w-[210px]',
}

/**
 * The right-click menu over the hit layer, its body following what the
 * click landed on: a frame, the selected element, or empty canvas, per
 * `canon/design/menus/context` and `menus/toast`. A right-click on a frame
 * not yet selected selects it first, and one on the frame around the
 * selected element selects the frame, so every item acts on the selection
 * the way its key does. A `contextmenu` the gestures prevented, being a
 * Ctrl-press on the primary button mid-drag, opens nothing.
 */
export function CanvasMenu({
  page,
  frames,
  viewport,
  layer,
  trigger,
}: CanvasMenuProps) {
  const [target, setTarget] = useState<MenuTarget | null>(null)

  const land = (event: MouseEvent) => {
    const view = viewport.current
    const drawn = layer.current
    if (!view || !drawn) return null
    const transform = zoomTransform(view)
    const [x, y] = transform.invert(pointer(event, view))
    const { element } = selectionStore.getState()
    const box = element ? selectedElementBox(drawn) : null
    return menuTarget(
      frames(),
      { x, y },
      transform.k,
      element && box ? { frame: element.frame, box } : null,
    )
  }

  return (
    <ContextMenu
      onOpenChangeComplete={(opened) => {
        if (!opened) menuPlace.setState({ at: null, frame: null })
      }}
    >
      <ContextMenuTrigger
        render={trigger}
        onContextMenu={(event) => {
          const landed = event.nativeEvent.defaultPrevented
            ? null
            : land(event.nativeEvent)
          if (!landed) {
            event.preventBaseUIHandler()
            return
          }
          if (landed.kind === 'frame') {
            const { frames: chosen, element } = selectionStore.getState()
            if (element || !chosen.includes(landed.frame.ref)) {
              select(selectionStore, page, [landed.frame.ref])
            }
          }
          menuPlace.setState({
            at: landed.at,
            frame: landed.kind === 'canvas' ? null : landed.frame.ref,
          })
          setTarget(landed)
        }}
      />
      <ContextMenuContent className={target ? WIDTH[target.kind] : undefined}>
        {target?.kind === 'frame' ? <FrameItems /> : null}
        {target?.kind === 'element' ? <ElementItems /> : null}
        {target?.kind === 'canvas' ? <CanvasItems /> : null}
      </ContextMenuContent>
    </ContextMenu>
  )
}

const FRAME_IDS = [
  'frame.copyPng',
  'frame.duplicate',
  'frame.rename',
  'frame.hide',
  'frame.lock',
  'frame.flipTheme',
  'frame.delete',
] as const

function FrameItems() {
  const [copyPng, duplicate, rename, hide, lock, flip, remove] =
    useActions(FRAME_IDS)
  return (
    <>
      <ContextMenuGroup>
        <MenuRow action={copyPng}>Copy as PNG</MenuRow>
        <MenuRow action={duplicate}>Duplicate</MenuRow>
        <MenuRow action={rename}>Rename</MenuRow>
      </ContextMenuGroup>
      <ContextMenuSeparator />
      <ContextMenuGroup>
        <MenuRow action={hide}>Hide</MenuRow>
        <MenuRow action={lock}>{lock?.checked?.() ? 'Unlock' : 'Lock'}</MenuRow>
        <MenuRow action={flip} />
      </ContextMenuGroup>
      <ContextMenuSeparator />
      <DeleteRow action={remove} />
    </>
  )
}

const ELEMENT_IDS = [
  'note.addHere',
  'tool.note',
  'element.up',
  'view.zoomToSelection',
  'frame.copyPng',
] as const

function ElementItems() {
  const [note, noteTool, parent, zoom, copyPng] = useActions(ELEMENT_IDS)
  const element = useSelection((state) => state.element ?? null)
  const tree = element ? treeOf(element.frame) : null
  // Esc from an element sitting directly in `body` selects the frame itself.
  const atTop =
    element && tree ? up(tree.elements, element.index) === null : true
  return (
    <ContextMenuGroup>
      <MenuTitle>Element</MenuTitle>
      <MenuRow action={note} binding={noteTool?.keys?.[0]}>
        Add a note here
      </MenuRow>
      <MenuRow action={parent}>
        {atTop ? 'Select frame' : 'Select parent'}
      </MenuRow>
      <MenuRow action={zoom}>Zoom to selection</MenuRow>
      <ContextMenuSeparator />
      <MenuRow action={copyPng}>Copy frame as PNG</MenuRow>
    </ContextMenuGroup>
  )
}

const CANVAS_IDS = [
  'frame.pasteAt',
  'frame.paste',
  'frame.newAt',
  'tool.frame',
  'selection.all',
  'view.zoomToFit',
  'view.hideUi',
] as const

function CanvasItems() {
  const [pasteAt, paste, newAt, frameTool, all, fit, hideUi] =
    useActions(CANVAS_IDS)
  return (
    <ContextMenuGroup>
      <MenuTitle>Empty canvas</MenuTitle>
      <MenuRow action={pasteAt} binding={paste?.keys?.[0]}>
        Paste here
      </MenuRow>
      <MenuRow action={newAt} binding={frameTool?.keys?.[0]}>
        New frame here
      </MenuRow>
      <ContextMenuSeparator />
      <MenuRow action={all}>Select all</MenuRow>
      <MenuRow action={fit}>Zoom to fit</MenuRow>
      <MenuRow action={hideUi}>Hide UI</MenuRow>
    </ContextMenuGroup>
  )
}
