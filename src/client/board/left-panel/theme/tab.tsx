import { type ComponentProps, useRef } from 'react'

import { useLive } from '@/client/live/store'
import type { ProjectKitRecord } from '@/shared/records/list'
import { TOKEN_GROUPS, type TokenTable } from '@/shared/records/tokens'

import {
  fetchInstalledFonts,
  type InstalledFontsRead,
  useInstalledFonts,
} from '../../assets/sourcing'
import { fetchTokenTable, useTokenTable } from '../../tokens'
import { ThemeCards } from './cards'
import { ThemeDialog } from './dialog'
import type { ThemeCounts, ThemeOpener } from './dialog-store'
import { familyRows } from './families'
import { FontFaces } from './fonts'
import { useTokenWriter } from './token-writer'
import type { writeToken } from './write'

const NO_KITS: readonly ProjectKitRecord[] = []

interface ThemeTabProps extends Pick<
  ComponentProps<typeof ThemeDialog>,
  'fontCalls' | 'kitCalls'
> {
  project: string
  /** Reads the project's table, the API in the app. */
  load?: (project: string) => Promise<TokenTable | null>
  /** Reads the project's installed fonts, the API in the app. */
  loadFonts?: InstalledFontsRead
  /** Sends one token edit, the API in the app. */
  write?: typeof writeToken
}

/** The Theme tab, a card per part of the project's look over the dialog that edits them. */
export function ThemeTab(props: ThemeTabProps) {
  // Keyed by project, so no read, search, or landed hash carries into another project.
  return <ProjectTheme key={props.project} {...props} />
}

function ProjectTheme({
  project,
  load = fetchTokenTable,
  loadFonts = fetchInstalledFonts,
  write,
  fontCalls,
  kitCalls,
}: ThemeTabProps) {
  const table = useTokenTable(project, load)
  const fonts = useInstalledFonts(project, loadFonts)
  const kits =
    useLive(
      (state) =>
        state.board?.projects.find(({ name }) => name === project)?.kits,
    ) ?? NO_KITS
  const writer = useTokenWriter(project, table, write)
  const openers = useRef<Partial<Record<ThemeOpener, HTMLElement | null>>>({})

  const counts: ThemeCounts = {
    kits: kits.length,
    fonts: fonts === undefined ? null : familyRows(fonts?.fonts ?? []).length,
    ...groupCounts(table),
  }
  return (
    <>
      <FontFaces list={fonts} />
      <ThemeCards
        counts={counts}
        kits={kits}
        fonts={fonts}
        table={table}
        openerRef={(opener) => (element) => {
          openers.current[opener] = element
        }}
      />
      <ThemeDialog
        project={project}
        counts={counts}
        fonts={fonts}
        table={table}
        writer={writer}
        fontCalls={fontCalls}
        kitCalls={kitCalls}
        openerOf={(opener) => openers.current[opener] ?? null}
      />
    </>
  )
}

function groupCounts(
  table: TokenTable | null | undefined,
): Record<(typeof TOKEN_GROUPS)[number], number | null> {
  const countOf = (group: (typeof TOKEN_GROUPS)[number]) =>
    table ? table.tokens.filter((row) => row.group === group).length : null
  return {
    color: countOf('color'),
    radius: countOf('radius'),
    font: countOf('font'),
    other: countOf('other'),
  }
}
