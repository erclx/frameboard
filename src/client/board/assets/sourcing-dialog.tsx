import type { ComponentProps } from 'react'
import { useStore } from 'zustand'

import { DialogTitle } from '@/client/components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/client/components/ui/tabs'

import { WideDialog, WideDialogHeader } from '../chrome/wide-dialog'
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
      className="h-[620px] max-w-[min(920px,calc(100%-2rem))] sm:max-w-[min(920px,calc(100%-2rem))]"
      focusFirst={(popup) =>
        popup.querySelector<HTMLElement>('input, textarea')
      }
      returnTo={() => buttonOf(opener)}
    >
      <DialogTitle className="sr-only">
        {view === 'find' ? 'Find media' : 'Generate media'}
      </DialogTitle>
      <Tabs
        value={view}
        onValueChange={(next) =>
          sourcingDialogStore.setState({
            view: next === 'generate' ? 'generate' : 'find',
          })
        }
        className="min-h-0 flex-1 gap-0"
      >
        <WideDialogHeader>
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
        </WideDialogHeader>
        <TabsContent value="find" tabIndex={-1} className={VIEW}>
          <FindView project={project} {...find} />
        </TabsContent>
        <TabsContent value="generate" tabIndex={-1} className={VIEW}>
          <GenerateView project={project} {...generate} />
        </TabsContent>
      </Tabs>
    </WideDialog>
  )
}
