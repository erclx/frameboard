import { describe, expect, it } from 'vitest'

import { createLiveStore } from '@/client/live/store'
import type { SelectionReport } from '@/shared/records/selection'

import { createSelectionStore, select, selectElement } from '../selection'
import { followReports } from './report'

const PAGE = 'studio/home'
const HERO = 'studio/home/hero'
const HASH = 'a'.repeat(64)

function setup(canWrite = true) {
  const selection = createSelectionStore()
  const live = createLiveStore()
  live.setState({ canWrite })
  const sent: SelectionReport[] = []
  const answers: (() => void)[] = []
  const stop = followReports(selection, live, 'tab-1', (report) => {
    sent.push(report)
    return new Promise<void>((resolve) => answers.push(resolve))
  })
  /** Answers the report in flight and lets its follower start. */
  const answer = async () => {
    answers.shift()?.()
    await Promise.resolve()
    await Promise.resolve()
  }
  return { selection, live, sent, answer, stop }
}

describe('followReports', () => {
  it('reports an element with its frame address', async () => {
    const { selection, sent, answer, stop } = setup()
    await answer()

    selectElement(selection, PAGE, { frame: HERO, index: 6, hash: HASH })

    expect(sent.at(-1)).toEqual({
      tab: 'tab-1',
      page: PAGE,
      frames: [HERO],
      element: { ref: HERO, index: 6, hash: HASH },
    })
    stop()
  })

  it('sends only the newest of the changes made while one is in flight', async () => {
    const { selection, sent, answer, stop } = setup()
    select(selection, PAGE, [HERO])
    select(selection, PAGE, ['studio/home/about'])

    await answer()

    expect(sent.map((report) => report.frames)).toEqual([
      [],
      ['studio/home/about'],
    ])
    stop()
  })

  it('reports nothing from a tab that cannot write, until it can', async () => {
    const { selection, live, sent, stop } = setup(false)
    select(selection, PAGE, [HERO])

    live.setState({ canWrite: true })

    expect(sent.map((report) => report.frames)).toEqual([[HERO]])
    stop()
  })
})
