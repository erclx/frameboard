import { describe, expect, it } from 'vitest'

import { BoardTabs } from '../start'
import { openBoard } from './open-board'

const URL = 'http://127.0.0.1:4173'

describe('openBoard', () => {
  it('opens nothing while a board tab is connected', async () => {
    const tabs = new BoardTabs()
    tabs.open()
    const opened: string[] = []

    const result = await openBoard({
      tabs,
      url: URL,
      open: (url) => opened.push(url),
      graceMs: 0,
    })

    expect(result).toBe(false)
    expect(opened).toEqual([])
  })

  it('opens nothing when a tab reconnects within the grace', async () => {
    const tabs = new BoardTabs()
    const opened: string[] = []

    const deciding = openBoard({
      tabs,
      url: URL,
      open: (url) => opened.push(url),
      graceMs: 1000,
    })
    tabs.open()

    expect(await deciding).toBe(false)
    expect(opened).toEqual([])
  })

  it('opens the board once the grace passes with no tab', async () => {
    const opened: string[] = []

    const result = await openBoard({
      tabs: new BoardTabs(),
      url: URL,
      open: (url) => opened.push(url),
      graceMs: 10,
    })

    expect(result).toBe(true)
    expect(opened).toEqual([URL])
  })
})
