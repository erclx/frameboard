import { cn } from 'cn'
import { useEffect } from 'react'

import { liveKey, useCharacterKeysOn } from '@/client/actions/character-keys'
import { keyLabel } from '@/client/actions/keys'
import { type Action, useActions } from '@/client/actions/registry'
import {
  Toast,
  toast as kitToasts,
  ToastContent,
  ToastDescription,
  type ToastObject,
  ToastTitle,
} from '@/client/components/ui/toast'
import {
  type UnseenState,
  type UnseenStore,
  unseenStore,
} from '@/client/live/unseen'

import { currentChange } from './actions'
import { clearedCopy, type ToastCopy, toastCopy } from './copy'
import { glowStore } from './glow-store'

/** How long the toast stays once the last change is seen. */
export const CLOSE_AFTER_MS = 5000

/** The `type` the kit's stack draws `ChangeToastBody` for. */
export const CHANGE_TOAST = 'change'

type Toasts = Pick<typeof kitToasts, 'add' | 'update' | 'close'>

/**
 * The toast offering Show, Previous, Next, and Mark all seen, per
 * agents/unseen-one and unseen-many, as the newest entry in the kit's one
 * stack. It stays while any change is unseen and closes 5 seconds after the
 * last clears, offering Undo for those 5 seconds when Mark all seen cleared
 * them.
 */
export function ChangesToast({
  store = unseenStore,
  toasts = kitToasts,
}: {
  store?: UnseenStore
  toasts?: Toasts
}) {
  return <OpenWhileUnseen store={store} toasts={toasts} />
}

/**
 * Opens the toast while any change is unseen and closes it 5 seconds after
 * the last clears, writing what it says into the toast as the stores move,
 * so a closing toast keeps the words of the last change.
 *
 * Mark all seen turns the toast into its cleared form, closed by the kit's
 * own timer, which pauses while the stack is hovered or focused, since the
 * Undo it holds is the only way back. A change landing within its 5 seconds
 * opens a fresh toast rather than taking that one over, so the Undo stays on
 * screen beside the change it would now leave marked.
 */
function OpenWhileUnseen({
  store,
  toasts,
}: {
  store: UnseenStore
  toasts: Toasts
}) {
  useEffect(() => {
    let id: string | null = null
    let closing: ReturnType<typeof setTimeout> | undefined
    let showsCleared = false
    // The cleared toast a later change handed off, left to the kit's timer.
    let handed: string | null = null

    const closeHanded = () => {
      if (handed !== null) toasts.close(handed)
      handed = null
    }

    // A timeout of 0 keeps the toast open, so every write but the cleared
    // form's stops a kit timer the cleared form started.
    const write = (data: ToastCopy, timeout = 0) => {
      if (id === null) {
        const opened = toasts.add({
          type: CHANGE_TOAST,
          timeout,
          data,
          onClose: () => {
            if (id === opened) id = null
            if (handed === opened) handed = null
          },
        })
        id = opened
      } else {
        toasts.update(id, { data, timeout })
      }
    }

    const follow = () => {
      const current = currentChange(store)
      if (current) {
        if (id !== null && showsCleared) {
          handed = id
          id = null
        }
        showsCleared = false
        clearTimeout(closing)
        closing = undefined
        write(
          toastCopy(
            store.getState().unseen,
            current,
            current.frame in glowStore.getState().glowing,
          ),
        )
      } else if (id !== null && !showsCleared && closing === undefined) {
        const closed = id
        closing = setTimeout(() => {
          closing = undefined
          if (id === closed) toasts.close(closed)
        }, CLOSE_AFTER_MS)
      }
    }

    const cleared = (count: number) => {
      closeHanded()
      clearTimeout(closing)
      closing = undefined
      write(clearedCopy(count), CLOSE_AFTER_MS)
      showsCleared = true
    }

    const onUnseen = (state: UnseenState, previous: UnseenState) => {
      if (state.clears !== previous.clears && state.lastCleared) {
        cleared(Object.keys(state.lastCleared).length)
        return
      }
      if (previous.lastCleared && !state.lastCleared) {
        // Undo puts the pile back under the toast it ran from.
        if (handed !== null) closeHanded()
        else showsCleared = false
      }
      follow()
    }

    follow()
    const stopUnseen = store.subscribe(onUnseen)
    const stopGlow = glowStore.subscribe(follow)
    return () => {
      stopUnseen()
      stopGlow()
      clearTimeout(closing)
      closeHanded()
      if (id !== null) toasts.close(id)
    }
  }, [store, toasts])
  return null
}

