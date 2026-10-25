import { ArrowUpDown, ChevronDown } from 'lucide-react'

import { useActions } from '@/client/actions/registry'
import { ChromeMenuContent } from '@/client/board/chrome/menu'
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'

const IDS = ['home.sortEdited', 'home.sortCreated', 'home.sortName'] as const

const REVERSE = ['home.sortReverse'] as const

/** Each direction named after the key it runs, the natural one first. */
const DIRECTIONS = {
  dates: ['Newest first', 'Oldest first'],
  name: ['A to Z', 'Z to A'],
} as const

const ITEM = 'h-7 px-2 py-0 text-xs'

/**
 * The button on the right of the Projects title, per
 * `canon/design/menus/home-sort`, naming the order shown and opening the
 * `home.sort*` choices, then the two directions the chosen key runs in. It
 * waits on the home view registering them.
 */
export function SortMenu() {
  const sorts = useActions(IDS).filter((action) => action !== undefined)
  const [reverse] = useActions(REVERSE)
  const current = sorts.find((action) => action.checked?.())
  const reversed = reverse?.checked?.() ?? false
  const [natural, flipped] =
    current?.id === 'home.sortName' ? DIRECTIONS.name : DIRECTIONS.dates
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-7 items-center gap-1.5 rounded-lg pr-2 pl-2.5 font-medium text-foreground outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-muted">
        <ArrowUpDown aria-hidden className="size-3.5 text-muted-foreground" />
        Sort: {current?.label ?? 'Last edited'}
        <ChevronDown aria-hidden className="size-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      <ChromeMenuContent align="end" className="w-45">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 pt-1.5 pb-1 text-[11px] font-semibold text-muted-foreground">
            Sort by
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup value={current?.id ?? ''}>
            {sorts.map((sort) => (
              <DropdownMenuRadioItem
                key={sort.id}
                value={sort.id}
                closeOnClick
                onClick={() => sort.run()}
                className={ITEM}
              >
                {sort.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        {reverse ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={reversed ? flipped : natural}>
              {[natural, flipped].map((label) => (
                <DropdownMenuRadioItem
                  key={label}
                  value={label}
                  closeOnClick
                  // Picking the direction already shown leaves it.
                  onClick={() => {
                    if ((label === flipped) !== reversed) reverse.run()
                  }}
                  className={ITEM}
                >
                  {label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        ) : null}
      </ChromeMenuContent>
    </DropdownMenu>
  )
}
