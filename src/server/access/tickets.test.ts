import { describe, expect, it } from 'vitest'

import { createTickets, TICKET_TTL_MS } from './tickets'

describe('createTickets', () => {
  it('redeems a minted ticket once, then refuses it', () => {
    const tickets = createTickets()
    const ticket = tickets.mint()

    expect(ticket).toMatch(/^[0-9a-f]{32}$/)
    expect(tickets.redeem(ticket)).toBe(true)
    expect(tickets.redeem(ticket)).toBe(false)
  })

  it('refuses a ticket after two minutes', () => {
    let clock = 1_000
    const tickets = createTickets(() => clock)
    const ticket = tickets.mint()

    clock += TICKET_TTL_MS
    expect(tickets.redeem(ticket)).toBe(false)
  })

  it('accepts a ticket just inside the two minutes', () => {
    let clock = 1_000
    const tickets = createTickets(() => clock)
    const ticket = tickets.mint()

    clock += TICKET_TTL_MS - 1
    expect(tickets.redeem(ticket)).toBe(true)
  })

  it('refuses a ticket it never minted', () => {
    expect(createTickets().redeem('a'.repeat(32))).toBe(false)
  })

  it('keeps one ticket valid while another is redeemed', () => {
    const tickets = createTickets()
    const first = tickets.mint()
    const second = tickets.mint()

    expect(tickets.redeem(first)).toBe(true)
    expect(tickets.redeem(second)).toBe(true)
  })
})
