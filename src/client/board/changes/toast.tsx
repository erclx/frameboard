import { cn } from 'cn'
import { useEffect } from 'react'

import { useActions } from '@/client/actions/registry'
import {
  createToastManager,
  Toast,
  ToastContent,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  useToastManager,
} from '@/client/components/ui/toast'
import { type UnseenStore, unseenStore } from '@/client/live/unseen'

import { currentChange } from './actions'
import { type ToastCopy, toastCopy } from './copy'
import { glowStore } from './glow-store'

/** How long the toast stays once the last change is seen. */
export const CLOSE_AFTER_MS = 5000

const changeToasts = createToastManager<ToastCopy>()

/**
 * The one toast over the canvas column offering Show and Next, per
 * agents/unseen-one and unseen-many. It stays while any change is unseen and
 * closes 5 seconds after the last clears.
 */
export function ChangesToast({ store = unseenStore }: { store?: UnseenStore }) {
  return (
    <ToastProvider toastManager={changeToasts}>
      <OpenWhileUnseen store={store} />
      <ToastViewport className="absolute right-4 bottom-[84px] z-20 w-auto">
        <ChangeToastList />
      </ToastViewport>
    </ToastProvider>
  )
}

/**
 * Opens the toast while any change is unseen and closes it 5 seconds after
 * the last clears, writing what it says into the toast as the stores move,
 * so a closing toast keeps the words of the last change.
 */
function OpenWhileUnseen({ store }: { store: UnseenStore }) {
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
          id = changeToasts.add({
            timeout: 0,
            data,
            onClose: () => {
              id = null
            },
          })
        } else {
          changeToasts.update(id, { data })
        }
      } else if (id !== null && closing === undefined) {
        closing = setTimeout(() => {
          closing = undefined
          if (id !== null) changeToasts.close(id)
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
      if (id !== null) changeToasts.close(id)
    }
  }, [store])
  return null
}

function ChangeToastList() {
  const { toasts } = useToastManager<ToastCopy>()
  const [show, next] = useActions(['changes.show', 'changes.next'])
  return toasts.flatMap((item) => {
    const copy = item.data
    if (!copy) return []
    return (
      <Toast
        key={item.id}
        toast={item}
        data-change-toast
        style={{ width: copy.width }}
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
                BUTTON,
                'bg-[color-mix(in_srgb,var(--claim)_22%,transparent)] text-claim',
              )}
            >
              Show
            </button>
          ) : null}
          {copy.next ? (
            <button
              type="button"
              aria-keyshortcuts="]"
              onClick={() => next?.run()}
              className={cn(BUTTON, 'bg-secondary text-foreground')}
            >
              Next ]
            </button>
          ) : null}
        </ToastContent>
      </Toast>
    )
  })
}

/** `.tbtn` in agents/unseen-many. */
const BUTTON =
  'ml-2 shrink-0 rounded-md px-2 py-[3px] font-medium whitespace-nowrap outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring/50'
