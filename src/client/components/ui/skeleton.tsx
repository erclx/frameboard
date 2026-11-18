import { cn } from '@/client/lib/cn'

/**
 * A grey block standing where content will draw once it loads. It holds
 * still unless a caller adds the loading pulse, the one looped motion
 * `canon/DESIGN.md` allows a block, and a screen reader skips it.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      data-slot="skeleton"
      className={cn('rounded-md bg-muted', className)}
      {...props}
    />
  )
}

export { Skeleton }
