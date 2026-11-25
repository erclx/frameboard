import { useLive } from '@/client/live/store'
import type { TokenRow, TokenTable } from '@/shared/records/tokens'

import { LabelTip } from '../../inspector/label-tip'
import { ColorRow, ValueRow } from './rows'
import { SectionHead } from './section-head'
import { fileName, TOKEN_TITLES } from './token-names'
import type { SheetWriter } from './token-writer'
import type { TokenSheet } from './write'

const CODE =
  'font-mono text-label font-normal text-foreground [overflow-wrap:anywhere]'

interface TokensSectionProps {
  group: TokenRow['group']
  /** The project's table, undefined while it reads and null when the read failed. */
  table: TokenTable | null | undefined
  writer: SheetWriter
}

/**
 * One group of the token table, editing each value into the sheet its tag
 * names. A `--tokens` sheet outside the board belongs to whatever handed it
 * over, so its rows stay read-only.
 */
export function TokensSection({ group, table, writer }: TokensSectionProps) {
  const heading = `tokens-${group}`
  return (
    <section aria-labelledby={heading} className="flex flex-col gap-3">
      <SectionHead id={heading} title={TOKEN_TITLES[group].title} />
      <TokensBody group={group} table={table} writer={writer} />
    </section>
  )
}

function TokensBody({ group, table, writer }: TokensSectionProps) {
  const canWrite = useLive((state) => state.canWrite)

  if (table === undefined) return null
  if (table === null) {
    return (
      <p className="text-muted-foreground">
        The tokens did not load. Reload the board to try again.
      </p>
    )
  }
  if (table.sheets.length === 0) return <NoTokens />

  const boardSheet = table.sheets.find((sheet) => sheet.kind === 'board')
  const projectSheet = table.sheets.find((sheet) => sheet.kind === 'project')
  const broken = table.sheets.filter((sheet) => sheet.error !== null)
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
  const onWrite = { project: writer('project'), board: writer('board') }
  const rows = table.tokens.filter((row) => row.group === group)
  const Row = group === 'color' ? ColorRow : ValueRow

  return (
    <>
      <SheetSource
        table={table}
        editable={editable.project || editable.board}
        readOnly={canWrite && boardOutside}
      />
      {broken.map((sheet) => (
        <p
          key={sheet.path}
          role="alert"
          className="leading-[1.45] text-destructive"
        >
          <code className={CODE}>{sheet.path}</code> does not parse, so its
          tokens are missing here: {sheet.error}. Fix the file or ask the agent.
        </p>
      ))}
      {rows.length === 0 && broken.length === 0 ? (
        <p className="text-muted-foreground">
          {table.tokens.length === 0
            ? 'These sheets set no tokens under :root, [data-theme], or .dark.'
            : `These sheets set no ${TOKEN_TITLES[group].none}.`}
        </p>
      ) : null}
      {rows.length > 0 ? (
        <div className="@container">
          {group === 'color' ? <ThemeHeader /> : null}
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
        </div>
      ) : null}
      {canWrite ? null : (
        <p className="text-muted-foreground">
          View only, so values can’t be changed here.
        </p>
      )}
    </>
  )
}

/** Which sheets the values come from, their full paths and what they take in the help mark. */
function SheetSource({
  table,
  editable,
  readOnly,
}: {
  table: TokenTable
  editable: boolean
  readOnly: boolean
}) {
  const boardSheet = table.sheets.find((sheet) => sheet.kind === 'board')
  const projectSheet = table.sheets.find((sheet) => sheet.kind === 'project')
  const line = [
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
  const tip = [
    table.sheets.map((sheet) => `${sheet.path}.`).join(' '),
    editable ? 'Click a value to edit it.' : null,
    readOnly
      ? 'Board values stay read-only here, since that sheet sits outside the board folder.'
      : null,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <LabelTip
      label="token source"
      tip={tip}
      tipId="theme-source-tip"
      className="relative text-muted-foreground"
    >
      <span id="theme-source" className="min-w-0 [overflow-wrap:anywhere]">
        {line}
      </span>
    </LabelTip>
  )
}

function NoTokens() {
  return (
    <div className="rounded-[10px] border border-dashed border-border p-4 leading-normal text-muted-foreground">
      <p className="mb-1 font-semibold text-foreground">No tokens yet</p>
      Frames render unstyled until a token sheet exists. Add one at{' '}
      <code className={CODE}>tokens.css</code> in this project, or in the board
      folder for every project.
    </div>
  )
}

/** The columns a color row's two values sit under. */
function ThemeHeader() {
  return (
    <div
      aria-hidden
      className="grid grid-cols-2 gap-x-3 pb-1 text-label text-muted-foreground @lg:grid-cols-[minmax(0,1fr)_10rem_10rem]"
    >
      <span className="hidden @lg:block" />
      <span>Light</span>
      <span>Dark</span>
    </div>
  )
}
