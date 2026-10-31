import { useRef } from 'react'

import { useLive } from '@/client/live/store'
import {
  TOKEN_GROUPS,
  type TokenRow,
  type TokenTable,
} from '@/shared/records/tokens'

import { fetchTokenTable, useTokenTable } from '../../tokens'
import { ColorRow, ValueRow } from './rows'
import { type TokenChange, writeToken } from './write'

const GROUP_TITLES: Record<TokenRow['group'], string> = {
  color: 'Color',
  radius: 'Radius',
  font: 'Font',
  other: 'Other',
}

const CODE = 'font-mono text-label font-normal text-foreground'

interface ThemeTabProps {
  project: string
  /** Reads the project's table, the API in the app. */
  load?: (project: string) => Promise<TokenTable | null>
  /** Sends one token edit, the API in the app. */
  write?: typeof writeToken
}

/** The project sheet hash an edit landed over and the hash it wrote, until the table reads the sheet again. */
interface Landed {
  over: string | null
  hash: string
}

/**
 * The Theme tab of `canon/design/tabs/theme`: the sheets it read, then the
 * project's tokens by group, each tagged Board or Project, colors with a
 * light and a dark swatch and the rest as a value. A writing tab edits a
 * value in place into the project's sheet while that sheet parses, and a
 * row the project overrides resets to the board's value. It reads the table
 * again on every board message while open, so an edited sheet shows without
 * a reload.
 */
export function ThemeTab({
  project,
  load = fetchTokenTable,
  write = writeToken,
}: ThemeTabProps) {
  const table = useTokenTable(project, load)
  const canWrite = useLive((state) => state.canWrite)
  // Edits go one at a time, each made from the sheet the last one wrote.
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const landed = useRef<Landed | null>(null)

  if (table === undefined) return null
  if (table === null) {
    return (
      <p className="m-3 text-muted-foreground">
        The tokens did not load. Reload the board to try again.
      </p>
    )
  }
  if (table.sheets.length === 0) return <NoTokens />

  const boardSheet = table.sheets.find((sheet) => sheet.kind === 'board')
  const projectSheet = table.sheets.find((sheet) => sheet.kind === 'project')
  const editable = canWrite && (projectSheet?.error ?? null) === null
  const readHash = projectSheet?.hash ?? null

  const onWrite = (change: TokenChange): Promise<boolean> => {
    const run = queue.current.then(async () => {
      const held = landed.current
      const hash = held && held.over === readHash ? held.hash : readHash
      const result = await write(project, hash, change)
      if (result) landed.current = { over: readHash, hash: result.hash }
      return result !== null
    })
    queue.current = run
    return run
  }

  return (
    <div className="flex flex-col pb-2">
      <p className="mx-3 mt-1 mb-2 rounded-lg bg-muted px-2.5 py-2 leading-[1.45] text-muted-foreground">
        From{' '}
        {boardSheet ? (
          <>
            board <code className={CODE}>{boardSheet.path}</code>
            {projectSheet ? ', overridden by ' : null}
          </>
        ) : null}
        {projectSheet ? (
          <>
            project <code className={CODE}>{projectSheet.path}</code>
          </>
        ) : null}
        .{editable ? ' Click a value to edit it.' : null}
      </p>
      {table.sheets
        .filter((sheet) => sheet.error !== null)
        .map((sheet) => (
          <p
            key={sheet.path}
            role="alert"
            className="mx-3 mb-2 leading-[1.45] text-destructive"
          >
            <code className={CODE}>{sheet.path}</code> does not parse, so its
            tokens are missing here: {sheet.error}. Fix the file or ask the
            agent.
          </p>
        ))}
      {table.tokens.length === 0 ? (
        <p className="mx-3 text-muted-foreground">
          These sheets set no tokens under :root, [data-theme], or .dark.
        </p>
      ) : null}
      {TOKEN_GROUPS.map((group) => {
        const rows = table.tokens.filter((row) => row.group === group)
        if (rows.length === 0) return null
        const Row = group === 'color' ? ColorRow : ValueRow
        return (
          <section key={group} aria-labelledby={`tokens-${group}`}>
            <h3
              id={`tokens-${group}`}
              className="px-3 pt-2.5 pb-1 text-label text-muted-foreground"
            >
              {GROUP_TITLES[group]}
            </h3>
            {group === 'color' ? <SwatchHeader /> : null}
            <ul>
              {rows.map((row) => (
                <Row
                  key={row.name}
                  row={row}
                  fromProject={row.sheet === projectSheet?.path}
                  editable={editable}
                  onWrite={onWrite}
                />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function NoTokens() {
  return (
    <div className="m-3 rounded-[10px] border border-dashed border-border p-4 leading-normal text-muted-foreground">
      <p className="mb-1 font-semibold text-foreground">No tokens yet</p>
      Frames render unstyled until a token sheet exists. Add one at{' '}
      <code className={CODE}>tokens.css</code> in this project, or in the board
      folder for every project.
    </div>
  )
}

function SwatchHeader() {
  return (
    <div
      aria-hidden
      className="grid grid-cols-[1fr_18px_18px] gap-1.5 px-3 py-1 text-center text-[10px] text-muted-foreground"
    >
      <span />
      <span>L</span>
      <span>D</span>
    </div>
  )
}
