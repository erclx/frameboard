import type { LucideIcon } from 'lucide-react'
import { tinykeys } from 'tinykeys'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { createStore } from 'zustand/vanilla'

import { characterKeysOn } from './character-keys'
import { isCharacterKey } from './keys'

/**
 * One board action, carrying a palette row or `palette: false`, so leaving one
 * out of the palette is a choice the type checker sees.
 */
export type Action = ActionBase &
  ({ command: Command; palette?: never } | { palette: false; command?: never })

/**
 * The action's palette row. `searchOnly` hides it until a query is typed, so
 * many frame sizes never bury the rows an empty palette opens on.
 */
export interface Command {
  label: string
  icon?: LucideIcon
  hint?: () => string
  keywords?: readonly string[]
  searchOnly?: boolean
}

interface ActionBase {
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
  /**
   * A key hands `trigger`, whose `repeat` marks an auto-repeat of a held key.
   * A button or the palette passes none, which reads as a discrete press.
   */
  run: (trigger?: { repeat: boolean }) => void
  /** Gates its button and its key alike, absent meaning always. */
  enabled?: () => boolean
  /** Marks a toggle or a radio row on, absent meaning it is neither. */
  checked?: () => boolean
  /**
   * Runs again on each auto-repeat of a held key, as a held arrow keeps
   * nudging. Absent, a held key runs it once and its repeats are prevented,
   * so a held walk never skips past what the person meant to stop on.
   */
  repeat?: boolean
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
 * `board` skips a field or a dialog but a toast. `frame`, for a frame's window,
 * skips only a composing or page-prevented press, so Esc leaves from a field.
 */
export type TypingRule = 'board' | 'frame'

/**
 * Binds the registry's keys, a press running the first enabled action for it,
 * and no key firing where `typing` skips it, the board's rule by default.
 */
export function bindKeys(
  target: Window | Element,
  only?: readonly string[],
  { typing = 'board' }: { typing?: TypingRule } = {},
): () => void {
  const ignore = typing === 'frame' ? isFramePressTaken : isTyping
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
      { ignore },
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

/**
 * A switched-off character key returns before `preventDefault`, as WCAG 2.1.4
 * asks, gated here so a key added later is covered.
 */
function press(key: string, event: KeyboardEvent): void {
  const action = actionFor(key)
  if (!action) return
  event.preventDefault()
  if (event.repeat && !action.repeat) return
  action.run({ repeat: event.repeat })
}

/**
 * Runs the action a key press names, as a bound press would, for a press a
 * frame already took and prevented in its own window.
 */
export function runKey(key: string, repeat: boolean): void {
  const action = actionFor(key)
  if (!action || (repeat && !action.repeat)) return
  action.run({ repeat })
}

/** The first enabled action a key runs, none for a switched-off character key. */
function actionFor(key: string): Action | undefined {
  if (isCharacterKey(key) && !characterKeysOn()) return undefined
  return registry
    .getState()
    .actions.find(
      (candidate) => candidate.keys?.includes(key) && isEnabled(candidate),
    )
}

/**
 * tinykeys' skip without its repeat drop, also skipping a dialog but a toast,
 * whose `role="dialog"` would kill undo, Enter there staying with the toast. A
 * target without `matches`, being a document or window, passes through.
 */
function isTyping(event: KeyboardEvent): boolean {
  const target = event.target as Partial<HTMLElement> | null
  if (typeof target?.matches !== 'function') return false
  if (
    event.isComposing ||
    target.isContentEditable ||
    (target !== event.currentTarget &&
      target.matches('[contenteditable],input,select,textarea'))
  )
    return true
  if (target.closest?.('[data-slot="toast"]') != null)
    return event.key === 'Enter'
  // A modal's Tab rests on a guard outside its node, or on the body between the two.
  return (
    target.closest?.('[role="dialog"]') != null ||
    document.querySelector('[data-slot="dialog-content"][data-open]') !== null
  )
}

function isFramePressTaken(event: KeyboardEvent): boolean {
  return event.isComposing || event.defaultPrevented
}
