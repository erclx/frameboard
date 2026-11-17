import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { z } from 'zod'

import { isCode, readRecord } from '@/server/board/json-record'
import { layoutSpec } from '@/server/board/scan'
import { TOKEN_FILE } from '@/shared/board-files'
import { FrameboardError } from '@/shared/errors'
import {
  KIT_FILE,
  KIT_PAGE,
  type KitRecord,
  KITS_FOLDER,
  type KitSource,
  SHIPPED_KITS,
} from '@/shared/kits'
import { isValidName, NAME_PATTERN, TITLE_MAX_LENGTH } from '@/shared/names'

export const kitFileSchema = z.looseObject({
  version: z.literal(1),
  title: z.string().min(1).max(TITLE_MAX_LENGTH),
  description: z.string().max(TITLE_MAX_LENGTH),
  /** The frame in the kit's page a preview card renders. */
  preview: z.string().regex(NAME_PATTERN).optional(),
})

export type KitFile = z.infer<typeof kitFileSchema>

/** A kit found on disk, ahead of reading its `kit.json`. */
export interface FoundKit {
  name: string
  source: KitSource
  /** The kit's folder, absolute. */
  path: string
}

/**
 * The folder the shipped kits are read from. A built run reads the `kits`
 * folder the build put beside the bundle, and a source run reads them where
 * they are written, beside this module.
 */
export function shippedKitsDir(moduleUrl: string = import.meta.url): string {
  return fileURLToPath(
    new URL(moduleUrl.endsWith('.ts') ? './shipped' : './kits', moduleUrl),
  )
}

/** Where a board keeps the kits saved from its projects. */
export function boardKitsDir(root: string): string {
  return join(root, KITS_FOLDER)
}

/**
 * Every kit a project can install, the shipped ones in the order a picker
 * shows them and then the board's own by name. A board kit sharing a shipped
 * kit's name is left out, since the shipped one answers to the name, and so
 * is a board kit that does not read.
 */
export async function listKits(
  root: string,
  shipped: string = shippedKitsDir(),
): Promise<KitRecord[]> {
  const found = [
    ...SHIPPED_KITS.map((name) => ({
      name,
      source: 'shipped' as const,
      path: join(shipped, name),
    })),
    ...(await boardKitNames(root))
      .filter((name) => !isShipped(name))
      .map((name) => ({
        name,
        source: 'board' as const,
        path: join(boardKitsDir(root), name),
      })),
  ]
  const read = await Promise.all(
    found.map((kit) =>
      kit.source === 'board' ? readKit(kit).catch(unreadable) : readKit(kit),
    ),
  )
  return read.filter((kit) => kit !== null)
}

/**
 * Leaves out a saved kit that does not read, such as a hand-edited
 * `kit.json` or a sample layout saved unvalidated, so one bad kit in the
 * board's folder never hides the rest. Any other failure still throws.
 */
function unreadable(error: unknown): null {
  if (error instanceof FrameboardError) return null
  throw error
}

/**
 * The kit `name` answers to, the shipped one before the board's own.
 * Refuses `kit-not-found` for a name neither holds.
 */
export function findKit(
  root: string,
  name: string,
  shipped: string = shippedKitsDir(),
): FoundKit {
  if (isValidName(name)) {
    if (isShipped(name)) {
      return { name, source: 'shipped', path: join(shipped, name) }
    }
    const saved = join(boardKitsDir(root), name)
    if (existsSync(join(saved, KIT_FILE))) {
      return { name, source: 'board', path: saved }
    }
  }
  throw new FrameboardError(
    'kit-not-found',
    `No kit is named ${name}. Run \`frameboard kit list\` for the kits this board can install.`,
    { kit: name },
  )
}

/**
 * Reads a kit's `kit.json` and its preview frame's size. Refuses
 * `kit-invalid` for a `kit.json` that does not read or a kit with no token
 * sheet, since installing one would leave a project with no look.
 */
export async function readKit(kit: FoundKit): Promise<KitRecord> {
  const file = await readKitFile(kit)
  return {
    name: kit.name,
    title: file.title,
    description: file.description,
    source: kit.source,
    preview: await previewOf(kit.path, file.preview),
  }
}

/**
 * Reads the `kit.json` of the kit folder at `kit.path`, refusing
 * `kit-invalid` as `readKit` does, for a caller holding a folder that is
 * neither shipped nor saved.
 */
export async function readKitFile(
  kit: Pick<FoundKit, 'name' | 'path'>,
): Promise<KitFile> {
  const file = await readRecord(join(kit.path, KIT_FILE), {
    schema: kitFileSchema,
    invalidCode: 'kit-invalid',
  }).catch((error: unknown) => {
    if (!isCode(error, 'ENOENT')) throw error
    throw new FrameboardError(
      'kit-invalid',
      `The kit at ${kit.path} has no ${KIT_FILE}.`,
      { kit: kit.name, path: kit.path },
    )
  })
  if (!existsSync(join(kit.path, TOKEN_FILE))) {
    throw new FrameboardError(
      'kit-invalid',
      `The kit at ${kit.path} has no ${TOKEN_FILE}.`,
      { kit: kit.name, path: kit.path },
    )
  }
  return file
}

/** The preview frame and its laid-out size, null where the kit names none or its page does not hold it. */
async function previewOf(
  kitPath: string,
  frame: string | undefined,
): Promise<KitRecord['preview']> {
  const page = join(kitPath, KIT_PAGE)
  if (frame === undefined || !existsSync(join(page, `${frame}.html`))) {
    return null
  }
  const layout = await readRecord(join(page, 'layout.json'), layoutSpec)
  const box = layout.frames[frame]
  return box ? { frame, width: box.width, height: box.height } : null
}

function isShipped(name: string): boolean {
  return (SHIPPED_KITS as readonly string[]).includes(name)
}

/** The folders in the board's kits folder holding a `kit.json`, by name. */
async function boardKitNames(root: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(boardKitsDir(root), { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        isValidName(entry.name) &&
        existsSync(join(boardKitsDir(root), entry.name, KIT_FILE)),
    )
    .map((entry) => entry.name)
    .sort()
}
