import { describe, expect, it } from 'vitest'

import { createSelectionHolder, type ReportedSelection } from './selection'

const HERO: ReportedSelection = {
  page: 'studio/home',
  frames: ['studio/home/hero'],
  element: null,
}

const ABOUT: ReportedSelection = {
  page: 'studio/home',
  frames: ['studio/home/about'],
  element: { ref: 'studio/home/about', index: 4, hash: 'a'.repeat(64) },
}

describe('createSelectionHolder', () => {
  it('holds nothing before any tab reports', () => {
    expect(createSelectionHolder(() => 1).current()).toBeNull()
  })

  it('keeps the last report from any tab', () => {
    const holder = createSelectionHolder(() => 1)
    holder.report('tab-1', HERO)

    holder.report('tab-2', ABOUT)

    expect(holder.current()).toEqual(ABOUT)
  })

  it('forgets the report once the tab that made it closes', () => {
    const holder = createSelectionHolder(() => 1)
    holder.report('tab-1', HERO)

    holder.closeTab('tab-1')

    expect(holder.current()).toBeNull()
  })

  it('keeps the report when another tab closes', () => {
    const holder = createSelectionHolder(() => 1)
    holder.report('tab-1', HERO)

    holder.closeTab('tab-2')

    expect(holder.current()).toEqual(HERO)
  })
})
