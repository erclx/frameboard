interface CardPage<F> {
  readonly frames: readonly F[]
}

/**
 * The frames a project card draws, from the first page holding a visible one,
 * shared so the route, home, and the skeleton read one pick.
 */
export function cardFrames<F extends { readonly hidden: boolean }>(project: {
  readonly pages: readonly CardPage<F>[]
}): F[] {
  for (const page of project.pages) {
    const visible = page.frames.filter((frame) => !frame.hidden)
    if (visible.length > 0) return visible
  }
  return []
}
