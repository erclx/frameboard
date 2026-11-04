import type { format, FormatConfig } from 'oxfmt'

import { boardPath, type FrameSource } from '@/server/checks/frame-source'
import { frameLoads } from '@/server/checks/links'
import { FrameboardError } from '@/shared/errors'

import manifest from '../../../package.json' with { type: 'json' }

/** A frame's asset link, never the tail of a longer path such as `../../assets/`. */
const BOARD_ASSETS = /(?<![\w./-])\.\.\/assets\//g

// Fixed rather than read from a project's own config, so every project's
// references diff the same way and a reference's bytes turn on oxfmt alone.
const OPTIONS: FormatConfig = {
  semi: false,
  singleQuote: true,
  printWidth: 80,
  sortPackageJson: false,
}

/**
 * What the folder holds of a board frame: its asset links moved to its
 * project's subtree, so two projects never collide, formatted so a reference
 * diffs line by line while the board file stays as the agent wrote it. The
 * write and `--check` both build through it, so they compare the same bytes.
 */
export async function toReference(
  source: FrameSource,
  reference: string,
): Promise<string> {
  const format = await importFormat()
  const result = await format(
    `${reference}.html`,
    withProjectAssets(source),
    OPTIONS,
  )
  const [error] = result.errors
  if (error) {
    // The message carries a code frame of the whole line, which for a
    // one-line thumbnail is thousands of characters.
    const [reason] = error.message.split('\n')
    throw new FrameboardError(
      'format-refused',
      `${reference} does not parse as HTML: ${reason}. Fix its board frame and sync again. Nothing written.`,
      { reference },
    )
  }
  return result.code
}

/**
 * Rewrites the frame's text only at the spans its loads occupy, so text naming
 * `../assets/` that loads nothing, such as a `<code>` sample, keeps its bytes.
 */
function withProjectAssets(source: FrameSource): string {
  const framePath = boardPath(source.root, source.path)
  const spans = new Map<number, number>()
  for (const { path, location } of frameLoads(source)) {
    if (path === framePath && location) {
      spans.set(location.startOffset, location.endOffset)
    }
  }
  let html = source.html
  // From the last span back, so each rewrite leaves the earlier offsets true.
  for (const [start, end] of [...spans].sort(([a], [b]) => b - a)) {
    const span = html
      .slice(start, end)
      .replace(BOARD_ASSETS, `../assets/${source.project}/`)
    html = `${html.slice(0, start)}${span}${html.slice(end)}`
  }
  return html
}

// A dynamic import, since oxfmt is an optional peer the other verbs never load.
async function importFormat(): Promise<typeof format> {
  try {
    const { format } = await import('oxfmt')
    return format
  } catch (error) {
    const version = manifest.peerDependencies.oxfmt
    const install = {
      npm: `npm install --save-dev oxfmt@${version}`,
      bun: `bun add --dev oxfmt@${version}`,
    }
    throw new FrameboardError(
      'formatter-not-found',
      `references sync needs oxfmt to format each reference, and it did not load from where Frameboard is installed. Install it beside Frameboard with ${install.npm}, or ${install.bun}.`,
      { install },
      { cause: error },
    )
  }
}
