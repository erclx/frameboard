import { describe, expect, it } from 'vitest'

import { newPageName } from './page-actions'

describe('newPageName', () => {
  it('counts on from the pages there are', () => {
    expect(newPageName(['home', 'pricing'])).toBe('page-3')
  })

  it('skips a name a page holds in any case', () => {
    expect(newPageName(['home', 'Page-3'])).toBe('page-4')
  })

  it('names the first page of an empty project page-1', () => {
    expect(newPageName([])).toBe('page-1')
  })
})
