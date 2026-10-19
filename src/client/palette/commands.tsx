import { Command as CommandIcon, FileText, House, Square } from 'lucide-react'
import type { ReactNode } from 'react'
import { useRoute } from 'wouter'

import { keyParts } from '@/client/actions/keys'
import { type Action, useCommands } from '@/client/actions/registry'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/client/components/ui/command'
import { Kbd, KbdGroup } from '@/client/components/ui/kbd'
import { useLive } from '@/client/live/store'

import { openOverlay, useOverlay } from './overlay'
import {
  boardTargets,
  jumpToFrame,
  jumpToPage,
  jumpToProject,
  type Target,
} from './targets'

/**
 * Cmd+K's palette over the whole board: the open project's frames and pages,
 * the actions that opt in with `command`, and every project. Running a row
 * closes it first, so a jump or an action meets the board with focus back.
 */
export function CommandPalette() {
  const open = useOverlay() === 'commands'
  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => openOverlay(next ? 'commands' : null)}
      title="Command palette"
      description="Search for a frame, page, project, or action to run."
    >
      <Palette />
    </CommandDialog>
  )
}

function Palette() {
  const board = useLive((state) => state.board)
  const [, params] = useRoute('/p/:project/:page?')
  // A mode row naming the mode the board is in would do nothing.
  const actions = useCommands().filter(
    (action) => !(action.group === 'mode' && action.checked?.()),
  )
  const { frames, pages, projects } = board
    ? boardTargets(board, params?.project ?? null)
    : { frames: [], pages: [], projects: [] }

  const choose = (run: () => void) => () => {
    openOverlay(null)
    run()
  }
  const targetRows = (
    targets: Target[],
    icon: ReactNode,
    jump: (ref: string) => void,
    kind: string,
  ) =>
    targets.map((target) => (
      <CommandItem
        key={target.ref}
        value={`${kind}:${target.ref}`}
        keywords={[target.label, target.hint ?? '']}
        onSelect={choose(() => jump(target.ref))}
      >
        {icon}
        <span className="flex-1 truncate">{target.label}</span>
        {target.hint ? (
          <span className="text-muted-foreground">{target.hint}</span>
        ) : null}
      </CommandItem>
    ))

  return (
    <Command filter={matchScore}>
      <CommandInput placeholder="Search frames, pages, and actions" />
      <CommandList>
        <CommandEmpty>Nothing matches.</CommandEmpty>
        {frames.length > 0 ? (
          <CommandGroup heading="Frames">
            {targetRows(frames, <Square />, jumpToFrame, 'frame')}
          </CommandGroup>
        ) : null}
        {pages.length > 0 ? (
          <CommandGroup heading="Pages">
            {targetRows(pages, <FileText />, jumpToPage, 'page')}
          </CommandGroup>
        ) : null}
        {actions.length > 0 ? (
          <CommandGroup heading="Actions">
            {actions.map((action) => (
              <ActionRow key={action.id} action={action} choose={choose} />
            ))}
          </CommandGroup>
        ) : null}
        {projects.length > 0 ? (
          <CommandGroup heading="Projects">
            {targetRows(projects, <House />, jumpToProject, 'project')}
          </CommandGroup>
        ) : null}
      </CommandList>
    </Command>
  )
}

function ActionRow({
  action,
  choose,
}: {
  action: Action
  choose: (run: () => void) => () => void
}) {
  const label = action.command?.label ?? action.label
  const Icon = action.command?.icon ?? CommandIcon
  const key = action.keys?.[0]
  return (
    <CommandItem
      value={`action:${action.id}`}
      keywords={[label]}
      onSelect={choose(action.run)}
    >
      <Icon />
      <span className="flex-1 truncate">{label}</span>
      {key ? (
        <KbdGroup>
          {keyParts(key).map((part) => (
            <Kbd key={part}>{part}</Kbd>
          ))}
        </KbdGroup>
      ) : null}
    </CommandItem>
  )
}

/**
 * Ranks a row by what it shows rather than by its unique value, which holds
 * a ref that would match a project's name on every frame inside it. A run of
 * the query scores above letters spread across the label.
 */
function matchScore(
  _value: string,
  search: string,
  keywords: string[] = [],
): number {
  const query = search.trim().toLowerCase()
  if (query === '') return 1
  return Math.max(
    ...keywords.map((keyword) => {
      const text = keyword.toLowerCase()
      if (text.startsWith(query)) return 1
      if (text.includes(query)) return 0.8
      return inOrder(text, query) ? 0.3 : 0
    }),
  )
}

function inOrder(text: string, query: string): boolean {
  let at = 0
  for (const letter of query) {
    at = text.indexOf(letter, at) + 1
    if (at === 0) return false
  }
  return true
}
