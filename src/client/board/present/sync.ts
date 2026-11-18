import { z } from 'zod'

import { boardUrl } from '@/shared/board-urls'
import { THEMES } from '@/shared/theme'

/**
 * One BroadcastChannel per presentation, so two decks in two tabs never cross.
 * The audience alone holds the state and sends `state` and `ended`, and the
 * presenter window sends `hello`, `step`, and `leave`.
 */

const presentationIdSchema = z.string().regex(/^[a-z0-9-]{1,64}$/)

const presentedSchema = z.object({
  page: z.string(),
  frame: z.string(),
  /** The steps the audience shows on `frame`, which the presenter window draws from its own count. */
  step: z.number().int().nonnegative(),
  /** When presenting began, in epoch milliseconds. */
  startedAt: z.number(),
  /** The theme each frame on the page shows in the audience tab, carrying a flip that lives in its memory. */
  themes: z.record(z.string(), z.enum(THEMES)),
})

export type PresentedState = z.infer<typeof presentedSchema>

const audienceMessageSchema = z.discriminatedUnion('type', [
  presentedSchema.extend({ type: z.literal('state') }),
  z.object({ type: z.literal('ended') }),
])

export type AudienceMessage = z.infer<typeof audienceMessageSchema>

const presenterCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello') }),
  z.object({
    type: z.literal('step'),
    by: z.union([z.literal(1), z.literal(-1)]),
  }),
  z.object({ type: z.literal('leave') }),
])

export type PresenterCommand = z.infer<typeof presenterCommandSchema>

function channelOf(id: string): BroadcastChannel {
  return new BroadcastChannel(`frameboard.present.${id}`)
}

/** A fresh id naming one presentation's channel. */
export function newPresentationId(): string {
  return crypto.randomUUID()
}

/** The presenter window's address, under the page it presents. */
export function presenterUrl(
  project: string,
  page: string,
  id: string,
): string {
  return `${boardUrl(project, page)}/presenter?id=${encodeURIComponent(id)}`
}

/** Whether `pathname` is a presenter window's, as `presenterUrl` builds it. */
export function isPresenterPath(pathname: string): boolean {
  return /^\/p\/[^/]+\/[^/]+\/presenter\/?$/.test(pathname)
}

/** The presentation a presenter window's query names, null when it names none or a malformed one. */
export function presentationIdOf(search: string): string | null {
  const parsed = presentationIdSchema.safeParse(
    new URLSearchParams(search).get('id'),
  )
  return parsed.success ? parsed.data : null
}

export interface Audience {
  send: (state: PresentedState) => void
  /** Tells the presenter window presenting ended and closes the channel, once however often it runs. */
  end: () => void
}

/**
 * The audience's end, answering a hello with `current` and running each
 * command the presenter window sends. Any other shape is dropped.
 */
export function serveAudience(
  id: string,
  handlers: {
    current: () => PresentedState | null
    step: (by: 1 | -1) => void
    leave: () => void
  },
): Audience {
  const channel = channelOf(id)
  let open = true
  const post = (message: AudienceMessage) => {
    if (open) channel.postMessage(message)
  }
  channel.addEventListener('message', (event: MessageEvent<unknown>) => {
    const parsed = presenterCommandSchema.safeParse(event.data)
    if (!parsed.success) return
    const command = parsed.data
    if (command.type === 'hello') {
      const state = handlers.current()
      if (state) post({ type: 'state', ...state })
    } else if (command.type === 'step') handlers.step(command.by)
    else handlers.leave()
  })
  return {
    send: (state) => post({ type: 'state', ...state }),
    end: () => {
      post({ type: 'ended' })
      open = false
      channel.close()
    },
  }
}

export interface PresenterLink {
  step: (by: 1 | -1) => void
  leave: () => void
  close: () => void
}

/**
 * The presenter window's end, saying hello at once so an audience already
 * presenting answers with its state, and passing on each message the audience
 * sends. Any other shape is dropped.
 */
export function joinAudience(
  id: string,
  receive: (message: AudienceMessage) => void,
): PresenterLink {
  const channel = channelOf(id)
  const post = (command: PresenterCommand) => channel.postMessage(command)
  channel.addEventListener('message', (event: MessageEvent<unknown>) => {
    const parsed = audienceMessageSchema.safeParse(event.data)
    if (parsed.success) receive(parsed.data)
  })
  post({ type: 'hello' })
  return {
    step: (by) => post({ type: 'step', by }),
    leave: () => post({ type: 'leave' }),
    close: () => channel.close(),
  }
}
