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
import { type UnseenStore, unseenStore } from '@/client/live/unseen'

import { currentChange } from './actions'
import { type ToastCopy, toastCopy } from './copy'
import { glowStore } from './glow-store'

/** How long the toast stays once the last change is seen. */
export const CLOSE_AFTER_MS = 5000

/** The `type` the kit's stack draws `ChangeToastBody` for. */
export const CHANGE_TOAST = 'change'

type Toasts = Pick<typeof kitToasts, 'add' | 'update' | 'close'>

/**
 * The toast offering Show, Previous, and Next, per agents/unseen-one and
 * unseen-many, as the newest entry in the kit's one stack. It stays while
 * any change is unseen and closes 5 seconds after the last clears.
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
    const follow = () => {
      const current = currentChange(store)
      if (current) {
        clearTimeout(closing)
        closing = undefined
        const data = toastCopy(
          store.getState().unseen,
          current,
          current.frame in glowStore.getState().glowing,
        )
        if (id === null) {
          id = toasts.add({
            type: CHANGE_TOAST,
            timeout: 0,
            data,
            onClose: () => {
              id = null
            },
          })
        } else {
          toasts.update(id, { data })
        }
      } else if (id !== null && closing === undefined) {
        closing = setTimeout(() => {
          closing = undefined
          if (id !== null) toasts.close(id)
        }, CLOSE_AFTER_MS)
      }
    }
    follow()
    const stopUnseen = store.subscribe(follow)
    const stopGlow = glowStore.subscribe(follow)
    return () => {
      stopUnseen()
      stopGlow()
      clearTimeout(closing)
      if (id !== null) toasts.close(id)
    }
  }, [store, toasts])
  return null
}

/** The change toast in the kit's stack, its copy with Show, Previous, and Next, at the width its form draws. Enter on the toast itself runs Show. */
export function ChangeToastBody({
  toast: item,
}: {
  toast: ToastObject<ToastCopy>
}) {
  const [show, previous, next] = useActions([
    'changes.show',
    'changes.previous',
    'changes.next',
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
          <button
            type="button"
            onClick={() => show?.run()}
            className={cn(
              TOAST_BUTTON,
              'bg-[color-mix(in_srgb,var(--claim)_22%,transparent)] text-claim',
            )}
          >
            Show
          </button>
        ) : null}
        {copy.next ? (
          <>
            <StepButton
              action={previous}
              label="Previous"
              keys={PREVIOUS_KEYS}
            />
            <StepButton action={next} label="Next" keys={NEXT_KEYS} />
          </>
        ) : null}
      </ToastContent>
    </Toast>
  )
}

/** A step through the changes, naming its key while that key is live. */
function StepButton({
  action,
  label,
  keys,
}: {
  action: Action | undefined
  label: string
  /** The key shown before the action registers, matching what it registers. */
  keys: readonly string[]
}) {
  const key = liveKey(action?.keys ?? keys, useCharacterKeysOn())
  return (
    <button
      type="button"
      aria-keyshortcuts={key ? keyLabel(key) : undefined}
      onClick={() => action?.run()}
      className={cn(TOAST_BUTTON, 'bg-secondary text-foreground')}
    >
      {key ? `${label} ${keyLabel(key)}` : label}
    </button>
  )
}

const PREVIOUS_KEYS = ['BracketLeft']
const NEXT_KEYS = ['BracketRight']

/** `.tbtn` in agents/unseen-many. */
export const TOAST_BUTTON =
  'ml-2 shrink-0 rounded-md px-2 py-[3px] font-medium whitespace-nowrap outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring/50'
