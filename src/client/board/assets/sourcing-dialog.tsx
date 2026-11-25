import { XIcon } from 'lucide-react'
import { type ComponentProps, type ReactNode, useRef } from 'react'
import { useStore } from 'zustand'

import { Button } from '@/client/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/client/components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/client/components/ui/tabs'

import { FindView } from './find/view'
import { GenerateView } from './generate/view'
import {
  closeSourcing,
  sourcingDialogStore,
  type SourcingView,
} from './open-dialog'

const TAB =
  'h-6 rounded-[5px] border-0 text-xs font-medium text-muted-foreground data-active:bg-card data-active:text-foreground data-active:shadow-none data-active:ring-1 data-active:ring-border dark:data-active:bg-card'

const VIEW = 'flex min-h-0 flex-1 flex-col text-body'

interface SourcingDialogProps {
  project: string
  /** Find's calls, the board's routes in the app. */
  find?: Omit<ComponentProps<typeof FindView>, 'project'>
  /** Generate's calls, the board's routes in the app. */
  generate?: Omit<ComponentProps<typeof GenerateView>, 'project'>
  /** The button of a view, which takes the focus back when the dialog closes. */
  buttonOf: (view: SourcingView) => HTMLElement | null
}

/** The dialog Find and Generate share, switched in its header. */
export function SourcingDialog({
  project,
  find,
  generate,
  buttonOf,
}: SourcingDialogProps) {
  const { open, view, opener } = useStore(sourcingDialogStore)
  return (
    <WideDialog
      open={open}
      onClose={closeSourcing}
      title={view === 'find' ? 'Find media' : 'Generate media'}
      returnTo={() => buttonOf(opener)}
    >
      {(close) => (
        <Tabs
          value={view}
          onValueChange={(next) =>
            sourcingDialogStore.setState({
              view: next === 'generate' ? 'generate' : 'find',
            })
          }
          className="min-h-0 flex-1 gap-0"
        >
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
            <TabsList
              aria-label="Find or generate"
              className="h-7 w-[200px] rounded-[7px] p-0.5"
            >
              <TabsTrigger value="find" className={TAB}>
                Find
              </TabsTrigger>
              <TabsTrigger value="generate" className={TAB}>
                Generate
              </TabsTrigger>
            </TabsList>
            {close}
          </header>
          <TabsContent value="find" tabIndex={-1} className={VIEW}>
            <FindView project={project} {...find} />
          </TabsContent>
          <TabsContent value="generate" tabIndex={-1} className={VIEW}>
            <GenerateView project={project} {...generate} />
          </TabsContent>
        </Tabs>
      )}
    </WideDialog>
  )
}

/**
 * A 920 by 620 dialog, capped by the window, opening on its first field and
 * handing the focus back to what it was opened from.
 */
function WideDialog({
  open,
  onClose,
  title,
  returnTo,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  /** What takes the focus back on close, the last focused element when null. */
  returnTo: () => HTMLElement | null
  /** Draws the dialog around its close button. */
  children: (close: ReactNode) => ReactNode
}) {
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
          popup.current?.querySelector<HTMLElement>('input, textarea') ?? true
        }
        finalFocus={() => returnTo() ?? true}
        className="flex h-[620px] max-h-[calc(100dvh-2rem)] max-w-[min(920px,calc(100%-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(920px,calc(100%-2rem))]"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {children(
          <span className="flex items-center gap-1 text-muted-foreground">
            <kbd aria-hidden className="font-sans">
              Esc
            </kbd>
            <DialogClose
              aria-label="Close"
              render={<Button variant="ghost" size="icon-sm" />}
            >
              <XIcon aria-hidden />
            </DialogClose>
          </span>,
        )}
      </DialogContent>
    </Dialog>
  )
}
