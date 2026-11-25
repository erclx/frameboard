import type { ReactNode } from 'react'
import { useStore } from 'zustand'

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/client/components/ui/tabs'

import {
  INSPECTOR_TABS,
  type InspectorTab,
  inspectorTabStore,
} from './tab-store'

const LABELS = {
  design: 'Design',
  slides: 'Slides',
  export: 'Export',
} as const satisfies Record<InspectorTab, string>

// The left panel's trigger classes, so the two strips read as one control.
const TAB =
  'h-6 rounded-[5px] border-0 text-xs font-medium text-muted-foreground data-active:bg-card data-active:text-foreground data-active:shadow-none data-active:ring-1 data-active:ring-border dark:data-active:bg-card'

interface InspectorTabsProps {
  /** Drawn between the strip and every tab's sections, such as the frame crumb over an element. */
  head?: ReactNode
  design: ReactNode
  slides: ReactNode
  export: ReactNode
}

/** The Design, Slides, and Export tabs, each holding the sections for its job. */
export function InspectorTabs({
  head,
  design,
  slides,
  export: exporting,
}: InspectorTabsProps) {
  const tab = useStore(inspectorTabStore, (state) => state.tab)
  const bodies = { design, slides, export: exporting }
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        const picked = INSPECTOR_TABS.find((one) => one === value)
        if (picked) inspectorTabStore.setState({ tab: picked })
      }}
      className="min-h-0 flex-1 gap-0"
    >
      <TabsList className="m-2 h-7 w-auto shrink-0 rounded-[7px] p-0.5">
        {INSPECTOR_TABS.map((one) => (
          <TabsTrigger key={one} value={one} className={TAB}>
            {LABELS[one]}
          </TabsTrigger>
        ))}
      </TabsList>
      {head}
      {INSPECTOR_TABS.map((one) => (
        <TabsContent
          key={one}
          value={one}
          // Unfocusable, so Tab lands on the first control rather than an unringed panel.
          tabIndex={-1}
          // Relative so a tip's hidden node scrolls inside it, and filled so its text keeps its subpixel smoothing.
          className="relative min-h-0 overflow-y-auto bg-sidebar text-body"
        >
          {bodies[one]}
        </TabsContent>
      ))}
    </Tabs>
  )
}
