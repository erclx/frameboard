import { cn } from 'cn'

/**
 * How many frames under a page or project an agent changed since the
 * developer last looked, per agents/unseen-many's `.ucount`. Draws nothing
 * at zero.
 */
export function UnseenCount({
  count,
  className,
}: {
  count: number
  className?: string
}) {
  if (count === 0) return null
  return (
    <span
      role="img"
      aria-label={`${count} unseen ${count === 1 ? 'change' : 'changes'}`}
      data-unseen-count
      className={cn('shrink-0 text-label text-claim', className)}
    >
      {count}
    </span>
  )
}
