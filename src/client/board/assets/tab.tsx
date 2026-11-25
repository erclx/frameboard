import { type ComponentProps, useRef } from 'react'

import { Button } from '@/client/components/ui/button'

import { FilesView } from './files'
import { openSourcing, type SourcingView } from './open-dialog'
import { SourcingDialog } from './sourcing-dialog'

const BUTTON = 'min-w-0 flex-1 bg-card text-xs dark:bg-card'

type AssetsTabProps = Omit<ComponentProps<typeof FilesView>, 'hint'> &
  Pick<ComponentProps<typeof SourcingDialog>, 'find' | 'generate'>

/** The left panel's Assets tab, the project's files under the buttons opening Find and Generate. */
export function AssetsTab({ find, generate, ...files }: AssetsTabProps) {
  const buttons = useRef<Partial<Record<SourcingView, HTMLElement | null>>>({})
  const button = (view: SourcingView, label: string) => (
    <Button
      ref={(element) => {
        buttons.current[view] = element
      }}
      variant="outline"
      size="sm"
      aria-haspopup="dialog"
      className={BUTTON}
      onClick={() => openSourcing(view)}
    >
      {label}
    </Button>
  )
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 gap-1.5 px-2 pt-1 pb-1">
        {button('find', 'Find…')}
        {button('generate', 'Generate…')}
      </div>
      <div className="min-h-0 flex-1">
        <FilesView
          {...files}
          hint="No file fits? Find… searches free images and models, and Generate… makes one."
        />
      </div>
      <SourcingDialog
        project={files.project}
        find={find}
        generate={generate}
        buttonOf={(view) => buttons.current[view] ?? null}
      />
    </div>
  )
}
