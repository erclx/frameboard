import { Ellipsis } from 'lucide-react'
import { type ReactElement, type RefObject, useRef } from 'react'

import type { Action } from '@/client/actions/registry'
import { useKeyboardOpen } from '@/client/components/menu-keyboard'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/client/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'

import { MenuRow } from './items'

/** What each entry of an asset tile's menu does, absent where the tile cannot do it. */
export interface AssetMenuActs {
  copy: () => void
  /** Absent for a file a frame cannot show, or where no canvas is open to land it on. */
  place?: () => void
  showFrames?: () => void
  rename?: () => void
  replace?: () => void
  remove?: () => void
}

interface AssetMenuProps {
  /** The tile's button, which keeps focus when the menu closes. */
  trigger: ReactElement
  acts: AssetMenuActs
  /** How many frames link the file, which Show frames using it counts, absent where the server counts none. */
  frames: number | undefined
  /** Whether the tab writes, since a view-only tab offers Copy path alone. */
  canWrite: boolean
}

/**
 * An Assets tile's right-click menu per `canon/design/tabs/assets-menu`,
 * offering Copy path alone in a tab that cannot write.
 */
export function AssetMenu({ trigger, acts, frames, canWrite }: AssetMenuProps) {
  const content = useRef<HTMLDivElement>(null)
  const keyboard = useKeyboardOpen(content)
  return (
    <ContextMenu onOpenChangeComplete={keyboard.onOpenChangeComplete}>
      <ContextMenuTrigger render={trigger} onKeyDown={keyboard.onKeyDown} />
      <ContextMenuContent ref={content}>
        <AssetItems acts={acts} frames={frames} canWrite={canWrite} />
      </ContextMenuContent>
    </ContextMenu>
  )
}

interface AssetMoreProps {
  /** The file's path, which the button's label names. */
  path: string
  acts: AssetMenuActs
  frames: number | undefined
  /** The tile's own button, which takes focus back when the menu closes. */
  tile: RefObject<HTMLElement | null>
  className?: string
}

/**
 * The ⋯ button a hovered or focused tile shows in its corner, opening the
 * items the right-click menu holds. Only a writing tab draws it.
 */
export function AssetMore({
  path,
  acts,
  frames,
  tile,
  className,
}: AssetMoreProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Actions for ${path}`}
        className={className}
      >
        <Ellipsis aria-hidden className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" finalFocus={tile} className="w-42">
        <AssetItems acts={acts} frames={frames} canWrite />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AssetItems({
  acts,
  frames,
  canWrite,
}: {
  acts: AssetMenuActs
  frames: number | undefined
  canWrite: boolean
}) {
  const copy = act('asset.copyPath', 'Copy path', acts.copy)
  if (!canWrite) {
    return (
      <MenuRow action={copy}>
        <CopyLabel />
      </MenuRow>
    )
  }
  return (
    <>
      <ContextMenuGroup>
        <MenuRow action={act('asset.place', 'Place on canvas', acts.place)} />
        <MenuRow action={copy}>
          <CopyLabel />
        </MenuRow>
        <MenuRow
          action={act(
            'asset.showFrames',
            showFramesLabel(frames),
            frames === 0 ? undefined : acts.showFrames,
          )}
        />
      </ContextMenuGroup>
      <ContextMenuSeparator />
      <ContextMenuGroup>
        <MenuRow action={act('asset.rename', 'Rename', acts.rename)} />
        <MenuRow action={act('asset.replace', 'Replace file…', acts.replace)} />
      </ContextMenuGroup>
      <ContextMenuSeparator />
      <MenuRow
        action={act('asset.delete', 'Delete', acts.remove)}
        variant="destructive"
      />
    </>
  )
}

/** Copy path with the click that also copies it named at the row's end. */
function CopyLabel() {
  return (
    <>
      Copy path
      <span className="ml-auto text-[10px] text-muted-foreground">click</span>
    </>
  )
}

/** A menu-only action, disabled where the tile gave no act for it. */
function act(id: string, label: string, run: (() => void) | undefined): Action {
  return {
    id,
    label,
    group: 'asset',
    palette: false,
    enabled: () => run !== undefined,
    run: () => run?.(),
  }
}

/** The row naming how many frames it lists, as the tile's own count does. */
function showFramesLabel(frames: number | undefined): string {
  if (frames === undefined) return 'Show frames using it'
  if (frames === 0) return 'No frames use it'
  return `Show ${frames} ${frames === 1 ? 'frame' : 'frames'} using it`
}
