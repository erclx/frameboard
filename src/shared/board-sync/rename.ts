import type { ListResult } from '@/shared/records/list'

/**
 * Whether `board` still waits on a rename, holding `before` and not yet
 * `after`. Both ends ask it, so a tab and the server's copy of what the tabs
 * hold take the same renames.
 */
export function takesRename(
  board: ListResult,
  before: string,
  after: string,
): boolean {
  return holdsRef(board, before) && !holdsRef(board, after)
}

export function holdsRef(board: ListResult, ref: string): boolean {
  return board.projects.some(
    (project) =>
      project.name === ref ||
      project.pages.some(
        (page) =>
          page.ref === ref || page.frames.some((frame) => frame.ref === ref),
      ),
  )
}

/**
 * The board with one project, page, or frame renamed, its path and
 * everything under it following.
 */
export function renameOnBoard(
  board: ListResult,
  before: string,
  after: string,
): ListResult {
  const [project = '', page, frame] = before.split('/')
  const name = after.split('/').at(-1) ?? after
  const repath = (from: string, to: string) => (path: string) =>
    path === from || path.startsWith(`${from}/`)
      ? `${to}${path.slice(from.length)}`
      : path
  return {
    ...board,
    projects: board.projects.map((held) => {
      if (held.name !== project) return held
      if (frame !== undefined) {
        return {
          ...held,
          pages: held.pages.map((each) =>
            each.name !== page
              ? each
              : {
                  ...each,
                  frames: each.frames.map((one) =>
                    one.ref !== before
                      ? one
                      : {
                          ...one,
                          ref: after,
                          name,
                          path: siblingPath(one.path, `${name}.html`),
                        },
                  ),
                },
          ),
        }
      }
      if (page === undefined) {
        const path = repath(held.path, siblingPath(held.path, name))
        return {
          ...held,
          name,
          path: path(held.path),
          pages: held.pages.map((each) => ({
            ...each,
            ref: `${name}/${each.name}`,
            project: name,
            path: path(each.path),
            frames: each.frames.map((frame) => ({
              ...frame,
              ref: `${name}/${each.name}/${frame.name}`,
              project: name,
              path: path(frame.path),
            })),
          })),
        }
      }
      return {
        ...held,
        pages: held.pages.map((each) => {
          if (each.name !== page) return each
          const path = repath(each.path, siblingPath(each.path, name))
          return {
            ...each,
            ref: after,
            name,
            path: path(each.path),
            frames: each.frames.map((frame) => ({
              ...frame,
              ref: `${after}/${frame.name}`,
              page: name,
              path: path(frame.path),
            })),
          }
        }),
      }
    }),
  }
}

/** The folder path beside `path` named `name`. */
function siblingPath(path: string, name: string): string {
  return `${path.slice(0, path.lastIndexOf('/') + 1)}${name}`
}
