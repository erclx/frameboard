import { cn } from 'cn'
import { GitCompareArrows } from 'lucide-react'
import { type KeyboardEvent, useEffect, useMemo, useRef } from 'react'

import { frameTheme, useFrameTheme } from '@/client/theme/store'
import { frameThemeUrl, setFrameTheme } from '@/shared/theme'

import {
  type CompareMode,
  compareStore,
  endCompare,
  startCompare,
  useCompare,
} from './compare'

/** How far an arrow key moves split's divider, as a share of the frame's width. */
const SPLIT_STEP = 0.05

interface CompareViewProps {
  frameRef: string
  name: string
  hash: string
}

/**
 * The version before as a second iframe over the live one, which it never
 * touches, per agents/compare-flip and compare-split. Flip covers the frame
 * and split clips it at a divider. It follows the frame's theme the way the
 * live iframe does, rewriting its root rather than reloading it.
 */
export function CompareView({ frameRef: ref, name, hash }: CompareViewProps) {
  const mode = useCompare((state) => state.mode)
  const split = useCompare((state) => state.split)
  const theme = useFrameTheme(ref)
  const iframe = useRef<HTMLIFrameElement>(null)
  // Read once per version, so a theme switch never reloads the page.
  const src = useMemo(
    () => frameThemeUrl(ref, frameTheme(ref), undefined, hash),
    [ref, hash],
  )

  useEffect(() => {
    const element = iframe.current
    if (!element) return
    const write = () => {
      const root = element.contentDocument?.documentElement
      if (root) setFrameTheme(root, theme)
    }
    write()
    element.addEventListener('load', write)
    return () => element.removeEventListener('load', write)
  }, [theme])

  const splitting = mode === 'split'
  const percent = `${Math.round(split * 1000) / 10}%`
  return (
    <>
      <div
        data-compare-before={ref}
        className="absolute inset-0 overflow-hidden"
        style={
          splitting
            ? { clipPath: `inset(0 calc(100% - ${percent}) 0 0)` }
            : undefined
        }
      >
        <iframe
          ref={iframe}
          title={`${name} before`}
          src={src}
          tabIndex={-1}
          style={{ colorScheme: theme }}
          className="block size-full border-0 bg-[color:Canvas]"
        />
      </div>
      <CompareChip side="left">Before</CompareChip>
      {splitting ? (
        <>
          <CompareChip side="right">Now</CompareChip>
          <SplitDivider
            frameRef={ref}
            name={name}
            at={split}
            percent={percent}
          />
        </>
      ) : null}
    </>
  )
}

function CompareChip({
  side,
  children,
}: {
  side: 'left' | 'right'
  children: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute bottom-[calc(6px/var(--zoom,1))] flex h-[18px] items-center rounded-[9px] bg-[color-mix(in_srgb,var(--claim)_22%,var(--card))] px-1.5 text-label font-medium text-claim [transform:scale(calc(1/var(--zoom,1)))]',
        side === 'left'
          ? 'left-[calc(6px/var(--zoom,1))] origin-bottom-left'
          : 'right-[calc(6px/var(--zoom,1))] origin-bottom-right',
      )}
    >
      {children}
    </span>
  )
}

interface SplitDividerProps {
  frameRef: string
  name: string
  at: number
  percent: string
}

/**
 * Split's divider, dragged through the hit layer by its handle and moved
 * by the arrow keys while focused, Home and End reaching the edges.
 */
function SplitDivider({ frameRef: ref, name, at, percent }: SplitDividerProps) {
  const move = (to: number) =>
    compareStore.setState({ split: Math.min(1, Math.max(0, to)) })
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = {
      ArrowLeft: -SPLIT_STEP,
      ArrowDown: -SPLIT_STEP,
      ArrowRight: SPLIT_STEP,
      ArrowUp: SPLIT_STEP,
    }[event.key]
    if (step !== undefined) move(at + step)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(1)
    else return
    event.preventDefault()
    event.stopPropagation()
  }
  return (
    <div
      data-compare-divider={ref}
      role="slider"
      tabIndex={0}
      aria-label={`Split between ${name} before and now`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(at * 100)}
      aria-valuetext={`${Math.round(at * 100)}% before`}
      onKeyDown={onKeyDown}
      className="absolute top-0 bottom-0 w-[calc(2px/var(--zoom,1))] -translate-x-1/2 bg-claim outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      style={{ left: percent }}
    >
      <span
        aria-hidden
        className="absolute top-1/2 left-1/2 h-7 w-3.5 rounded-[7px] bg-card shadow-[0_0_0_2px_var(--claim)] [transform:translate(-50%,-50%)_scale(calc(1/var(--zoom,1)))]"
      />
    </div>
  )
}

const OPTIONS: readonly { value: CompareMode | 'now'; label: string }[] = [
  { value: 'now', label: 'Now' },
  { value: 'flip', label: 'Before' },
  { value: 'split', label: 'Split' },
]

/**
 * The label's compare control while the frame has a base: one button that
 * starts compare, and while compared a Now, Before, and Split choice, Now
 * ending it. The hit layer covers the label, so a press reaches a button
 * through `data-label-control` and the gestures click it on release.
 */
export function CompareControl({
  frameRef: ref,
  name,
}: {
  frameRef: string
  name: string
}) {
  const compared = useCompare((state) => state.ref === ref)
  const mode = useCompare((state) => state.mode)
  const pick = (value: CompareMode | 'now') => {
    if (value === 'now') endCompare()
    else void startCompare(ref, value)
  }

  if (!compared) {
    return (
      <button
        type="button"
        data-label-control
        aria-label={`Compare ${name} with before`}
        title="Compare with before"
        onClick={() => pick('flip')}
        className="grid size-[18px] shrink-0 place-items-center rounded-[5px] bg-secondary text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <GitCompareArrows aria-hidden className="size-3" />
      </button>
    )
  }

  const current = mode
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[
      event.key
    ]
    if (delta === undefined) return
    event.preventDefault()
    event.stopPropagation()
    const at = OPTIONS.findIndex((option) => option.value === current)
    const next = OPTIONS[(at + delta + OPTIONS.length) % OPTIONS.length]
    if (!next) return
    pick(next.value)
    // Now ends compare and with it this group, so focus stays on Before or Split alone.
    if (next.value !== 'now') {
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(
            `[data-compare-option="${CSS.escape(`${ref}:${next.value}`)}"]`,
          )
          ?.focus(),
      )
    }
  }
  return (
    <div
      role="radiogroup"
      aria-label={`Compare ${name}`}
      onKeyDown={onKeyDown}
      className="flex shrink-0 gap-px rounded-md bg-secondary p-0.5"
    >
      {OPTIONS.map(({ value, label }) => {
        const on = value === current
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            data-label-control
            data-compare-option={`${ref}:${value}`}
            onClick={() => pick(value)}
            className={cn(
              'flex h-4 items-center rounded px-1.5 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              on
                ? 'bg-card text-foreground shadow-[0_0_0_1px_var(--border)]'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
