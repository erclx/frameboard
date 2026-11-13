import { Smartphone } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Popover, PopoverContent } from '@/client/components/ui/popover'
import { BoardWriteError, writeBoard } from '@/client/live/write'
import { type QrModules, qrModules } from '@/shared/qr'
import type { FrameRecord } from '@/shared/records/list'
import type { PreviewStart } from '@/shared/records/preview'

/** The light modules a scanner wants around a code, at least four by the standard. */
const QUIET_ZONE = 4

interface PhoneLinkProps {
  /** The one selected frame, which the link lands on. */
  frame: FrameRecord
  disabled: boolean
  /** The request the card starts and ends the link with, the board's own when absent. */
  send?: typeof fetch
}

type Result =
  | { attempt: number; link: PreviewStart }
  | { attempt: number; message: string }

/**
 * Opens the frame's project on a phone on the same network. The button opens
 * a card that starts the board's phone listener and shows the link as a code
 * and as text, with what it covers. Closing the card ends the link, and so
 * does anything that unmounts it, so no listener outlives the card that
 * started it. A link a second card started since is left running, since the
 * stop names the token this card holds.
 */
export function PhoneLink({ frame, disabled, send = fetch }: PhoneLinkProps) {
  const [open, setOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    let token: string | null = null
    let ended = false
    startLink(frame.ref, send).then(
      (link) => {
        // A card closed while the start was out ends the link it started.
        if (ended) {
          void stopLink(link.token, send)
          return
        }
        token = link.token
        setResult({ attempt, link })
      },
      (error: unknown) => {
        if (!ended) setResult({ attempt, message: messageOf(error) })
      },
    )
    return () => {
      ended = true
      if (token !== null) void stopLink(token, send)
    }
  }, [open, attempt, frame.ref, send])

  const current = result?.attempt === attempt ? result : null

  return (
    <div className="mt-2.5">
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setAttempt((count) => count + 1)
          setOpen(true)
        }}
        className="flex h-[26px] w-full items-center gap-2 rounded-md bg-input px-2 text-xs outline-none hover:ring-1 hover:ring-border focus-visible:ring-2 focus-visible:ring-ring/50 disabled:text-muted-foreground disabled:hover:ring-0 aria-expanded:ring-1 aria-expanded:ring-border"
      >
        <Smartphone
          aria-hidden
          className="size-[13px] text-muted-foreground"
          strokeWidth={1.6}
        />
        Open on a phone
      </button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverContent
          anchor={trigger}
          side="left"
          align="start"
          sideOffset={12}
          aria-label={`Open ${frame.name} on a phone`}
          finalFocus={trigger}
          className="w-[248px] gap-3 rounded-xl p-3.5 text-xs shadow-[0_14px_40px_rgba(0,0,0,.28)]"
        >
          <p className="font-semibold">Open {frame.name} on a phone</p>
          {current === null ? (
            <p role="status" className="text-muted-foreground">
              Starting the link
            </p>
          ) : 'link' in current ? (
            <LinkCard link={current.link} />
          ) : (
            <div role="alert" className="flex flex-col gap-2">
              <p>{current.message}</p>
              <button
                type="button"
                onClick={() => setAttempt((count) => count + 1)}
                className="h-[26px] self-start rounded-md bg-input px-2.5 outline-none hover:ring-1 hover:ring-border focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                Try again
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}

function LinkCard({ link }: { link: PreviewStart }) {
  return (
    <>
      <div className="self-center rounded-lg bg-white p-1.5">
        <QrCode modules={qrModules(link.url)} label={`Code for ${link.url}`} />
      </div>
      <p className="rounded-md bg-input px-2 py-1.5 font-mono text-[11px] leading-snug break-all select-all">
        {link.url}
      </p>
      <p className="leading-relaxed text-muted-foreground">
        Same network only. The link opens {link.project} read only and ends when
        this card closes.
      </p>
    </>
  )
}

/** The code as one path of dark squares on white, its quiet zone included. */
export function QrCode({
  modules,
  label,
}: {
  modules: QrModules
  label: string
}) {
  const size = modules.length + QUIET_ZONE * 2
  const path = modules
    .flatMap((row, y) =>
      row.map((dark, x) =>
        dark ? `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z` : '',
      ),
    )
    .join('')
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="block size-[176px]"
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  )
}

function startLink(ref: string, send: typeof fetch): Promise<PreviewStart> {
  return writeBoard<PreviewStart>('/api/preview', { ref }, 'POST', send)
}

/** Ends the link `token` names, quietly, since a card closing has nowhere to report it. */
function stopLink(token: string, send: typeof fetch): Promise<void> {
  return writeBoard('/api/preview', { token }, 'DELETE', send).then(
    () => undefined,
    () => undefined,
  )
}

function messageOf(error: unknown): string {
  if (error instanceof BoardWriteError && error.code === 'no-network-address') {
    return 'This machine is on no local network. Join the Wi-Fi the phone is on, then try again.'
  }
  return 'The board could not start the link. Try again.'
}
