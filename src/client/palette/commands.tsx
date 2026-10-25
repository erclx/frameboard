import {
  Command as CommandIcon,
  EyeOff,
  FileText,
  Folder,
  Square,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useRoute } from 'wouter'

import { liveKey, useCharacterKeysOn } from '@/client/actions/character-keys'
import { keyParts } from '@/client/actions/keys'
import { type Action, useCommands } from '@/client/actions/registry'
import { reportRefusal } from '@/client/board/left-panel/page-actions'
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
  showAndJumpToFrame,
  type Target,
} from './targets'

function showHidden(ref: string): void {
  const name = ref.split('/').at(-1) ?? ref
  showAndJumpToFrame(ref).catch(reportRefusal(`Couldn't show ${name}`))
}

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
  const canWrite = useLive((state) => state.canWrite)
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
        // Showing a hidden frame is a write, which a read-only tab cannot make.
        disabled={target.hidden && !canWrite}
        onSelect={choose(() =>
          target.hidden ? showHidden(target.ref) : jump(target.ref),
        )}
      >
        {target.hidden ? <EyeOff /> : icon}
        <span className="flex-1 truncate">{target.label}</span>
        {target.hidden ? (
          <span className="text-muted-foreground">Hidden</span>
        ) : null}
        {target.hint ? (
          <span className="truncate text-muted-foreground">{target.hint}</span>
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
            {targetRows(projects, <Folder />, jumpToProject, 'project')}
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
  const key = liveKey(action.keys, useCharacterKeysOn())
  const hint = action.command?.hint?.()
  return (
    <CommandItem
      value={`action:${action.id}`}
      keywords={[label, ...(action.command?.keywords ?? [])]}
      onSelect={choose(action.run)}
    >
      <Icon />
      <span className="flex-1 truncate">{label}</span>
      {hint ? (
        <span className="truncate text-muted-foreground">{hint}</span>
      ) : null}
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
 * the query scores above runs that each start a word, as `zofi` finds Zoom
 * to fit. Letters spread through the middle of words match nothing, since
 * `new` finding Preview at phone width reads as noise.
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
      const words = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
      return startsWords(words, query.replace(/\s+/g, '')) ? 0.3 : 0
    }),
  )
}

/** Whether the query splits into runs, each a prefix of a later word than the last. */
function startsWords(words: readonly string[], query: string): boolean {
  if (query === '') return true
  return words.some((word, at) => {
    for (let length = sharedPrefix(word, query); length > 0; length -= 1) {
      if (startsWords(words.slice(at + 1), query.slice(length))) return true
    }
    return false
  })
}

function sharedPrefix(word: string, query: string): number {
  let length = 0
  while (length < word.length && word[length] === query[length]) length += 1
  return length
}
