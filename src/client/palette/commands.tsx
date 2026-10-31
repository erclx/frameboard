import {
  Command as CommandIcon,
  EyeOff,
  FileText,
  Folder,
  Square,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useRoute } from 'wouter'

import { liveKey, useCharacterKeysOn } from '@/client/actions/character-keys'
import { keyParts } from '@/client/actions/keys'
import { type Action, useCommands } from '@/client/actions/registry'
import { reportRefusal } from '@/client/board/left-panel/page-actions'
import { type SelectionState, useSelection } from '@/client/board/selection'
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
import { recordRecent, useRecent } from './recent'
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

/** The action groups acting on what is selected, which an empty palette offers alone while something is. */
const SELECTION_GROUPS: ReadonlySet<string> = new Set([
  'frame',
  'arrange',
  'selection',
  'section',
  'preview',
])

/**
 * Cmd+K's palette over the whole board. With nothing typed it opens on the
 * actions last run from it, then the actions fitting the selection, then
 * pages, and a query searches frames, pages, every action, and projects.
 * Running a row closes it first, so a jump or an action meets the board with
 * focus back.
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
  // A mode or theme row naming the one the board is in would do nothing.
  const actions = useCommands().filter(
    (action) =>
      !(
        (action.group === 'mode' || action.group === 'theme') &&
        action.checked?.()
      ),
  )
  const canWrite = useLive((state) => state.canWrite)
  const { frames, pages, projects } = board
    ? boardTargets(board, params?.project ?? null)
    : { frames: [], pages: [], projects: [] }
  const [query, setQuery] = useState('')
  const recentIds = useRecent()
  const heading = useSelection((state) =>
    params ? selectionHeading(state) : null,
  )
  const recent = recentIds.flatMap(
    (id) => actions.find((action) => action.id === id) ?? [],
  )
  const offered = actions.filter(
    (action) =>
      !action.command?.searchOnly &&
      !recentIds.includes(action.id) &&
      (heading === null || SELECTION_GROUPS.has(action.group)),
  )

  const choose = (run: () => void) => () => {
    openOverlay(null)
    run()
  }
  const actionRows = (listed: Action[]) =>
    listed.map((action) => (
      <ActionRow key={action.id} action={action} choose={choose} />
    ))
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
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search frames, pages, and actions"
      />
      <CommandList>
        <CommandEmpty>Nothing matches.</CommandEmpty>
        {query.trim() === '' ? (
          <>
            {recent.length > 0 ? (
              <CommandGroup heading="Recent">{actionRows(recent)}</CommandGroup>
            ) : null}
            {offered.length > 0 ? (
              <CommandGroup heading={heading ?? 'Actions'}>
                {actionRows(offered)}
              </CommandGroup>
            ) : null}
            {pages.length > 0 ? (
              <CommandGroup heading="Pages">
                {targetRows(pages, <FileText />, jumpToPage, 'page')}
              </CommandGroup>
            ) : null}
          </>
        ) : (
          <>
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
                {actionRows(actions)}
              </CommandGroup>
            ) : null}
            {projects.length > 0 ? (
              <CommandGroup heading="Projects">
                {targetRows(projects, <Folder />, jumpToProject, 'project')}
              </CommandGroup>
            ) : null}
          </>
        )}
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
      onSelect={choose(() => {
        recordRecent(action.id)
        action.run()
      })}
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

/** Names what the selection-fitting actions act on, null with nothing selected. */
function selectionHeading(state: SelectionState): string | null {
  if (state.element) return 'For the selected element'
  const count = state.frames.length
  if (count === 1) return 'For 1 frame'
  if (count > 1) return `For ${count} frames`
  if (state.section !== undefined) return 'For the section'
  return null
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
