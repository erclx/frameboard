import { ArrowUpDown, ChevronDown } from 'lucide-react'

import { useActions } from '@/client/actions/registry'
import { ChromeMenuContent } from '@/client/board/chrome/menu'
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'

const IDS = ['home.sortEdited', 'home.sortCreated', 'home.sortName'] as const

/**
 * The button on the right of the Projects title, per
 * `canon/design/home/sort-menu`, naming the order shown and opening the
 * `home.sort*` choices. It waits on the home view registering them.
 */
export function SortMenu() {
  const sorts = useActions(IDS).filter((action) => action !== undefined)
  const current = sorts.find((action) => action.checked?.())
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
                className="h-7 px-2 py-0 text-xs"
              >
                {sort.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </ChromeMenuContent>
    </DropdownMenu>
  )
}