/**
 * The change toast in the kit's stack, its copy with Show, Previous, Next,
 * and Mark all seen, or Undo once Mark all seen cleared the pile, at the
 * width its form draws. Enter on the toast itself runs Show.
 */
export function ChangeToastBody({
  toast: item,
}: {
  toast: ToastObject<ToastCopy>
}) {
  const [show, previous, next, markAll, undo] = useActions([
    'changes.show',
    'changes.previous',
    'changes.next',
    'changes.markAllSeen',
    'changes.undoMarkAll',
  ])
  const copy = item.data
  if (!copy) return null
  return (
    <Toast
      toast={item}
      data-change-toast
      style={{ width: copy.width }}
      onKeyDown={(event) => {
        // Enter on a button is the button's own, so only the root's runs Show.
        if (event.key !== 'Enter' || event.target !== event.currentTarget)
          return
        if (!copy.show) return
        event.preventDefault()
        show?.run()
      }}
    >
      <ToastContent className="items-center">
        {copy.initial ? (
          <span aria-hidden className="font-bold text-claim">
            {copy.initial}
          </span>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <ToastTitle>{copy.title}</ToastTitle>
          <ToastDescription>{copy.detail}</ToastDescription>
        </div>
        {copy.show ? (
          <KeyedButton
            action={show}
            label="Show"
            keys={SHOW_KEYS}
            className="bg-[color-mix(in_srgb,var(--claim)_22%,transparent)] text-claim"
          />
        ) : null}
        {copy.next ? (
          <>
            <KeyedButton
              action={previous}
              label="Previous"
              keys={PREVIOUS_KEYS}
            />
            <KeyedButton action={next} label="Next" keys={NEXT_KEYS} />
          </>
        ) : null}
        {copy.markAll ? (
          <KeyedButton
            action={markAll}
            label="Mark all seen"
            keys={MARK_ALL_KEYS}
          />
        ) : null}
        {copy.undo ? (
          <button
            type="button"
            onClick={() => undo?.run()}
            className={cn(TOAST_BUTTON, 'bg-secondary text-foreground')}
          >
            Undo
          </button>
        ) : null}
      </ToastContent>
    </Toast>
  )
}

/** A toast button naming its key while that key is live. */
function KeyedButton({
  action,
  label,
  keys,
  className = 'bg-secondary text-foreground',
}: {
  action: Action | undefined
  label: string
  /** The key shown before the action registers, matching what it registers. */
  keys: readonly string[]
  className?: string
}) {
  const key = liveKey(action?.keys ?? keys, useCharacterKeysOn())
  return (
    <button
      type="button"
      aria-keyshortcuts={key ? keyLabel(key) : undefined}
      onClick={() => action?.run()}
      className={cn(TOAST_BUTTON, className)}
    >
      {key ? `${label} ${keyLabel(key)}` : label}
    </button>
  )
}

const SHOW_KEYS = ['Backslash']
const PREVIOUS_KEYS = ['BracketLeft']
const NEXT_KEYS = ['BracketRight']
const MARK_ALL_KEYS = ['Shift+BracketRight']

/** `.tbtn` in agents/unseen-many. */
export const TOAST_BUTTON =
  'ml-2 shrink-0 rounded-md px-2 py-[3px] font-medium whitespace-nowrap outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring/50'
