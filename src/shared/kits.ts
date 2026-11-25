import { isValidName } from './names'

/**
 * The names a design kit's folder of plain files is laid out by, installed so
 * the frame route imports `assets/kit/` after the token sheets.
 */
export const KIT_FILE = 'kit.json'
export const KIT_SHEET = 'kit.css'
export const KIT_NOTE = 'kit.md'
/** The sample page's folder in a kit, and the page it installs as. */
export const KIT_PAGE = 'kit'
/** The folder under a project's `assets/` an installed kit's files sit in. */
export const KIT_ASSETS = 'kit'
/** The folder under a project's `assets/` holding each kit it added, one folder per kit. */
export const PROJECT_KITS = 'kits'
/** The dot folder in a board holding the kits saved from its projects, which home never lists as a project. */
export const KITS_FOLDER = '.kits'

/**
 * Where the board serves a kit's files, under `/frameboard/`, since a bare
 * `/kits` would shadow the client's module folder under the dev server.
 */
export const KITS_URL = '/frameboard/kits'

/** The word `frame kit` takes in place of a kit to clear the frame's, so a project kit by this name is set over the route alone. */
export const NO_KIT_WORD = 'none'

/** The kits the tool ships, in the order a picker shows them. */
export const SHIPPED_KITS = ['clean', 'sketch', 'wireframe'] as const

/**
 * The project kit a layout entry's `kit` names, null for none, a value of
 * another type, or a name that could leave the project's kits folder.
 */
export function kitOf(value: unknown): string | null {
  return typeof value === 'string' && isValidName(value) ? value : null
}

/** Where a listed kit comes from: the tool's own, or one saved into this board's kits folder. */
export type KitSource = 'shipped' | 'board'

/** One kit as `kit list` and `GET /api/kits` answer it. */
export interface KitRecord {
  /** The kit's folder name, which `kit add` and the install route take. */
  name: string
  title: string
  description: string
  source: KitSource
  /** The sample frame a preview card renders, at the size its page lays it out, or null for a kit with none. */
  preview: { frame: string; width: number; height: number } | null
}

/** What installing a kit answers, on the route and the verb alike. */
export interface KitInstallRecord {
  project: string
  kit: string
  /** Every file and folder the install wrote, absolute. */
  written: string[]
  /** True only where the copy took the place of a kit the project held. */
  replaced?: true
}

/** What removing a kit from a project answers, on the route and the verb alike. */
export interface KitRemoveRecord {
  project: string
  kit: string
  /** The ref of every frame that named the kit and now names none, in page then frame order. */
  frames: string[]
}

/** What saving a project as a kit answers. */
export interface KitSaveRecord {
  project: string
  kit: string
  /** The saved kit's folder, absolute. */
  path: string
}
