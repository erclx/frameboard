import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

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
  folder: string,
): Promise<string> {
  const format = await importFormat(folder)
  const result = await format(
    `${reference}.html`,
    withProjectAssets(source, reference),
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
 * The link climbs one folder per folder the reference sits in, to the folder's
 * `assets/`.
 */
function withProjectAssets(source: FrameSource, reference: string): string {
  const up = '../'.repeat(reference.split('/').length - 1)
  const assets = `${up}assets/${source.project}/`
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
    const span = html.slice(start, end).replace(BOARD_ASSETS, assets)
    html = `${html.slice(0, start)}${span}${html.slice(end)}`
  }
  return html
}

// A dynamic import, since oxfmt is an optional peer the other verbs never load.
// A global or `npx` copy sits outside the project, so the walk up from the
// bundle never reaches a project's own install, and the folder's walk does.
async function importFormat(folder: string): Promise<typeof format> {
  try {
    const { format } = await import('oxfmt')
    return format
  } catch {
    try {
      const path = createRequire(join(folder, 'frames.json')).resolve('oxfmt')
      const { format } = (await import(
        /* @vite-ignore */ pathToFileURL(path).href
      )) as typeof import('oxfmt')
      return format
    } catch (error) {
      const version = manifest.peerDependencies.oxfmt
      const install = {
        npm: `npm install --save-dev oxfmt@${version}`,
        bun: `bun add --dev oxfmt@${version}`,
      }
      throw new FrameboardError(
        'formatter-not-found',
        `references sync needs oxfmt to format each reference, and it found none. Install it in the project holding ${folder} with ${install.npm}, or ${install.bun}.`,
        { install },
        { cause: error },
      )
    }
  }
}
