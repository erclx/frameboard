interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Each frame's section, by name, keyed by frame name. A frame belongs to the
 * topmost section holding its center, the left and top edges inside and the
 * right and bottom outside, so two sections sharing an edge never both claim
 * it. Membership is read off geometry and never stored, so no frame writer
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
