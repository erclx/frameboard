import type { ComponentProps, ReactNode } from 'react'
import { useStore } from 'zustand'

import { DialogTitle } from '@/client/components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/client/components/ui/tabs'
import type { FontList } from '@/shared/records/sourcing'
import { TOKEN_GROUPS, type TokenTable } from '@/shared/records/tokens'

import { WideDialog, WideDialogHeader } from '../../chrome/wide-dialog'
import {
  closeTheme,
  showThemeSection,
  type ThemeCounts,
  themeDialogStore,
  type ThemeOpener,
  type ThemeSection,
} from './dialog-store'
import { FontsSection } from './fonts'
import { KitsSection } from './kits'
import { TOKEN_TITLES } from './token-names'
import type { SheetWriter } from './token-writer'
import { TokensSection } from './tokens'

/** Every section, in the order the dialog lists them. */
const SECTIONS: readonly { section: ThemeSection; title: string }[] = [
  { section: 'kits', title: 'Kits' },
  { section: 'fonts', title: 'Fonts' },
  ...TOKEN_GROUPS.map((group) => ({
    section: group,
    title: TOKEN_TITLES[group].title,
  })),
]

interface ThemeDialogProps {
  project: string
  counts: ThemeCounts
  fonts: FontList | null | undefined
  table: TokenTable | null | undefined
  writer: SheetWriter
  /** The Fonts section's calls, the board's routes in the app. */
  fontCalls?: Omit<ComponentProps<typeof FontsSection>, 'project' | 'list'>
  /** The Kits section's calls, the board's routes in the app. */
  kitCalls?: Omit<ComponentProps<typeof KitsSection>, 'project'>
  /** The card or button it opened from, which takes the focus back when it closes. */
  openerOf: (opener: ThemeOpener) => HTMLElement | null
}

/** The project's kits, fonts, and tokens, one section at a time beside the list of them. */
export function ThemeDialog({
  project,
  counts,
  fonts,
  table,
  writer,
  fontCalls,
  kitCalls,
  openerOf,
}: ThemeDialogProps) {
  const { open, section, opener } = useStore(themeDialogStore)
  const bodyOf = (shown: ThemeSection): ReactNode => {
    if (shown === 'kits') return <KitsSection project={project} {...kitCalls} />
    if (shown === 'fonts') {
      return <FontsSection project={project} list={fonts} {...fontCalls} />
    }
    return <TokensSection group={shown} table={table} writer={writer} />
  }
  return (
    <WideDialog
      open={open}
      onClose={closeTheme}
      className="h-[640px] max-w-[min(960px,calc(100%-2rem))] sm:max-w-[min(960px,calc(100%-2rem))]"
      focusFirst={(popup) =>
        popup.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      }
      returnTo={() => (opener === null ? false : openerOf(opener))}
    >
      <WideDialogHeader>
        <DialogTitle className="min-w-0 truncate text-panel leading-normal">
          Theme · {project}
        </DialogTitle>
      </WideDialogHeader>
      <Tabs
        orientation="vertical"
        value={section}
        onValueChange={(next: ThemeSection) => showThemeSection(next)}
        className="min-h-0 flex-1 flex-col gap-0 overflow-y-auto sm:flex-row sm:overflow-hidden"
      >
        <div className="shrink-0 border-b border-border p-2 sm:w-[180px] sm:overflow-y-auto sm:border-r sm:border-b-0">
          <SectionList counts={counts} />
        </div>
        {SECTIONS.map(({ section: listed }) => (
          <TabsContent
            key={listed}
            value={listed}
            className="min-w-0 flex-none p-4 text-body focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:flex-1 sm:overflow-y-auto"
          >
            {bodyOf(listed)}
          </TabsContent>
        ))}
      </Tabs>
    </WideDialog>
  )
}

const SECTION =
  'group/section h-7 w-full flex-none group-data-vertical/tabs:justify-between rounded-[5px] border-0 px-1 text-xs font-normal text-foreground hover:bg-accent data-active:bg-accent data-active:font-semibold group-data-[variant=default]/tabs-list:data-active:shadow-none dark:text-foreground dark:data-active:border-transparent dark:data-active:bg-accent after:hidden'

/** The sections with what each holds. */
function SectionList({ counts }: Pick<ThemeDialogProps, 'counts'>) {
  return (
    <TabsList
      activateOnFocus
      aria-label="Theme sections"
      className="w-full rounded-none bg-transparent p-0"
    >
      {SECTIONS.map(({ section, title }) => (
        <TabsTrigger key={section} value={section} className={SECTION}>
          {title}
          <span className="text-(length:--text-caption) font-normal text-muted-foreground tabular-nums group-data-active/section:text-foreground">
            {counts[section]}
          </span>
        </TabsTrigger>
      ))}
    </TabsList>
  )
}
