import { inLandingOrder } from '@/client/live/unseen'
import type { FrameChange } from '@/shared/records/changes'

export interface ToastCopy {
  /** The agent's initial, absent when no claim named who wrote. */
  initial: string | null
  title: string
  detail: string
  /** Show is offered, which it is not while the one change glows on screen. */
  show: boolean
  /** Previous and Next are offered, which they are once several frames changed. */
  next: boolean
  /**
   * The width agents/unseen-one and claim-full draw each form at, and
   * unseen-many's 380 widened by the Previous button it predates.
   */
  width: 300 | 340 | 460
}

/**
 * What the toast says. One frame names the frame and how many of its
 * elements changed, several name how many frames on how many pages and
 * which one the toast is on. An unclaimed change names no agent, since a
 * wrong name is worse than none.
 */
export function toastCopy(
  unseen: Readonly<Record<string, FrameChange>>,
  current: FrameChange,
  glowing: boolean,
): ToastCopy {
  const ordered = inLandingOrder(unseen)
  const count = ordered.length
  if (count <= 1) {
    const agent = current.author?.agent ?? null
    const name = current.frame.split('/').at(-1) ?? current.frame
    // A whole-frame change glows once, so it counts once.
    const changes = current.whole ? 1 : Math.max(current.elements.length, 1)
    const counted = `${changes} ${changes === 1 ? 'change' : 'changes'}`
    return {
      initial: initialOf(agent),
      title: agent
        ? `${capitalized(agent)} updated ${name}`
        : `${name} changed`,
      detail: glowing ? `${counted}, glowing on the frame` : counted,
      show: !glowing,
      next: false,
      width: glowing ? 300 : 340,
    }
  }
  const agents = new Set(ordered.map((change) => change.author?.agent ?? null))
  const [only] = agents
  const agent = agents.size === 1 && only ? only : null
  const pages = new Set(
    ordered.map((change) => change.frame.split('/').slice(0, 2).join('/')),
  ).size
  const at = ordered.findIndex((change) => change.id === current.id) + 1
  return {
    initial: initialOf(agent),
    title: agent
      ? `${capitalized(agent)} changed ${count} frames`
      : `${count} frames changed`,
    detail: `on ${pages} ${pages === 1 ? 'page' : 'pages'} · ${at} of ${count}`,
    show: true,
    next: true,
    width: 460,
  }
}

function capitalized(agent: string): string {
  return `${agent.charAt(0).toUpperCase()}${agent.slice(1)}`
}

function initialOf(agent: string | null): string | null {
  return agent ? agent.charAt(0).toUpperCase() : null
}
