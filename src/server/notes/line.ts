/** How much of a note's text the line carries, the rest read through `notes`. */
export const LINE_TEXT_MAX = 200

export interface LineInput {
  id: string
  /** The frame ref, `<project>/<page>/<frame>`. */
  ref: string
  /** The element index while the note's anchor still holds, else null. */
  element: number | null
  /** The newest developer message in the thread. */
  text: string
}

/**
 * The one line a follower prints per note. It opens with `frameboard note`,
 * which the skill tells the agent to act on, and names the verbs that answer
 * it. Text is collapsed onto one line, stripped of control characters so it
 * cannot drive the terminal, and cut at 200 characters.
 */
export function noteLine({ id, ref, element, text }: LineInput): string {
  const where = element === null ? ref : `${ref} element ${element}`
  return `frameboard note ${id} on ${where}: ${collapse(text)} (reply: frameboard notes reply ${id} "<text>", close: frameboard notes done ${id})`
}

function collapse(text: string): string {
  const flat = text
    .replace(/\s+/g, ' ')
    // oxlint-disable-next-line no-control-regex -- removing them is the point
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .trim()
  return flat.length > LINE_TEXT_MAX
    ? `${flat.slice(0, LINE_TEXT_MAX)}...`
    : flat
}
