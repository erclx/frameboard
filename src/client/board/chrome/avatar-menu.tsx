import { UserRound } from 'lucide-react'

import { useActionGroup, useActions } from '@/client/actions/registry'
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

import manifest from '../../../../package.json' with { type: 'json' }
import { initials } from './author'
import { ActionMenuItem, ChromeMenuContent, MENU_ROW } from './menu'

interface AvatarMenuProps {
  /** The signing name, null when git has none, which shows a generic avatar and no name row. */
  name: string | null
  /** Which edge of the avatar the menu lines up with. */
  align?: 'start' | 'end'
}

/**
 * The developer's avatar, opening the menu of who notes are signed as,
 * keyboard shortcuts, the theme, and the docs. Shortcuts and the theme wait
 * on the rows that register `help.shortcuts` and the `theme` group.
 */
export function AvatarMenu({ name, align = 'start' }: AvatarMenuProps) {
  const [shortcuts] = useActions(['help.shortcuts'])
  const themes = useActionGroup('theme')
  const current = themes.find((theme) => theme.checked?.())

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={name ? `${name}, from git user.name` : 'Account'}
        className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Avatar name={name} />
      </DropdownMenuTrigger>
      <ChromeMenuContent
        align={align}
        alignOffset={align === 'start' ? -25 : -10}
        sideOffset={7}
      >
        {name ? (
          <>
            <div className="flex items-center gap-2.5 p-2">
              <Avatar name={name} />
              <div className="min-w-0">
                <p className="truncate font-semibold" title={name}>
                  {name}
                </p>
                <p className="text-label font-normal text-muted-foreground">
                  From git user.name
                </p>
              </div>
            </div>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <ActionMenuItem
          action={shortcuts}
          label="Keyboard shortcuts"
          keys={['?']}
        />
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

function Avatar({ name }: { name: string | null }) {
  return (
    <span
      aria-hidden
      className="grid size-[22px] shrink-0 place-items-center rounded-full bg-foreground text-[10px] font-bold text-card"
    >
      {name ? initials(name) : <UserRound className="size-3" />}
    </span>
  )
}
