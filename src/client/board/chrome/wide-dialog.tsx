import { XIcon } from 'lucide-react'
import { type ReactNode, useRef } from 'react'

import { Button } from '@/client/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
} from '@/client/components/ui/dialog'
import { cn } from '@/client/lib/cn'

interface WideDialogProps {
  open: boolean
  onClose: () => void
  /** The width and height it takes, the height capped by the window here. */
  className: string
  /** What takes the focus on open, the first control when null. */
  focusFirst: (popup: HTMLElement) => HTMLElement | null
  /** What takes the focus back on close, the last focused element when null and nothing when false. */
  returnTo: () => HTMLElement | null | false
  /** Its title, its header, and what the header leaves. */
  children: ReactNode
}

/** A dialog wide enough to hold a grid beside a preview or a list of sections. */
export function WideDialog({
  open,
  onClose,
  className,
  focusFirst,
  returnTo,
  children,
}: WideDialogProps) {
  const popup = useRef<HTMLDivElement>(null)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent
        ref={popup}
        showCloseButton={false}
        initialFocus={() =>
          (popup.current ? focusFirst(popup.current) : null) ?? true
        }
        finalFocus={() => returnTo() ?? true}
        className={cn(
          'flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0',
          className,
        )}
      >
        {children}
      </DialogContent>
    </Dialog>
  )
}

/** The dialog's top row, its title or switch beside the way out. */
export function WideDialogHeader({ children }: { children: ReactNode }) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
      {children}
      <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
        <kbd aria-hidden className="font-sans">
          Esc
        </kbd>
        <DialogClose
          aria-label="Close"
          render={<Button variant="ghost" size="icon-sm" />}
        >
          <XIcon aria-hidden />
        </DialogClose>
      </span>
    </header>
  )
}
