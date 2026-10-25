import type { ReactNode } from 'react'

interface PanelSectionProps {
  id: string
  title: string
  /** The section's own buttons, at its right edge. */
  children?: ReactNode
}

/** A left panel section's quiet heading row, such as Pages with its add button. */
export function PanelSection({ id, title, children }: PanelSectionProps) {
  return (
    // The top padding leaves the 24px buttons room inside the row, so their
    // target never reaches the first row below.
    <div className="flex h-[29px] items-center justify-between px-3 pt-1 text-label text-muted-foreground">
      <h2 id={id}>{title}</h2>
      {children}
    </div>
  )
}
