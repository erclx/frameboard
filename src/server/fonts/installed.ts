import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { matchName, resolveProject } from '@/server/board/refs'
import { ASSETS_FOLDER } from '@/shared/board-files'
import { FrameboardError } from '@/shared/errors'
import { FONTS_FOLDER } from '@/shared/fonts'
import { isValidName } from '@/shared/names'
import {
  type FontLicenseFile,
  type FontList,
  fontsourceLicenseSchema,
  type FontWeights,
  LICENSE_FILE_SUFFIX,
} from '@/shared/records/sourcing'

import { framesByFamily } from './usage'

/** The record in an installed font's folder, which tells it from a folder a project filled by hand. */
export const FONT_RECORD = `font${LICENSE_FILE_SUFFIX}`

/** An installed family by its folder's name, with the record that folder holds. */
export interface ProjectFont {
  id: string
  record: FontLicenseFile
}

export function fontsDir(projectDir: string): string {
  return join(projectDir, ASSETS_FOLDER, FONTS_FOLDER)
}

/** Every folder a font could stand in, a hand-filled one included. */
export async function fontFolders(projectDir: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(fontsDir(projectDir), { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((entry) => entry.isDirectory() && isValidName(entry.name))
    .map((entry) => entry.name)
}

/** Whether a folder under `assets/fonts/` holds an installed font's record, read without parsing it. */
export function holdsRecord(projectDir: string, id: string): boolean {
  return existsSync(join(fontsDir(projectDir), id, FONT_RECORD))
}

/** Whether a project installed any font, cheap enough to ask on every frame load. */
export async function holdsFonts(projectDir: string): Promise<boolean> {
  return (await fontFolders(projectDir)).some((id) =>
    holdsRecord(projectDir, id),
  )
}

/** A project's installed fonts by family name, less any folder whose record does not read. */
export async function projectFonts(projectDir: string): Promise<ProjectFont[]> {
  const ids = await fontFolders(projectDir)
  const fonts = await Promise.all(
    ids.map(async (id) => {
      const record = await readFont(projectDir, id)
      return record === null ? [] : [{ id, record }]
    }),
  )
  return fonts
    .flat()
    .sort((a, b) => a.record.family.localeCompare(b.record.family))
}

async function readFont(
  projectDir: string,
  id: string,
): Promise<FontLicenseFile | null> {
  try {
    const text = await readFile(
      join(fontsDir(projectDir), id, FONT_RECORD),
      'utf8',
    )
    return fontsourceLicenseSchema.safeParse(JSON.parse(text)).data ?? null
  } catch {
    return null
  }
}

/** The installed font `id` names, refusing `font-not-found` with the ones the project holds. */
export async function heldFont(
  project: { name: string; path: string },
  id: string,
): Promise<ProjectFont> {
  const fonts = await projectFonts(project.path)
  const known = fonts.map((font) => font.id)
  const held = matchName(known, id)
  const font = fonts.find((each) => each.id === held)
  if (font) return font
  throw new FrameboardError(
    'font-not-found',
    `${project.name} has installed no font ${id}. Run \`frameboard font list --project ${project.name}\` for the ones it holds.`,
    { id, project: project.name, known },
  )
}

/**
 * The sheet a frame imports to draw in the fonts given, each under its own
 * family name, at addresses relative to the sheet so they hold behind the
 * phone link's prefix.
 */
export function fontSheet(fonts: readonly ProjectFont[]): string {
  return fonts
    .flatMap(({ id, record }) =>
      record.faces.map((face) => {
        const declared = [
          `font-family:"${record.family}"`,
          `font-style:${face.style}`,
          `font-weight:${weightOf(face.weights)}`,
          'font-display:swap',
          `src:url("${ASSETS_FOLDER}/${FONTS_FOLDER}/${id}/${face.file}") format("woff2")`,
          ...(face.unicodeRange === null
            ? []
            : [`unicode-range:${face.unicodeRange}`]),
        ]
        return `@font-face{${declared.join(';')}}`
      }),
    )
    .join('\n')
}

function weightOf({ min, max }: FontWeights): string {
  return min === max ? `${min}` : `${min} ${max}`
}

/** A project's installed fonts as `font list` answers them. */
export async function listFonts(
  root: string,
  ref: string | undefined,
): Promise<FontList> {
  const project = await resolveProject(root, ref)
  const fonts = await projectFonts(project.path)
  const frames = await framesByFamily(
    root,
    project.name,
    fonts.map((font) => font.record.family),
  )
  return {
    version: 1,
    project: project.name,
    fonts: fonts.map(({ id, record }) => ({
      id,
      family: record.family,
      category: record.category,
      license: record.license,
      licenseUrl: record.licenseUrl,
      landingUrl: record.landingUrl,
      variable: record.variable,
      weights: distinctWeights(record),
      styles: (['normal', 'italic'] as const).filter((style) =>
        record.faces.some((face) => face.style === style),
      ),
      path: `${FONTS_FOLDER}/${id}`,
      files: record.faces.length,
      frames: frames.get(record.family) ?? [],
    })),
  }
}

function distinctWeights({ faces }: FontLicenseFile): FontWeights[] {
  const byRange = new Map(
    faces.map(({ weights }) => [weightOf(weights), weights]),
  )
  return [...byRange.values()].sort((a, b) => a.min - b.min || a.max - b.max)
}
