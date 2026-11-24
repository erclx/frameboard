import { describe, expect, it } from 'vitest'

import { createTickets, TICKET_TTL_MS } from './tickets'

const MINUTE_MS = 60_000

describe('createTickets', () => {
  it('redeems a minted ticket once, then refuses it', () => {
    const tickets = createTickets()
    const { ticket } = tickets.mint()

    expect(ticket).toMatch(/^[0-9a-f]{32}$/)
    expect(tickets.redeem(ticket)).toBe(true)
    expect(tickets.redeem(ticket)).toBe(false)
  })

  it('refuses a ticket after two minutes', () => {
    let clock = 1_000
    const tickets = createTickets(() => clock)
    const { ticket } = tickets.mint()

    clock += TICKET_TTL_MS
    expect(tickets.redeem(ticket)).toBe(false)
  })

  it('accepts a ticket just inside the two minutes', () => {
    let clock = 1_000
    const tickets = createTickets(() => clock)
    const { ticket } = tickets.mint()

    clock += TICKET_TTL_MS - 1
    expect(tickets.redeem(ticket)).toBe(true)
  })

  it('returns the expiry redeem reads, two minutes out', () => {
    const tickets = createTickets(() => Date.parse('2026-10-24T09:00:00.000Z'))

    expect(tickets.mint().expiresAt).toBe('2026-10-24T09:02:00.000Z')
  })

  it('accepts a ten minute ticket past the two minutes', () => {
    let clock = 1_000
    const tickets = createTickets(() => clock)
    const { ticket } = tickets.mint(10 * MINUTE_MS)

    clock += 10 * MINUTE_MS - 1

    expect(tickets.redeem(ticket)).toBe(true)
  })

  it('refuses a ten minute ticket once the ten minutes pass', () => {
    let clock = 1_000
    const tickets = createTickets(() => clock)
    const { ticket } = tickets.mint(10 * MINUTE_MS)

    clock += 10 * MINUTE_MS

    expect(tickets.redeem(ticket)).toBe(false)
  })

  it('keeps no ticket past an hour, whatever life it was minted with', () => {
    let clock = 1_000
    const tickets = createTickets(() => clock)
    const { ticket } = tickets.mint(90 * MINUTE_MS)

    clock += 60 * MINUTE_MS

    expect(tickets.redeem(ticket)).toBe(false)
  })

  it('refuses a ticket it never minted', () => {
    expect(createTickets().redeem('a'.repeat(32))).toBe(false)
  })

  it('keeps one ticket valid while another is redeemed', () => {
    const tickets = createTickets()
    const first = tickets.mint().ticket
    const second = tickets.mint().ticket

    expect(tickets.redeem(first)).toBe(true)
    expect(tickets.redeem(second)).toBe(true)
  })
})
