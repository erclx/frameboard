import { Input as InputPrimitive } from '@base-ui/react/input'
import { cn } from 'cn'
import * as React from 'react'

/**
 * The inspector's field: 26px on the raised fill with the field radius and
 * no outline, as `canon/design/inspector/` draws its `.fld`. A key letter
 * sits in the caller's label, over the left padding.
 */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-[26px] w-full min-w-0 rounded-md border-0 bg-input px-2 text-xs text-foreground tabular-nums outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
