import { Search, X } from 'lucide-react'

import { FILTER_FIELD, setHomeFilter, useHomeFilter } from './filter'

/**
 * The name filter in the Projects title row, left of Sort. Esc clears a
 * typed filter, and once it is empty hands focus back to the page.
 */
export function FilterField() {
  const text = useHomeFilter()
  return (
    <div className="flex h-7 w-44 items-center gap-1.5 rounded-lg border border-input bg-card pr-1 pl-2 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 sm:w-56">
      <Search aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        id={FILTER_FIELD}
        type="search"
        aria-label="Filter projects"
        placeholder="Filter"
        value={text}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => setHomeFilter(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          if (text === '') event.currentTarget.blur()
          else setHomeFilter('')
        }}
        className="min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
      />
      {text === '' ? null : (
        <button
          type="button"
          aria-label="Clear"
          title="Clear"
          onClick={() => {
            setHomeFilter('')
            document.getElementById(FILTER_FIELD)?.focus()
          }}
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      )}
    </div>
  )
}
