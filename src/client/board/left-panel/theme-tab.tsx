import { Fragment, useEffect, useState } from 'react'

import { useLive } from '@/client/live/store'
import {
  TOKEN_GROUPS,
  type TokenRow,
  type TokenTable,
} from '@/shared/records/tokens'

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
}

/**
 * The Theme tab of `canon/design/tabs/theme`: the sheets it read, then the
 * project's tokens by group, colors with a light and a dark swatch and the
 * rest as text. It reads the table again on every board message while
 * open, so an edited sheet shows without a reload.
 */
export function ThemeTab({ project, load = fetchTokenTable }: ThemeTabProps) {
  const table = useTokenTable(project, load)
  if (table === undefined) return null
  if (table === null) {
    return (
      <p className="m-3 text-muted-foreground">
        The tokens did not load. Reload the board to try again.
      </p>
    )
  }
  if (table.sheets.length === 0) return <NoTokens />

  return (
    <div className="flex flex-col pb-2">
      <p className="mx-3 mt-1 mb-2 rounded-lg bg-muted px-2.5 py-2 leading-[1.45] text-muted-foreground">
        From{' '}
        {table.sheets.map((sheet, index) => (
          <Fragment key={sheet.path}>
            {index > 0 ? ' and ' : null}
            <code className={CODE}>{sheet.path}</code>
          </Fragment>
        ))}
        , read-only. Edit the file or ask the agent.
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
              {rows.map((row) =>
                group === 'color' ? (
                  <ColorRow key={row.name} row={row} />
                ) : (
                  <ValueRow key={row.name} row={row} />
                ),
              )}
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
      className="grid grid-cols-[1fr_18px_18px] gap-1.5 px-3 py-1 text-center text-[10px] text-faint"
    >
      <span />
      <span>L</span>
      <span>D</span>
    </div>
  )
}

function ColorRow({ row }: { row: TokenRow }) {
  return (
    <li className="mx-1.5 grid h-7 grid-cols-[1fr_18px_18px] items-center gap-1.5 rounded-md px-1.5">
      <TokenName name={row.name} />
      <Swatch theme="Light" value={row.light} />
      <Swatch theme="Dark" value={row.dark} />
    </li>
  )
}

function ValueRow({ row }: { row: TokenRow }) {
  const value = shownValue(row)
  return (
    <li className="mx-1.5 grid h-7 grid-cols-[1fr_auto] items-center gap-1.5 rounded-md px-1.5">
      <TokenName name={row.name} />
      <span className="max-w-32 truncate text-muted-foreground" title={value}>
        {value}
      </span>
    </li>
  )
}

function TokenName({ name }: { name: string }) {
  return (
    <span className="truncate" title={name}>
      <span className="text-faint">--</span>
      {name.replace(/^--/, '')}
    </span>
  )
}

function Swatch({ theme, value }: { theme: string; value: string | null }) {
  if (value === null) {
    return (
      <span
        role="img"
        aria-label={`${theme}: not set`}
        title={`Not set in ${theme.toLowerCase()}`}
        className="size-4 rounded-[4px] border border-dashed border-faint"
      />
    )
  }
  return (
    <span
      role="img"
      aria-label={`${theme}: ${value}`}
      title={value}
      className="size-4 rounded-[4px] shadow-[inset_0_0_0_1px_rgba(127,127,127,.35)]"
      style={{ background: value }}
    />
  )
}

/** The light value, else the dark, with a font stack shown by its first family. */
function shownValue(row: TokenRow): string {
  const value = row.light ?? row.dark ?? ''
  if (row.group !== 'font') return value
  return (
    value
      .split(',')[0]
      ?.trim()
      .replace(/^["']|["']$/g, '') ?? value
  )
}

/**
 * The project's token table, read again on every board message, which every
 * watched batch sends. Undefined while the first read runs and null when it
 * fails, and a slower earlier read never replaces a later one.
 */
function useTokenTable(
  project: string,
  load: (project: string) => Promise<TokenTable | null>,
): TokenTable | null | undefined {
  const board = useLive((state) => state.board)
  const [table, setTable] = useState<TokenTable | null | undefined>()

  useEffect(() => {
    let current = true
    void load(project)
      .catch(() => null)
      .then((next) => {
        if (current) setTable(next)
      })
    return () => {
      current = false
    }
  }, [project, board, load])

  return table
}

async function fetchTokenTable(project: string): Promise<TokenTable | null> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(project)}/tokens`,
  )
  const body = (await response.json()) as TokensBody
  return body.ok ? body.data : null
}

type TokensBody = { ok: true; data: TokenTable } | { ok: false }
