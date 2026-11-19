import {
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import { thumbnailUrl } from '@/client/live/thumbnail-url'
import type { FrameRecord } from '@/shared/records/list'

import { usePageThumbnails } from './thumbnails'

interface OverviewProps {
  page: string
  /** The slides in presenting order, each one cell. */
  slides: readonly FrameRecord[]
  /** The slide on the stage, marked and where the cursor opens. */
  current: string
  onJump: (ref: string) => void
  onClose: () => void
  send?: typeof fetch
}

/**
 * Every slide of the presented page over the stage, per
 * `canon/design/present/overview`, its colors its own over black in either theme.
 */
export function Overview({
  page,
  slides,
  current,
  onJump,
  onClose,
  send,
}: OverviewProps) {
  const [cursor, setCursor] = useState(() =>
    Math.max(
      slides.findIndex((slide) => slide.ref === current),
      0,
    ),
  )
  const [typed, setTyped] = useState('')
  const grid = useRef<HTMLUListElement>(null)
  const { theme, stamps } = usePageThumbnails(page, slides, send)
  useReturnFocus()

  useLayoutEffect(() => {
    grid.current?.querySelectorAll('button')[cursor]?.focus()
  }, [cursor])

  const moveTo = (at: number) => {
    setTyped('')
    setCursor(Math.min(Math.max(at, 0), slides.length - 1))
  }

  const press = (event: KeyboardEvent) => {
    // The board behind never hears a key pressed in the grid.
    event.stopPropagation()
    const handled = keyAction(event.key)
    if (!handled) return
    event.preventDefault()
    handled()
  }

  const keyAction = (key: string): (() => void) | undefined => {
    const columns = grid.current ? columnsOf(grid.current) : 1
    if (key === 'ArrowLeft') return () => moveTo(cursor - 1)
    if (key === 'ArrowRight') return () => moveTo(cursor + 1)
    if (key === 'ArrowUp') return () => moveTo(cursor - columns)
    if (key === 'ArrowDown') return () => moveTo(cursor + columns)
    if (key === 'Home') return () => moveTo(0)
    if (key === 'End') return () => moveTo(slides.length - 1)
    if (key === 'Escape' || key === 'g' || key === 'G') return onClose
    if (/^[0-9]$/.test(key)) return () => setTyped(`${typed}${key}`)
    if (key === 'Backspace') return () => setTyped(typed.slice(0, -1))
    if (key === 'Enter') return enter
    return undefined
  }

  // A typed number moves nothing until Enter, and one past the deck clears.
  const enter = () => {
    const slide = typed === '' ? slides[cursor] : slides[Number(typed) - 1]
    setTyped('')
    if (slide) onJump(slide.ref)
  }

  const srcOf = (ref: string) => {
    const stamp = stamps[ref]
    return stamp ? thumbnailUrl(ref, theme, stamp) : undefined
  }

  const count = `${slides.length} ${slides.length === 1 ? 'slide' : 'slides'}`
  return (
    <section
      aria-label="Slide overview"
      data-overview
      tabIndex={-1}
      onKeyDown={press}
      className="absolute inset-0 z-10 overflow-y-auto bg-[#0c0c0d] p-6 text-[13px] text-[#a4a6ab] outline-none"
    >
      <header className="mb-4 flex items-center justify-between gap-4">
        <p>
          <b className="font-semibold text-[#f1f1ee]">{count}</b>
          <span aria-live="polite">{typed ? ` · go to ${typed}` : ''}</span>
        </p>
        <p className="flex flex-wrap items-center justify-end gap-x-1">
          <Key>G</Key> opens this · arrows move · <Key>Enter</Key> goes ·{' '}
          <Key>Esc</Key> returns
        </p>
      </header>
      <ul
        ref={grid}
        className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4"
      >
        {slides.map((slide, at) => (
          <li key={slide.ref}>
            <Cell
              slide={slide}
              number={at + 1}
              current={slide.ref === current}
              focusable={at === cursor}
              src={srcOf(slide.ref)}
              onFocus={() => setCursor(at)}
              onClick={() => onJump(slide.ref)}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

function Cell({
  slide,
  number,
  current,
  focusable,
  src,
  onFocus,
  onClick,
}: {
  slide: FrameRecord
  number: number
  current: boolean
  focusable: boolean
  src: string | undefined
  onFocus: () => void
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={`Slide ${number}, ${slide.name}`}
      aria-current={current || undefined}
      tabIndex={focusable ? 0 : -1}
      onFocus={onFocus}
      onClick={onClick}
      className="group block w-full text-center outline-none"
    >
      {/* The ring means where the keys are alone, and the slide on the stage reads Now instead. */}
      <span className="relative grid aspect-video place-items-center overflow-hidden rounded-[5px] bg-[#19191b] group-focus-visible:ring-3 group-focus-visible:ring-[#4e92f6] group-focus-visible:ring-offset-6 group-focus-visible:ring-offset-[#0c0c0d]">
        {src ? (
          <img
            src={src}
            alt=""
            draggable={false}
            className="size-full object-contain"
          />
        ) : (
          <span className="truncate px-3 text-[#8c8f95]">{slide.name}</span>
        )}
        {current ? (
          <span
            aria-hidden
            className="absolute bottom-2 left-2 rounded-full bg-[#16161a] px-1.5 text-[10px] leading-4 font-medium text-white"
          >
            Now
          </span>
        ) : null}
      </span>
      <span className="mt-1.5 block text-[12px] tabular-nums">{number}</span>
    </button>
  )
}

function Key({ children }: { children: string }) {
  return (
    <kbd className="rounded-[4px] bg-[#232326] px-[5px] font-mono text-[11px] leading-[17px] font-medium text-[#d6d6d2]">
      {children}
    </kbd>
  )
}

/** How many cells share the grid's first row, which Up and Down move by. */
function columnsOf(grid: HTMLElement): number {
  const cells = [...grid.children] as HTMLElement[]
  const top = cells[0]?.offsetTop
  return Math.max(cells.filter((cell) => cell.offsetTop === top).length, 1)
}

/**
 * Returns focus on close to where it stood when the grid opened, read in
 * the first render before the grid takes it.
 */
function useReturnFocus(): void {
  const [opener] = useState(() => document.activeElement)
  useEffect(
    () => () => {
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus()
        return
      }
      document.querySelector<HTMLElement>('[data-presenting]')?.focus()
    },
    [opener],
  )
}
