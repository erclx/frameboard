import { cn } from '@/client/lib/cn'

/**
 * A grey block standing where content will draw once it loads. It holds
 * still, since `canon/DESIGN.md` keeps the claim pulse the one looped motion,
 * and a screen reader skips it for the live status beside it.
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
