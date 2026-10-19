import { randomBytes } from 'node:crypto'

export const TICKET_TTL_MS = 2 * 60_000

export interface Tickets {
  /** A fresh single-use ticket, 32 hex, valid for two minutes. */
  mint: () => string
  /** True once for a live ticket, false for a used, expired, or unknown one. */
  redeem: (ticket: string) => boolean
}

/** Tickets live in memory only, so a restart voids them and nothing reaches disk. */
export function createTickets(now: () => number = Date.now): Tickets {
  const expiries = new Map<string, number>()
  return {
    mint: () => {
      for (const [ticket, expiry] of expiries) {
        if (expiry <= now()) expiries.delete(ticket)
      }
      const ticket = randomBytes(16).toString('hex')
      expiries.set(ticket, now() + TICKET_TTL_MS)
      return ticket
    },
    redeem: (ticket) => {
      const expiry = expiries.get(ticket)
      expiries.delete(ticket)
      return expiry !== undefined && expiry > now()
    },
  }
}
