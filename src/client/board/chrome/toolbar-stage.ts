import { type RefObject, useLayoutEffect, useState } from 'react'

/** What the bar draws, from every control down to More alone. */
export type ToolbarStage = 'full' | 'folded' | 'tools' | 'active' | 'more'

/** The room each stage needs, read from `canon/design/toolbar/narrow`, widest first. */
const STAGE_FLOORS = [
  [754, 'full'],
  [560, 'folded'],
  [357, 'tools'],
  [221, 'active'],
] as const

/** The bar's `max-w` keeps this much of its column clear. */
const COLUMN_MARGIN = 24

export function stageForRoom(room: number): ToolbarStage {
  return STAGE_FLOORS.find(([floor]) => room >= floor)?.[1] ?? 'more'
}

/**
 * The stage the bar's column has room for, read before paint so a narrow column
 * never flashes the full bar. It follows the column rather than the window,
 * since a dragged panel narrows the column at any window size.
 */
export function useToolbarStage(
  bar: RefObject<HTMLElement | null>,
): ToolbarStage {
  const [stage, setStage] = useState<ToolbarStage>('full')
  useLayoutEffect(() => {
    const column = bar.current?.parentElement
    if (!column) return
    const read = () => {
      setStage(stageForRoom(column.clientWidth - COLUMN_MARGIN))
    }
    read()
    const observer = new ResizeObserver(read)
    observer.observe(column)
    return () => observer.disconnect()
  }, [bar])
  return stage
}
