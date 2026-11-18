import { constants, existsSync } from 'node:fs'
import { copyFile, cp, mkdir, rm } from 'node:fs/promises'
import { basename, join, relative } from 'node:path'

import type { JournalOptions } from '@/server/board/journal'
import { isCode } from '@/server/board/json-record'
import { isCopied } from '@/server/board/pages'
import { resolveProject } from '@/server/board/refs'
import { tokenSheetPaths } from '@/server/checks/tokens'
import { ASSETS_FOLDER, TOKEN_FILE } from '@/shared/board-files'
import { FrameboardError } from '@/shared/errors'
import { KIT_ASSETS, KIT_PAGE, type KitInstallRecord } from '@/shared/kits'

import { type FoundKit, readKitFile } from './list'

interface InstallOptions extends JournalOptions {
  /** The `--tokens` sheet a server was given, null for none, or absent to read the address file. */
  tokens?: string | null
  /**
   * Installs over the project's own look. An undo-recording caller takes it out
   * as its own step first, since one step cannot take out and rewrite a path.
   */
  replace?: boolean
}

/**
 * Takes the project's own look out, being its `tokens.css`, its `kit` page,
 * and its `assets/kit/`, each that exists, through the journal where one is
 * given so an undo brings them back, and answers the paths taken.
 */
export async function takeOutLook(
  root: string,
  ref: string,
  { journal }: JournalOptions = {},
): Promise<string[]> {
  const project = await resolveProject(root, ref)
  const taken: string[] = []
  for (const old of lookPaths(project.path)) {
    if (!existsSync(old)) continue
    if (journal) await journal.removed(old)
    else await rm(old, { recursive: true })
    taken.push(old)
  }
  return taken
}

/** The project's sheet, kit page, and kit files, the paths an install writes. */
function lookPaths(projectPath: string): string[] {
  return [
    join(projectPath, TOKEN_FILE),
    join(projectPath, KIT_PAGE),
    join(projectPath, ASSETS_FOLDER, KIT_ASSETS),
  ]
}

/**
 * Installs a kit into a project, refusing without `replace` where a sheet
 * already reaches it, so a kit never writes under a chosen look, and writing
 * nothing on any refusal.
 */
export async function installKit(
  root: string,
  ref: string,
  kit: Pick<FoundKit, 'name' | 'path'>,
  { tokens, journal, replace = false }: InstallOptions = {},
): Promise<KitInstallRecord> {
  const project = await resolveProject(root, ref)
  const sheet = join(project.path, TOKEN_FILE)
  const assets = join(project.path, ASSETS_FOLDER)
  const kitAssets = join(assets, KIT_ASSETS)
  const page = join(project.path, KIT_PAGE)

  if (!replace) {
    const sheets = tokenSheetPaths(root, project.name, tokens)
    const existing = sheets.project ?? sheets.board
    if (existing) refuseSheet(project.name, existing)
    for (const taken of [page, kitAssets]) {
      if (existsSync(taken)) {
        throw new FrameboardError(
          'name-taken',
          `${project.name} already holds ${relative(project.path, taken)}, so no kit was installed.`,
          { project: project.name, path: taken },
        )
      }
    }
  }
  await readKitFile(kit)

  if (replace) await takeOutLook(root, project.name, { journal })

  try {
    await copyFile(join(kit.path, TOKEN_FILE), sheet, constants.COPYFILE_EXCL)
  } catch (error) {
    if (isCode(error, 'EEXIST')) refuseSheet(project.name, sheet)
    throw error
  }
  await journal?.created(sheet)
  const written = [sheet]

  const assetsMade = !existsSync(assets)
  await mkdir(assets, { recursive: true })
  await cp(kit.path, kitAssets, {
    recursive: true,
    errorOnExist: true,
    force: false,
    filter: (path) => isKitAsset(kit.path, path),
  })
  await journal?.created(assetsMade ? assets : kitAssets)
  written.push(kitAssets)

  const samples = join(kit.path, KIT_PAGE)
  if (existsSync(samples)) {
    await cp(samples, page, {
      recursive: true,
      errorOnExist: true,
      force: false,
      filter: (path) => isCopied(basename(path)),
    })
    await journal?.created(page)
    written.push(page)
  }

  return { project: project.name, kit: kit.name, written }
}

/** Whether a path in the kit folder goes under `assets/kit/`, being anything but the token sheet and the sample page. */
function isKitAsset(kitPath: string, path: string): boolean {
  const inside = relative(kitPath, path)
  if (inside === '') return true
  const [top = '', ...rest] = inside.split('/')
  if (rest.length === 0 && (top === TOKEN_FILE || top === KIT_PAGE)) {
    return false
  }
  return !top.startsWith('.') && isCopied(basename(path))
}

function refuseSheet(project: string, sheet: string): never {
  throw new FrameboardError(
    'tokens-exist',
    `${project} already renders with the token sheet ${sheet}, so no kit was installed.`,
    { project, sheet },
  )
}
