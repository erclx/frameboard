import { UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useActionGroup, useActions } from '@/client/actions/registry'
import { RenameField } from '@/client/components/rename-field'
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
import { toast } from '@/client/components/ui/toast'
import { useLive } from '@/client/live/store'

import manifest from '../../../../package.json' with { type: 'json' }
import { type AuthorSource, initials, setAuthor } from './author'
import { ActionMenuItem, ChromeMenuContent, MENU_ROW } from './menu'

interface AvatarMenuProps {
  /** The signing name, null when neither this machine nor git has one, which shows a generic avatar and a `Set your name` row, and undefined while its read is pending, which shows no name row. */
  name: string | null | undefined
  /** Where the name comes from, which captions the name row. */
  source?: AuthorSource | null
  /** Which edge of the avatar the menu lines up with. */
  align?: 'start' | 'end'
}

const CAPTION: Record<AuthorSource, string> = {
  config: 'Saved on this machine',
  git: 'From git user.name',
}

/**
 * The developer's avatar, opening the menu of who notes are signed as,
 * keyboard shortcuts, the theme, and the docs. A writing tab edits the name
 * in place from its row. Shortcuts and the theme wait on the rows that
 * register `help.shortcuts` and the `theme` group.
 */
export function AvatarMenu({
  name,
  source = null,
  align = 'start',
}: AvatarMenuProps) {
  const [shortcuts] = useActions(['help.shortcuts'])
  const themes = useActionGroup('theme')
  const current = themes.find((theme) => theme.checked?.())
  const caption = source ? CAPTION[source] : null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={
          name && caption ? `${name}, ${caption.toLowerCase()}` : 'Account'
        }
        className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Avatar name={name ?? null} />
      </DropdownMenuTrigger>
      <ChromeMenuContent
        align={align}
        alignOffset={align === 'start' ? -25 : -10}
        sideOffset={7}
      >
        {name === undefined ? null : <NameRow name={name} caption={caption} />}
        <ActionMenuItem action={shortcuts} label="Keyboard shortcuts" />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger
            disabled={themes.length === 0}
            className={`${MENU_ROW} data-disabled:opacity-50`}
          >
            Theme
            {current ? (
              <span className="ml-auto text-muted-foreground">
                {current.label}
              </span>
            ) : null}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="rounded-[10px] ring-border">
            <DropdownMenuRadioGroup value={current?.id ?? ''}>
              {themes.map((theme) => (
                <DropdownMenuRadioItem
                  key={theme.id}
                  value={theme.id}
                  onClick={() => theme.run()}
                  className="h-7 py-0 text-xs"
                >
                  {theme.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem
          className={MENU_ROW}
          render={<a href={manifest.homepage} />}
        >
          Docs
        </DropdownMenuItem>
      </ChromeMenuContent>
    </DropdownMenu>
  )
}

interface NameRowProps {
  name: string | null
  caption: string | null
}

/**
 * Who notes are signed as, which a click on a writing tab turns into a field.
 * An emptied field clears the saved name so git's answers again. With no name
 * a writing tab offers `Set your name`, and a read-only one shows no row.
 */
function NameRow({ name, caption }: NameRowProps) {
  const canWrite = useLive((state) => state.canWrite)
  const [editing, setEditing] = useState(false)
  const row = useRef<HTMLDivElement>(null)
  const refocus = useRef(false)

  useEffect(() => {
    if (editing || !refocus.current) return
    refocus.current = false
    row.current?.focus()
  }, [editing])

  if (!name && !canWrite) return null

  const stop = () => {
    refocus.current = true
    setEditing(false)
  }

  if (editing) {
    return (
      <>
        <div
          className="flex items-center gap-2.5 p-2"
          // Keys typed into the field stay out of the menu's typeahead and arrow keys.
          onKeyDown={(event) => {
            if (event.key !== 'Tab') event.stopPropagation()
          }}
        >
          <Avatar name={name} />
          <div className="min-w-0 flex-1 pl-1.5">
            <RenameField
              hug
              clearable
              name={name ?? ''}
              label="Your name"
              onCommit={(next) => {
                stop()
                setAuthor(next).catch((error: unknown) =>
                  toast.add({
                    title: "Couldn't save your name",
                    description:
                      error instanceof Error ? error.message : String(error),
                    type: 'error',
                  }),
                )
              }}
              onCancel={stop}
            />
            <p className="mt-0.5 text-label font-normal text-muted-foreground">
              {name ? (caption ?? '') : 'Signs your notes'}
            </p>
          </div>
        </div>
        <DropdownMenuSeparator />
      </>
    )
  }

  return (
    <>
      {canWrite ? (
        <DropdownMenuItem
          ref={row}
          closeOnClick={false}
          onClick={() => setEditing(true)}
          aria-label={name ? `Edit your name, ${name}` : 'Set your name'}
          className="gap-2.5 p-2"
        >
          <NameRowBody name={name} caption={caption} />
        </DropdownMenuItem>
      ) : (
        <div className="flex items-center gap-2.5 p-2">
          <NameRowBody name={name} caption={caption} />
        </div>
      )}
      <DropdownMenuSeparator />
    </>
  )
}

function NameRowBody({ name, caption }: NameRowProps) {
  if (!name) {
    return (
      <>
        <span
          aria-hidden
          className="grid size-[22px] shrink-0 place-items-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground"
        >
          ?
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-primary">Set your name</p>
          <p className="text-label font-normal text-muted-foreground">
            Signs your notes
          </p>
        </div>
      </>
    )
  }
  return (
    <>
      <Avatar name={name} />
      <div className="min-w-0">
        <p className="truncate font-semibold" title={name}>
          {name}
        </p>
        {caption ? (
          <p className="text-label font-normal text-muted-foreground">
            {caption}
          </p>
        ) : null}
      </div>
    </>
  )
}

function Avatar({ name }: { name: string | null }) {
  return (
    <span
      aria-hidden
      data-avatar
      className="grid size-[22px] shrink-0 place-items-center rounded-full bg-foreground text-[10px] font-bold text-card"
    >
      {name ? initials(name) : <UserRound className="size-3" />}
    </span>
  )
}
