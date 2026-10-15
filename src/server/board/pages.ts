import { existsSync } from 'node:fs'
import { cp, mkdir, rename, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { FrameboardError } from '@/shared/errors'
import { nextFreeName } from '@/shared/names'
import type { PageRecord } from '@/shared/records/list'

import {
  LOCK_SUFFIX,
  readRecord,
  TEMP_SUFFIX,
  withLocks,
  writeRecord,
} from './json-record'
import {
  assertValidName,
  matchName,
  type RefOptions,
  type ResolvedRef,
  resolvePageRef,
} from './refs'
import {
  emptyProject,
  listPageFolders,
  orderPages,
  PROJECT_FILE,
  projectSpec,
  scanPage,
} from './scan'

/** Notes belong to the page they were pinned on, so a copy starts without them. */
const NOT_COPIED = new Set(['notes.json'])

export async function addPage(
  root: string,
  ref: string,
  { index, ...options }: RefOptions & { index?: number },
): Promise<PageRecord> {
  const page = await resolvePageRef(root, ref, {
    ...options,
    allowMissing: true,
  })
  if (existsSync(page.path)) throw taken(page, page.name)
  const result = await reorder(root, page, async (order) => {
    await mkdir(page.path)
    return insert(order, page.name, index ?? order.length)
  })
  return recordOf(root, page, result)
}

export async function duplicatePage(
  root: string,
  ref: string,
  { name, ...options }: RefOptions & { name?: string },
): Promise<PageRecord> {
  const source = await resolvePageRef(root, ref, options)
  const projectDir = join(root, source.project)
  const result = await reorder(root, source, async (order) => {
    const copy = await freeName(source, projectDir, name, false)
    await cp(source.path, join(projectDir, copy), {
      recursive: true,
      errorOnExist: true,
      force: false,
      filter: (path) => isCopied(basename(path)),
    })
    return {
      name: copy,
      order: insert(order, copy, order.indexOf(source.name) + 1),
    }
  })
  return recordOf(root, source, result)
}

export async function renamePage(
  root: string,
  ref: string,
  newName: string,
  options: RefOptions,
): Promise<PageRecord> {
  const page = await resolvePageRef(root, ref, options)
  const projectDir = join(root, page.project)
  const result = await reorder(root, page, async (order) => {
    const renamed = await freeName(page, projectDir, newName, true)
    await rename(page.path, join(projectDir, renamed))
    return {
      name: renamed,
      order: order.map((name) => (name === page.name ? renamed : name)),
    }
  })
  return recordOf(root, page, result)
}

export async function movePage(
  root: string,
  ref: string,
  { index, ...options }: RefOptions & { index: number },
): Promise<PageRecord> {
  const page = await resolvePageRef(root, ref, options)
  const result = await reorder(root, page, async (order) =>
    insert(
      order.filter((name) => name !== page.name),
      page.name,
      index,
    ),
  )
  return recordOf(root, page, result)
}

export async function deletePage(
  root: string,
  ref: string,
  options: RefOptions,
): Promise<{ deleted: string }> {
  const page = await resolvePageRef(root, ref, options)
  await reorder(root, page, async (order) => {
    await rm(page.path, { recursive: true, force: true })
    return order.filter((name) => name !== page.name)
  })
  return { deleted: `${page.project}/${page.name}` }
}

/**
 * Runs one page change under the project file's lock, returning the page's
 * name after it and the order written. The file is read and
 * validated before `change` touches a folder, and written back holding exactly
 * the page folders on disk, in the order `change` returns.
 */
async function reorder(
  root: string,
  page: ResolvedRef,
  change: (
    order: string[],
  ) => Promise<string[] | { name: string; order: string[] }>,
): Promise<{ name: string; pages: string[] }> {
  const projectDir = join(root, page.project)
  const path = join(projectDir, PROJECT_FILE)
  return withLocks([path], async () => {
    const file = await readRecord(path, { ...projectSpec, empty: emptyProject })
    const current = orderPages(file.pages, await listPageFolders(projectDir))
    const changed = await change(current)
    const { name, order } = Array.isArray(changed)
      ? { name: page.name, order: changed }
      : changed
    const pages = orderPages(order, await listPageFolders(projectDir))
    await writeRecord(path, { ...file, pages })
    return { name, pages }
  })
}

async function recordOf(
  root: string,
  page: ResolvedRef,
  { name, pages }: { name: string; pages: string[] },
): Promise<PageRecord> {
  return scanPage(root, page.project, name, pages.indexOf(name))
}

/**
 * The explicit name when free and valid, else the next free copy of the
 * source's. A rename frees the source's own name, so a case-only rename runs.
 */
async function freeName(
  source: ResolvedRef,
  projectDir: string,
  name: string | undefined,
  freesSource: boolean,
): Promise<string> {
  const others = (await listPageFolders(projectDir)).filter(
    (page) => !freesSource || page !== source.name,
  )
  if (name === undefined) return nextFreeName(source.name, others)
  assertValidName('page', name)
  const holder = matchName(others, name)
  if (holder) throw taken(source, holder)
  return name
}

function insert(order: string[], name: string, index: number): string[] {
  const at = Math.max(0, Math.min(index, order.length))
  return [...order.slice(0, at), name, ...order.slice(at)]
}

function isCopied(name: string): boolean {
  return (
    !NOT_COPIED.has(name) &&
    !name.endsWith(LOCK_SUFFIX) &&
    !name.endsWith(TEMP_SUFFIX)
  )
}

function taken(page: ResolvedRef, holder: string): FrameboardError {
  return new FrameboardError(
    'name-taken',
    `Project ${page.project} already has a page ${holder}.`,
    { project: page.project, name: holder },
  )
}
