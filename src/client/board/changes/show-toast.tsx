import { cn } from 'cn'

import {
  Toast,
  ToastClose,
  ToastContent,
  ToastDescription,
  type ToastObject,
  ToastTitle,
} from '@/client/components/ui/toast'

import { acceptOffer, type OfferCopy } from './show'
import { TOAST_BUTTON } from './toast'

/** The offer for a `show` the board did not take, per agents/show-offer, in the kit's one stack. Enter on the toast itself runs Go. */
export function ShowOfferBody({
  toast: item,
}: {
  toast: ToastObject<OfferCopy>
}) {
  const copy = item.data
  if (!copy) return null
  return (
    <Toast
      toast={item}
      data-show-offer
      style={{ width: 340 }}
      onKeyDown={(event) => {
        // Enter on a button is the button's own, so only the root's runs Go.
        if (event.key !== 'Enter' || event.target !== event.currentTarget)
          return
        event.preventDefault()
        acceptOffer(copy.ref)
      }}
    >
      <ToastContent className="items-center">
        <div className="flex min-w-0 flex-1 flex-col">
          <ToastTitle>{copy.title}</ToastTitle>
          <ToastDescription>{copy.detail}</ToastDescription>
        </div>
        <button
          type="button"
          onClick={() => acceptOffer(copy.ref)}
          className={cn(
            TOAST_BUTTON,
            'bg-[color-mix(in_srgb,var(--claim)_22%,transparent)] text-claim',
          )}
        >
          Go
        </button>
      </ToastContent>
      <ToastClose />
    </Toast>
  )
}
