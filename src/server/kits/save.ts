import { existsSync } from 'node:fs'
import {
  copyFile,
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { basename, join } from 'node:path'

import type { JournalOptions } from '@/server/board/journal'
import { isCopied } from '@/server/board/pages'
import { assertValidName, matchName, resolveProject } from '@/server/board/refs'
import { listFrames } from '@/server/board/scan'
import { tokenSheetPaths } from '@/server/checks/tokens'
import { ASSETS_FOLDER, TOKEN_FILE } from '@/shared/board-files'
import { FrameboardError } from '@/shared/errors'
import {
  KIT_ASSETS,
  KIT_FILE,
  KIT_NOTE,
  KIT_PAGE,
  type KitSaveRecord,
  SHIPPED_KITS,
} from '@/shared/kits'

import { boardKitsDir } from './list'

interface SaveOptions extends JournalOptions {
  /** The `--tokens` sheet a server was given, null for none, or absent to read the address file. */
  tokens?: string | null
}

/**
 * Saves a project's look as a board kit, never overwriting a taken name, and
 * renamed into place, so a refusal or a failure leaves no half-written kit.
 */
export async function saveKit(
  root: string,
  ref: string,
  name: string,
  { tokens, journal }: SaveOptions = {},
): Promise<KitSaveRecord> {
  assertValidName('kit', name)
  const project = await resolveProject(root, ref)
  const kits = boardKitsDir(root)
  const holder = matchName([...SHIPPED_KITS, ...(await savedNames(kits))], name)
  if (holder) {
    throw new FrameboardError(
      'name-taken',
      `A kit named ${holder} already exists, so ${project.name} was not saved over it.`,
      { kit: holder },
    )
  }
  const sheets = tokenSheetPaths(root, project.name, tokens)
  const sheet = sheets.project ?? sheets.board
  if (!sheet) {
    throw new FrameboardError(
      'tokens-not-found',
      `No token sheet reaches ${project.name}, so it has no look to save as a kit.`,
      { project: project.name },
    )
  }

  const path = join(kits, name)
  const staging = join(kits, `.${name}.${process.pid}.tmp`)
  await mkdir(staging, { recursive: true })
  try {
    const assets = join(project.path, ASSETS_FOLDER, KIT_ASSETS)
    // A folder holding no kit.json is hand-built and reaches no frame, so it is no part of the look.
    if (existsSync(join(assets, KIT_FILE))) {
      await cp(assets, staging, {
        recursive: true,
        filter: (from) => isCopied(basename(from)),
      })
    }
    await copyFile(sheet, join(staging, TOKEN_FILE))
    const samples = join(project.path, KIT_PAGE)
    const frames = existsSync(samples) ? await listFrames(samples) : []
    if (existsSync(samples)) {
      await cp(samples, join(staging, KIT_PAGE), {
        recursive: true,
        filter: (from) => isCopied(basename(from)),
      })
    }
    const named = await installedPreview(join(staging, KIT_FILE))
    const preview = frames.find((frame) => frame === named) ?? frames[0]
    await writeFile(
      join(staging, KIT_FILE),
      `${JSON.stringify(
        {
          version: 1,
          title: name,
          description: `Saved from ${project.name}`,
          ...(preview ? { preview } : {}),
        },
        null,
        2,
      )}\n`,
    )
    if (!existsSync(join(staging, KIT_NOTE))) {
      await writeFile(join(staging, KIT_NOTE), stubNote(name, project.name))
    }
    await rename(staging, path)
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
  await journal?.created(path)
  return { project: project.name, kit: name, path }
}

/** The note a kit saved from a project without one carries, for the developer to fill in. */
function stubNote(kit: string, project: string): string {
  return `# ${kit}

Saved from the ${project} project. Describe what an agent drawing in this look reaches for, and what it keeps to.
`
}

/** The preview the `kit.json` an install left under `assets/kit/` names, if any. */
async function installedPreview(path: string): Promise<string | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
    const preview =
      typeof parsed === 'object' && parsed !== null && 'preview' in parsed
        ? parsed.preview
        : undefined
    return typeof preview === 'string' ? preview : undefined
  } catch {
    return undefined
  }
}

async function savedNames(kits: string): Promise<string[]> {
  try {
    return (await readdir(kits)).filter((entry) => !entry.startsWith('.'))
  } catch {
    return []
  }
}
