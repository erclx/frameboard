import type { ReactNode } from 'react'

/** A section's own button, beside its heading. */
export const HEAD_BUTTON = 'bg-card text-xs dark:bg-card'

interface SectionHeadProps {
  /** The heading's id, which names the section around it. */
  id: string
  title: string
  /** What the section does, at the heading's right. */
  children?: ReactNode
}

/** A section's heading in the Theme dialog. */
export function SectionHead({ id, title, children }: SectionHeadProps) {
  return (
    <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
      <h3 id={id} className="text-panel">
        {title}
      </h3>
      {children}
    </div>
  )
}
