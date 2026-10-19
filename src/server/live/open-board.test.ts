import { describe, expect, it } from 'vitest'

import { BoardTabs } from '../start'
import { openBoard } from './open-board'

const URL = 'http://127.0.0.1:4173/api/access/redeem?ticket=t'

describe('openBoard', () => {
  it('opens nothing while a writing tab is connected', async () => {
    const tabs = new BoardTabs()
    tabs.open(true)
    const opened: string[] = []

    const result = await openBoard({
      tabs,
      url: () => URL,
      open: (url) => opened.push(url),
      graceMs: 0,
    })

    expect(result).toBe(false)
    expect(opened).toEqual([])
  })

  it('opens nothing when a writing tab reconnects within the grace', async () => {
    const tabs = new BoardTabs()
    const opened: string[] = []

    const deciding = openBoard({
      tabs,
      url: () => URL,
      open: (url) => opened.push(url),
      graceMs: 1000,
    })
    tabs.open(true)

    expect(await deciding).toBe(false)
    expect(opened).toEqual([])
  })

  it('opens the board while only a reader is connected', async () => {
    const tabs = new BoardTabs()
    tabs.open(false)
    const opened: string[] = []

    const result = await openBoard({
      tabs,
      url: () => URL,
      open: (url) => opened.push(url),
      graceMs: 10,
    })

    expect(result).toBe(true)
    expect(opened).toEqual([URL])
  })

  it('asks for the address only when it opens a tab', async () => {
    const tabs = new BoardTabs()
    tabs.open(true)
    let asked = 0

    await openBoard({
      tabs,
      url: () => `${URL}${(asked += 1)}`,
      open: () => {},
      graceMs: 0,
    })

    expect(asked).toBe(0)
  })

  it('opens the board once the grace passes with no tab', async () => {
    const opened: string[] = []

    const result = await openBoard({
      tabs: new BoardTabs(),
      url: () => URL,
      open: (url) => opened.push(url),
      graceMs: 10,
    })

    expect(result).toBe(true)
    expect(opened).toEqual([URL])
  })
})
