import { useRef } from 'react'

import { useLive } from '@/client/live/store'
import {
  TOKEN_GROUPS,
  type TokenRow,
  type TokenTable,
} from '@/shared/records/tokens'

import { LabelTip } from '../../inspector/label-tip'
import { fetchTokenTable, useTokenTable } from '../../tokens'
import { KitsSection } from './kits'
import { ColorRow, ValueRow } from './rows'
import { type TokenChange, type TokenSheet, writeToken } from './write'

const GROUP_TITLES: Record<TokenRow['group'], string> = {
  color: 'Color',
  radius: 'Radius',
  font: 'Font',
  other: 'Other',
}

const CODE =
  'font-mono text-label font-normal text-foreground [overflow-wrap:anywhere]'

interface ThemeTabProps {
  project: string
  /** Reads the project's table, the API in the app. */
  load?: (project: string) => Promise<TokenTable | null>
  /** Sends one token edit, the API in the app. */
  write?: typeof writeToken
}

/** The sheet hash an edit landed over and the hash it wrote, until the table reads the sheet again. */
interface Landed {
  over: string | null
  hash: string
}

/** The Theme tab, the project's kits above its tokens. */
export function ThemeTab(props: ThemeTabProps) {
  return (
    <>
      <KitsSection project={props.project} />
      <TokensSection {...props} />
    </>
  )
}

/**
 * The token table, editing each value into the sheet its tag names. A
 * `--tokens` sheet outside the board belongs to whatever handed it over, so
 * its rows stay read-only.
 */
function TokensSection({
  project,
  load = fetchTokenTable,
  write = writeToken,
}: ThemeTabProps) {
  const table = useTokenTable(project, load)
  const canWrite = useLive((state) => state.canWrite)
  // Edits go one at a time, each made from the sheet the last one wrote.
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const landed = useRef<Partial<Record<TokenSheet, Landed>>>({})

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
  // The table names a `--tokens` sheet outside the board by its absolute path.
  const boardOutside = boardSheet?.path.startsWith('/') ?? false
  const editable: Record<TokenSheet, boolean> = {
    project: canWrite && (projectSheet?.error ?? null) === null,
    board:
      canWrite &&
      boardSheet !== undefined &&
      boardSheet.error === null &&
      !boardOutside,
  }
  const readHash: Record<TokenSheet, string | null> = {
    project: projectSheet?.hash ?? null,
    board: boardSheet?.hash ?? null,
  }

  const writerFor =
    (sheet: TokenSheet) =>
    (change: TokenChange): Promise<boolean> => {
      const run = queue.current.then(async () => {
        const read = readHash[sheet]
        const held = landed.current[sheet]
        const hash = held && held.over === read ? held.hash : read
        const result = await write(project, hash, { ...change, sheet })
        if (result) {
          landed.current = {
            ...landed.current,
            [sheet]: { over: read, hash: result.hash },
          }
        }
        return result !== null
      })
      queue.current = run
      return run
    }
  const onWrite = { project: writerFor('project'), board: writerFor('board') }

  const readOnly = canWrite && boardOutside
  const sourceLine = [
    `From ${[
      boardSheet ? `board ${fileName(boardSheet.path)}` : null,
      projectSheet
        ? `${boardSheet ? 'overridden by ' : ''}project ${fileName(projectSheet.path)}`
        : null,
    ]
      .filter(Boolean)
      .join(', ')}`,
    readOnly ? 'read only' : null,
  ]
    .filter(Boolean)
    .join(', ')
  const sourceTip = [
    table.sheets.map((sheet) => `${sheet.path}.`).join(' '),
    editable.project || editable.board ? 'Click a value to edit it.' : null,
    readOnly
      ? 'Board values stay read-only here, since that sheet sits outside the board folder.'
      : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="flex flex-col pb-2">
      <LabelTip
        label="token source"
        tip={sourceTip}
        tipId="theme-source-tip"
        className="mx-3 mt-1 mb-2 text-muted-foreground"
      >
        <span id="theme-source" className="min-w-0 [overflow-wrap:anywhere]">
          {sourceLine}
        </span>
      </LabelTip>
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
              {rows.map((row) => {
                const sheet: TokenSheet =
                  row.sheet === projectSheet?.path ? 'project' : 'board'
                return (
                  <Row
                    key={row.name}
                    row={row}
                    fromProject={sheet === 'project'}
                    editable={editable[sheet]}
                    onWrite={onWrite[sheet]}
                  />
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

/** The last segment of a sheet path, which names the file where the full path would crowd a line. */
function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
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
