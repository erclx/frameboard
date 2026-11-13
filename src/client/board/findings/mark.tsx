import { TriangleAlert } from 'lucide-react'

import type { Finding } from '@/shared/records/check'

interface FindingsCountProps {
  count: number
  severity: Finding['severity']
}

/**
 * What a findings mark holds inside the element `FINDINGS_MARK` styles: the
 * warning triangle for an error and a small dot for warnings alone, so the
 * level never rests on color, then the count.
 */
export function FindingsCount({ count, severity }: FindingsCountProps) {
  return (
    <>
      {severity === 'error' ? (
        <TriangleAlert aria-hidden className="size-3 text-[var(--h)]" />
      ) : (
        <span
          aria-hidden
          data-findings-quiet
          className="size-[5px] rounded-full bg-current"
        />
      )}
      {count}
    </>
  )
}
