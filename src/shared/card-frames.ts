interface CardPage<F> {
  readonly frames: readonly F[]
}

/**
 * The frames a project card draws: the visible frames of the first page
 * holding one, so a first page that is empty or all hidden passes to the
 * next. The thumbnail route stamps these, the home view asks for them, and
 * the card's skeleton draws them, so all three read this one pick.
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
