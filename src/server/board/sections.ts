import { join } from 'node:path'

import { FrameboardError } from '@/shared/errors'
import { nextFreeName } from '@/shared/names'
import type { SectionRecord } from '@/shared/records/list'

import { layoutAt, withLayouts } from './frames'
import type { JournalOptions } from './journal'
import {
  assertValidName,
  matchName,
  type RefOptions,
  type ResolvedRef,
  resolvePageRef,
} from './refs'
import { type Box, readPageOrder, scanPage } from './scan'

/** The name a section takes when the developer gives none, `-2` and on once taken. */
const DEFAULT_NAME = 'section'

/**
 * Writes a named box on top of the page's sections. It writes no frame entry,
 * since a frame belongs to whichever section holds its center.
 */
export async function addSection(
  root: string,
  pageRef: string,
  {
    name,
    box,
    journal,
    ...options
  }: RefOptions & JournalOptions & { name?: string; box: Box },
): Promise<SectionRecord> {
  const page = await resolvePageRef(root, pageRef, options)
  const added = await withLayouts(
    [page.path],
    async (layouts) => {
      const layout = layoutAt(layouts, page.path)
      const taken = layout.sectionNames()
      const free = name === undefined ? nextFreeName(DEFAULT_NAME, taken) : name
      if (name !== undefined) assertFree(taken, name)
      layout.setSection(free, { ...box, order: layout.topSectionOrder() })
      return free
    },
    journal,
  )
  return sectionRecord(root, page, added)
}

export async function renameSection(
  root: string,
  pageRef: string,
  name: string,
  newName: string,
  { journal, ...options }: RefOptions & JournalOptions,
): Promise<SectionRecord> {
  const page = await resolvePageRef(root, pageRef, options)
  await withLayouts(
    [page.path],
    async (layouts) => {
      const layout = layoutAt(layouts, page.path)
      const entry = layout.section(name)
      if (!entry) throw notFound(page, name)
      if (newName === name) return
      assertFree(
        layout.sectionNames().filter((held) => held !== name),
        newName,
      )
      layout.removeSection(name)
      // The entry travels whole, so keys a newer writer added survive the rename.
      layout.file.sections = { ...layout.file.sections, [newName]: entry }
      layout.setSection(newName, entry)
    },
    journal,
  )
  return sectionRecord(root, page, newName)
}

/** Removes the box alone, leaving every frame it held where it stands. */
export async function deleteSection(
  root: string,
  pageRef: string,
  name: string,
  { journal, ...options }: RefOptions & JournalOptions,
): Promise<{ deleted: string }> {
  const page = await resolvePageRef(root, pageRef, options)
  await withLayouts(
    [page.path],
    async (layouts) => {
      const layout = layoutAt(layouts, page.path)
      if (!layout.section(name)) throw notFound(page, name)
      layout.removeSection(name)
    },
    journal,
  )
  return { deleted: name }
}

function assertFree(taken: string[], name: string): void {
  assertValidName('section', name)
  const holder = matchName(taken, name)
  if (holder) {
    throw new FrameboardError(
      'name-taken',
      `The page already has a section ${holder}.`,
      { name, taken: holder },
    )
  }
}

function notFound(page: ResolvedRef, name: string): FrameboardError {
  const ref = `${page.project}/${page.name}`
  return new FrameboardError(
    'section-not-found',
    `No section ${name} on ${ref}.`,
    { page: ref, name },
  )
}

async function sectionRecord(
  root: string,
  page: ResolvedRef,
  name: string,
): Promise<SectionRecord> {
  const { pages } = await readPageOrder(join(root, page.project))
  const scanned = await scanPage(
    root,
    page.project,
    page.name,
    pages.indexOf(page.name),
  )
  const section = scanned.sections.find((candidate) => candidate.name === name)
  if (!section) throw new Error(`Section ${name} vanished from ${page.name}.`)
  return section
}
