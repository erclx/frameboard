import { type ComponentProps, useState } from 'react'

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/client/components/ui/tabs'

import { FilesView } from './files'
import { FindView } from './find/view'

const TAB =
  'h-6 rounded-[5px] border-0 text-xs font-medium text-muted-foreground data-active:bg-card data-active:text-foreground data-active:shadow-none data-active:ring-1 data-active:ring-border dark:data-active:bg-card'

interface AssetsTabProps extends ComponentProps<typeof FilesView> {
  /** Find's calls, the board's routes in the app. */
  find?: Omit<ComponentProps<typeof FindView>, 'project'>
}

/** The left panel's Assets tab, the project's Files beside Find, which brings a found image in. */
export function AssetsTab({ find, ...files }: AssetsTabProps) {
  const { project } = files
  const [view, setView] = useState('files')
  return (
    <Tabs
      value={view}
      onValueChange={(value) => setView(String(value))}
      className="flex h-full min-h-0 flex-col gap-0"
    >
      <TabsList
        aria-label="Assets views"
        className="mx-2 mt-0 mb-2 h-7 w-auto shrink-0 rounded-[7px] p-0.5"
      >
        <TabsTrigger value="files" className={TAB}>
          Files
        </TabsTrigger>
        <TabsTrigger value="find" className={TAB}>
          Find
        </TabsTrigger>
      </TabsList>
      <TabsContent value="files" className="min-h-0 flex-1">
        <FilesView {...files} />
      </TabsContent>
      <TabsContent value="find" className="min-h-0 flex-1">
        <FindView project={project} {...find} />
      </TabsContent>
    </Tabs>
  )
}
