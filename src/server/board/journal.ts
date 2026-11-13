import type { TokenSides } from '@/server/look/token-edit'
import type { LayoutEntry, SectionEntry } from '@/shared/records/board'

/**
 * What a board verb reports of the changes it made, so the board's undo can
 * reverse exactly those. Every path is absolute. A verb handed no journal
 * writes the folder as it always has, which is how the CLI and an agent write.
 */
export interface Journal {
  /** A frame's entry in the layout of the page folder `page`, undefined when it has none. */
  entry(
    page: string,
    frame: string,
    before: LayoutEntry | undefined,
    after: LayoutEntry | undefined,
  ): void
  /** A section's entry in the layout of the page folder `page`, undefined when it has none. */
  section(
    page: string,
    name: string,
    before: SectionEntry | undefined,
    after: SectionEntry | undefined,
  ): void
  /** The `present` key in the layout of the page folder `page`, undefined when it has none. */
  present(page: string, before: unknown, after: unknown): void
  /** The page order `project.json` holds in the project folder `project`. */
  pages(project: string, before: string[], after: string[]): void
  /** The folder, archive, and off-rule keys the `project.json` at `file` holds on each side of a hand write. */
  project(file: string, before: ProjectFiling, after: ProjectFiling): void
  /** One token's declarations in the project token sheet at `path`, on each side of a hand edit that already wrote it. */
  token(path: string, name: string, before: TokenSides, after: TokenSides): void
  /** Renames `from` to `to`, in place of the verb's own rename. */
  moved(from: string, to: string): Promise<void>
  /** A file or folder the verb just created, whose content an undo checks before removing it. */
  created(path: string): Promise<void>
  /** Takes the path out of the board where an undo can bring it back, in place of the verb's `rm`. */
  removed(path: string): Promise<void>
}

/**
 * The keys a hand write sets in `project.json`, being a filing's `group` and
 * `archived` and the `checks.off` a rule switch writes, each present only
 * where the file holds it, so an absent key and a written one never read as
 * equal.
 */
export interface ProjectFiling {
  group?: unknown
  archived?: unknown
  /** The file's `checks.off` as written, whatever its type. */
  off?: unknown
}

export interface JournalOptions {
  journal?: Journal
}
