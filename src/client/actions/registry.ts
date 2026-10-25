import type { LucideIcon } from 'lucide-react'
import { defaultKeybindingsHandlerIgnore, tinykeys } from 'tinykeys'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { createStore } from 'zustand/vanilla'

/**
 * One thing the board can do, run the same way from a button, a menu item,
 * or a key. A row needing a field this shape lacks adds it as optional.
 */
export interface Action {
  /** Dotted and stable, such as `view.hideUi`, since buttons and menus look actions up by it. */
  id: string
  label: string
  /** Where menus and the shortcuts sheet list it, such as `tool`, `view`, or `theme`. */
  group: string
  /**
   * tinykeys bindings, such as `$mod+Backslash`. A key names
   * `KeyboardEvent.key` or `.code`, and a shifted digit needs its code, as in
   * `Shift+Digit1`, since its key reads as the symbol.
   */
  keys?: readonly string[]
  run: () => void
  /** Gates its button and its key alike, absent meaning always. */
  enabled?: () => boolean
  /**
   * Lists the action in the command palette under this label and icon, which
   * may rename it, as Toggle theme names `theme.toggle`. The palette lists only
   * enabled actions carrying it, so a key a person never runs by name omits it.
   */
  command?: { label: string; icon?: LucideIcon }
  /** Marks a toggle or a radio row on, absent meaning it is neither. */
  checked?: () => boolean
}

interface RegistryState {
  /** In registration order, which decides which action a shared key runs. */
  actions: readonly Action[]
  /** Bumped by `refreshActions`, so a button rereads `enabled` and `checked`. */
  version: number
}

const registry = createStore<RegistryState>()(() => ({
  actions: [],
  version: 0,
}))

/** Adds actions after every one already registered, returning the function that removes them. */
export function registerActions(actions: readonly Action[]): () => void {
  registry.setState((state) => ({ actions: [...state.actions, ...actions] }))
  return () =>
    registry.setState((state) => ({
      actions: state.actions.filter((action) => !actions.includes(action)),
    }))
}

/**
 * Tells every button and menu reading an action to call its `enabled` and
 * `checked` again. A row calls it when the state those read changes, so its
 * actions keep their place in the order rather than registering again.
 */
export function refreshActions(): void {
  registry.setState((state) => ({ version: state.version + 1 }))
}

export function isEnabled(action: Action): boolean {
  return action.enabled?.() ?? true
}

/** The first action registered under each id, undefined until one is. */
export function useActions(ids: readonly string[]): (Action | undefined)[] {
  return useStore(
    registry,
    useShallow((state) => [
      state.version,
      ...ids.map((id) => state.actions.find((action) => action.id === id)),
    ]),
  ).slice(1) as (Action | undefined)[]
}

/** The first action registered under each id, for code running one outside a render. */
export function findAction(id: string): Action | undefined {
  return registry.getState().actions.find((action) => action.id === id)
}

/**
 * What the command palette lists: each enabled action carrying `command`,
 * the first registered under an id, in registration order.
 */
export function useCommands(): Action[] {
  return useStore(
    registry,
    useShallow((state) => {
      const seen = new Set<string>()
      const listed = state.actions.filter((action) => {
        if (!action.command || seen.has(action.id)) return false
        seen.add(action.id)
        return isEnabled(action)
      })
      return [state.version, ...listed]
    }),
  ).slice(1) as Action[]
}

/** Every action in a group, in registration order. */
export function useActionGroup(group: string): Action[] {
  return useStore(
    registry,
    useShallow((state) => [
      state.version,
      ...state.actions.filter((action) => action.group === group),
    ]),
  ).slice(1) as Action[]
}

/**
 * Binds the registry's keys into a window or element, following later
 * registrations, and returns the function that unbinds them. `only` limits
 * it to the bindings named, as a frame's window in Play takes Esc alone.
 * A press runs the first registered action carrying that key whose
 * `enabled` is true, and no key fires while focus sits in a field or a dialog.
 */
export function bindKeys(
  target: Window | Element,
  only?: readonly string[],
): () => void {
  const bind = (actions: readonly Action[]) => {
    const keys = new Set(
      actions
        .flatMap((action) => action.keys ?? [])
        .filter((key) => !only || only.includes(key)),
    )
    return tinykeys(
      target,
      Object.fromEntries(
        [...keys].map((key) => [key, (event) => press(key, event)]),
      ),
      { ignore: isTyping },
    )
  }
  let unbind = bind(registry.getState().actions)
  const unsubscribe = registry.subscribe((state, previous) => {
    if (state.actions === previous.actions) return
    unbind()
    unbind = bind(state.actions)
  })
  return () => {
    unsubscribe()
    unbind()
  }
}

function press(key: string, event: KeyboardEvent): void {
  const action = registry
    .getState()
    .actions.find(
      (candidate) => candidate.keys?.includes(key) && isEnabled(candidate),
    )
  if (!action) return
  event.preventDefault()
  action.run()
}

/**
 * tinykeys skips fields by tag, and `isContentEditable` adds the children of
 * an editable root. A press inside an open dialog is skipped too, so the
 * Esc that closes the shortcuts sheet never clears the selection or leaves
 * Play. A toast is the exception, since base-ui gives it `role="dialog"` and
 * it takes focus on a tab or a click, which would kill every key including
 * undo. Enter there stays with the toast, so its Show button still clicks.
 * Its own check calls `matches` on the target, which a press aimed at a
 * document or window lacks, so those pass through.
 */
function isTyping(event: KeyboardEvent): boolean {
  const target = event.target as Partial<HTMLElement> | null
  if (typeof target?.matches !== 'function') return false
  if (defaultKeybindingsHandlerIgnore(event) || target.isContentEditable)
    return true
  if (target.closest?.('[data-slot="toast"]') != null)
    return event.key === 'Enter'
  return target.closest?.('[role="dialog"]') != null
}
