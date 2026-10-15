import { realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

import { FrameboardError } from '@/shared/errors'
import {
  isReservedPageName,
  isValidName,
  NAME_MAX_LENGTH,
  namesCollide,
} from '@/shared/names'

import { isCode } from './json-record'
import {
  FRAME_EXTENSION,
  listFrames,
  listPageFolders,
  listProjects,
} from './scan'

export interface ResolvedRef {
  root: string
  project: string
  page: string
  /** The page's own name for a page ref, the frame's for a frame ref. */
  name: string
  /** The page folder for a page ref, the `.html` file for a frame ref. */
  path: string
}

export interface RefOptions {
  /** `--project`, which a project named in the ref must agree with. */
  project?: string
  cwd: string
  /** Resolve a target that does not exist yet, as an add does, checking its name instead. */
  allowMissing?: boolean
}

export type NameKind = 'project' | 'page' | 'frame'

/**
 * The project a verb acts on: the one named, else the board's only project.
 * A name matching an existing project in another case resolves to that one.
 */
export async function resolveProject(
  root: string,
  project?: string,
): Promise<{ name: string; path: string }> {
  const projects = await listProjects(root)
  if (project === undefined) {
    const [only, ...others] = projects
    if (!only || others.length > 0) {
      throw new FrameboardError(
        'project-required',
        projects.length === 0
          ? 'The board has no project. Run frameboard project add <name> first.'
          : `The board has ${projects.length} projects, so pass --project <name> or a ref naming one.`,
        { projects },
      )
    }
    return { name: only, path: join(root, only) }
  }

  const name = matchName(projects, project)
  if (!name) {
    throw new FrameboardError(
      'project-not-found',
      `No project ${project} in ${root}.`,
      { project, projects },
    )
  }
  return { name, path: join(root, name) }
}

/** A page ref is `<page>` or `<project>/<page>`. */
export async function resolvePageRef(
  root: string,
  ref: string,
  options: RefOptions,
): Promise<ResolvedRef> {
  const parts = splitRef(ref, 2)
  const pageName = parts.at(-1) ?? ''
  const project = await resolveProject(
    root,
    agreeingProject(ref, parts.length === 2 ? parts[0] : undefined, options),
  )
  const page = await findPage(project.path, pageName, options.allowMissing)
  return {
    root,
    project: project.name,
    page: page.name,
    name: page.name,
    path: page.path,
  }
}

/**
 * A frame ref is `<page>/<frame>` or `<project>/<page>/<frame>`. An argument
 * ending in `.html` is instead a path against `cwd`, which must sit in a page
 * of this board.
 */
export async function resolveFrameRef(
  root: string,
  ref: string,
  options: RefOptions,
): Promise<ResolvedRef> {
  const parts = ref.endsWith(FRAME_EXTENSION)
    ? await framePathParts(root, ref, options.cwd)
    : splitRef(ref, 3)
  if (parts.length < 2) {
    throw new FrameboardError(
      'usage',
      `${ref} is not a frame ref. Write <page>/<frame>, <project>/<page>/<frame>, or a path to the .html file.`,
      { ref },
    )
  }
  const frameName = parts.at(-1) ?? ''
  const pageName = parts.at(-2) ?? ''
  const project = await resolveProject(
    root,
    agreeingProject(ref, parts.length === 3 ? parts[0] : undefined, options),
  )
  const page = await findPage(project.path, pageName, false)

  const frames = await listFrames(page.path)
  const found = matchName(frames, frameName)
  if (!found && !options.allowMissing) {
    throw new FrameboardError(
      'frame-not-found',
      `No frame ${frameName} in ${project.name}/${page.name}.`,
      { ref, frames },
    )
  }
  if (!found) assertValidName('frame', frameName)
  const name = found ?? frameName
  return {
    root,
    project: project.name,
    page: page.name,
    name,
    path: join(page.path, `${name}${FRAME_EXTENSION}`),
  }
}

/** Throws `invalid-name` for a name a new project, page, or frame may not take. */
export function assertValidName(kind: NameKind, name: string): void {
  if (!isValidName(name)) {
    throw new FrameboardError(
      'invalid-name',
      `${name} is not a valid ${kind} name. Use letters, digits, dots, dashes, and underscores, opening with a letter or digit, at most ${NAME_MAX_LENGTH} characters.`,
      { kind, name },
    )
  }
  if (kind === 'page' && isReservedPageName(name)) {
    throw new FrameboardError(
      'invalid-name',
      `${name} is reserved for the project's shared files, so a page cannot take it.`,
      { kind, name },
    )
  }
}

/** The existing name equal to `name`, else one equal in another case. */
export function matchName(names: string[], name: string): string | undefined {
  return (
    names.find((n) => n === name) ?? names.find((n) => namesCollide(n, name))
  )
}

async function findPage(
  projectDir: string,
  name: string,
  allowMissing = false,
): Promise<{ name: string; path: string }> {
  const pages = await listPageFolders(projectDir)
  const found = matchName(pages, name)
  if (!found && !allowMissing) {
    throw new FrameboardError(
      'page-not-found',
      `No page ${name} in ${projectDir}.`,
      { page: name, pages },
    )
  }
  if (!found) assertValidName('page', name)
  const resolved = found ?? name
  return { name: resolved, path: join(projectDir, resolved) }
}

function splitRef(ref: string, max: number): string[] {
  const parts = ref.split('/')
  if (parts.length > max || parts.some((part) => part === '')) {
    throw new FrameboardError(
      'usage',
      `${ref} is not a ${max === 2 ? 'page' : 'frame'} ref.`,
      { ref },
    )
  }
  return parts
}

function agreeingProject(
  ref: string,
  fromRef: string | undefined,
  { project }: RefOptions,
): string | undefined {
  if (
    fromRef !== undefined &&
    project !== undefined &&
    !namesCollide(fromRef, project)
  ) {
    throw new FrameboardError(
      'usage',
      `${ref} names project ${fromRef} but --project names ${project}.`,
      { ref, project },
    )
  }
  return fromRef ?? project
}

async function framePathParts(
  root: string,
  ref: string,
  cwd: string,
): Promise<string[]> {
  const path = resolve(cwd, ref)
  let folder = dirname(path)
  try {
    folder = await realpath(folder)
  } catch (error) {
    if (!isCode(error, 'ENOENT')) throw error
  }
  const inside = relative(root, folder)
  const parts = inside.split(sep)
  if (
    inside === '' ||
    inside.startsWith('..') ||
    isAbsolute(inside) ||
    parts.length !== 2
  ) {
    throw new FrameboardError(
      'usage',
      `${path} does not sit in a page of the board at ${root}.`,
      { path, root },
    )
  }
  const file = path.slice(dirname(path).length + 1)
  return [...parts, file.slice(0, -FRAME_EXTENSION.length)]
}
