import { Toast as ToastPrimitive } from '@base-ui/react/toast'
import { cn } from 'cn'
import {
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  OctagonXIcon,
  XIcon,
} from 'lucide-react'
import type * as React from 'react'

import { Button } from '@/client/components/ui/button'

const toast = ToastPrimitive.createToastManager()

function ToastProvider({ ...props }: ToastPrimitive.Provider.Props) {
  return <ToastPrimitive.Provider {...props} />
}

function ToastPortal({ ...props }: ToastPrimitive.Portal.Props) {
  return <ToastPrimitive.Portal data-slot="toast-portal" {...props} />
}

function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        'pointer-events-none fixed right-4 bottom-4 z-50 w-[340px] max-w-[calc(100vw-2rem)] outline-none',
        className,
      )}
      {...props}
    />
  )
}

function Toast({ className, ...props }: ToastPrimitive.Root.Props) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      className={cn(
        'group/toast pointer-events-auto absolute right-0 bottom-0 z-[calc(1000-var(--toast-index))] w-full origin-bottom rounded-[10px] border border-border bg-card text-card-foreground shadow-[0_12px_40px_rgba(0,0,0,.3)] will-change-transform outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        // Every toast stands open in one column at rest, newest at the
        // bottom, as menus/toast draws them, rather than collapsing behind
        // the newest until the stack is hovered.
        '[--gap:0.25rem] [--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))]',
        'h-(--toast-height) [transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))] [transition:transform_500ms_cubic-bezier(0.22,1,0.36,1),opacity_500ms,height_150ms] motion-reduce:transition-none',
        "after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
        'data-limited:opacity-0 data-starting-style:[transform:translateY(150%)]',
        '[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(150%)]',
        'data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]',
        'data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]',
        'data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]',
        'data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]',
        'data-expanded:data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]',
        'data-expanded:data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]',
        'data-expanded:data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]',
        'data-expanded:data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]',
        className,
      )}
      {...props}
    />
  )
}

function ToastContent({ className, ...props }: ToastPrimitive.Content.Props) {
  return (
    <ToastPrimitive.Content
      data-slot="toast-content"
      className={cn(
        'flex h-full items-start gap-2.5 overflow-hidden px-3.5 py-3 text-xs',
        className,
      )}
      {...props}
    />
  )
}

function ToastTitle({ className, ...props }: ToastPrimitive.Title.Props) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className={cn('mb-0.5 text-xs font-semibold', className)}
      {...props}
    />
  )
}

function ToastDescription({
  className,
  ...props
}: ToastPrimitive.Description.Props) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn('text-xs leading-[1.45] text-muted-foreground', className)}
      {...props}
    />
  )
}

function ToastAction({
  className,
  render = <Button variant="outline" size="sm" />,
  ...props
}: ToastPrimitive.Action.Props) {
  return (
    <ToastPrimitive.Action
      data-slot="toast-action"
      render={render}
      className={cn('shrink-0', className)}
      {...props}
    />
  )
}

/** Shows on hover or focus alone, so a toast at rest matches `menus/toast`. */
function ToastClose({
  className,
  children,
  render = <Button variant="ghost" size="icon-xs" />,
  ...props
}: ToastPrimitive.Close.Props) {
  return (
    <ToastPrimitive.Close
      data-slot="toast-close"
      aria-label="Close"
      render={render}
      className={cn(
        'absolute top-1.5 right-1.5 text-muted-foreground opacity-0 group-hover/toast:opacity-100 hover:text-foreground focus-visible:opacity-100',
        className,
      )}
      {...props}
    >
      {children ?? <XIcon aria-hidden="true" />}
    </ToastPrimitive.Close>
  )
}

function ToastIcon({ type }: { type: string | undefined }) {
  let icon: React.ReactNode = null
  if (type === 'success') {
    icon = <CircleCheckIcon className="text-success" aria-hidden="true" />
  }

  if (type === 'info') icon = <InfoIcon aria-hidden="true" />
  if (type === 'warning') {
    icon = <CircleAlertIcon className="text-note" aria-hidden="true" />
  }
  if (type === 'error') {
    icon = <OctagonXIcon className="text-destructive" aria-hidden="true" />
  }
  if (!icon) return null
  return (
    <span
      data-slot="toast-icon"
      className="mt-px shrink-0 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4"
    >
      {icon}
    </span>
  )
}

type ToastObject<Data extends object = object> =
  ToastPrimitive.Root.ToastObject<Data>

/**
 * How a toast of one `type` draws in place of the icon, title, and
 * description, root and all, as the change toast draws its Show and Next.
 */
type ToastBody = (props: {
  // oxlint-disable-next-line typescript/no-explicit-any
  toast: ToastObject<any>
}) => React.ReactNode

function ToastList({
  bodies,
}: {
  bodies?: Readonly<Record<string, ToastBody>>
}) {
  const { toasts } = ToastPrimitive.useToastManager()
  return toasts.map((toastItem) => {
    const Body = toastItem.type ? bodies?.[toastItem.type] : undefined
    return Body ? (
      <Body key={toastItem.id} toast={toastItem} />
    ) : (
      <DefaultToast key={toastItem.id} toastItem={toastItem} />
    )
  })
}

function DefaultToast({ toastItem }: { toastItem: ToastObject }) {
  return (
    <Toast toast={toastItem}>
      <ToastContent>
        <ToastIcon type={toastItem.type} />
        <div className="flex min-w-0 flex-1 flex-col pr-4">
          <ToastTitle />
          <ToastDescription />
        </div>
        <ToastClose />
      </ToastContent>
    </Toast>
  )
}

/**
 * The one toast stack, in the corner of the window. A toast whose `type`
 * `bodies` names draws that body, so a surface with its own controls joins
 * the same stack rather than a second viewport that cannot see its heights.
 */
function Toaster({
  children,
  toastManager = toast,
  bodies,
  ...props
}: ToastPrimitive.Provider.Props & {
  bodies?: Readonly<Record<string, ToastBody>>
}) {
  return (
    <ToastProvider toastManager={toastManager} {...props}>
      {children}
      <ToastPortal>
        <ToastViewport>
          <ToastList bodies={bodies} />
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  )
}

const createToastManager = ToastPrimitive.createToastManager
const useToastManager = ToastPrimitive.useToastManager

export type { ToastBody, ToastObject }

export {
  createToastManager,
  Toast,
  toast,
  ToastAction,
  ToastClose,
  ToastContent,
  ToastDescription,
  Toaster,
  ToastPortal,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  useToastManager,
}
