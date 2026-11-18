interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Each frame's section, read off geometry and never stored, so no frame writer
 * keeps a member list in step.
 */
export function membersOf(
  sections: readonly { name: string; box: Box; order: number }[],
  frames: readonly { name: string; box: Box }[],
): Map<string, string> {
  const topFirst = [...sections].sort(
    (a, b) => b.order - a.order || (a.name < b.name ? 1 : -1),
  )
  const members = new Map<string, string>()
  for (const frame of frames) {
    const cx = frame.box.x + frame.box.width / 2
    const cy = frame.box.y + frame.box.height / 2
    const holder = topFirst.find(
      ({ box }) =>
        cx >= box.x &&
        cx < box.x + box.width &&
        cy >= box.y &&
        cy < box.y + box.height,
    )
    if (holder) members.set(frame.name, holder.name)
  }
  return members
}
