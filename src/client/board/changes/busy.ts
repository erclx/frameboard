/** The popups that take the developer's attention, which leaves the toast viewport out. */
const POPUPS = [
  'dropdown-menu-content',
  'context-menu-content',
  'popover-content',
  'dialog-content',
]
  .map((slot) => `[data-slot="${slot}"][data-open]`)
  .join(',')

const FIELD =
  'input:not([type=button],[type=checkbox],[type=radio],[type=submit]),textarea,select,[contenteditable=""],[contenteditable="true"]'

export interface Busy {
  /** Whether a field has focus, a pointer is held down, or a menu, popover, or palette is open. */
  busy: () => boolean
  /** Calls back once, the first time nothing is busy, and returns the function that cancels it. */
  whenIdle: (run: () => void) => () => void
  /** Stops listening. */
  dispose: () => void
}

/**
 * Reads whether the developer is mid-action on the page. The held pointer
 * stands in for a drag and clears on release, cancel, and window blur, so a
 * button let go outside the window cannot hold the board busy.
 */
export function watchBusy(doc: Document = document): Busy {
  const win = doc.defaultView ?? window
  const waiting = new Set<() => void>()
  let pointer = false
  let check: ReturnType<typeof setTimeout> | undefined

  const busy = () =>
    pointer ||
    (doc.activeElement?.matches(FIELD) ?? false) ||
    doc.querySelector(POPUPS) !== null

  // Focus has not moved yet inside `focusout`, so the read waits a turn.
  const settle = () => {
    clearTimeout(check)
    check = setTimeout(() => {
      if (busy()) return
      for (const run of [...waiting]) {
        waiting.delete(run)
        run()
      }
    })
  }
  const press = () => {
    pointer = true
  }
  const release = () => {
    pointer = false
    settle()
  }

  const watch: [EventTarget, string, EventListener][] = [
    [doc, 'pointerdown', press],
    [doc, 'pointerup', release],
    [doc, 'pointercancel', release],
    [win, 'blur', release],
    [doc, 'focusout', settle],
  ]
  for (const [target, type, listener] of watch)
    target.addEventListener(type, listener, true)
  const mutations = new MutationObserver(settle)
  mutations.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-open'],
  })

  return {
    busy,
    whenIdle: (run) => {
      waiting.add(run)
      settle()
      return () => waiting.delete(run)
    },
    dispose: () => {
      clearTimeout(check)
      mutations.disconnect()
      for (const [target, type, listener] of watch)
        target.removeEventListener(type, listener, true)
      waiting.clear()
    },
  }
}
