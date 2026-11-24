import { describe, expect, it } from 'vitest'

import { tiedTests } from './changed-tests.ts'

const FILES = [
  'src/server/board/frames.ts',
  'src/server/board/frames.test.ts',
  'src/server/board/frames.turn.test.ts',
  'src/server/edit/frames.test.ts',
  'src/client/styles.css',
  'src/client/styles.test.tsx',
  'src/server/edit/property.test.ts',
  'e2e/shell/home.spec.ts',
  'package.json',
]

describe('tiedTests', () => {
  it('should pick a changed test', () => {
    expect(tiedTests(['src/server/edit/property.test.ts'], FILES)).toEqual([
      'src/server/edit/property.test.ts',
    ])
  })

  it('should pick a component test beside a style sheet', () => {
    expect(tiedTests(['src/client/styles.css'], FILES)).toEqual([
      'src/client/styles.test.tsx',
    ])
  })

  it('should pick every test beside a source that carries its name', () => {
    expect(tiedTests(['src/server/board/frames.ts'], FILES)).toEqual([
      'src/server/board/frames.test.ts',
      'src/server/board/frames.turn.test.ts',
    ])
  })

  it('should pick a test once when it and its source both changed', () => {
    const changed = [
      'src/server/board/frames.test.ts',
      'src/server/board/frames.ts',
    ]

    expect(tiedTests(changed, FILES)).toEqual([
      'src/server/board/frames.test.ts',
      'src/server/board/frames.turn.test.ts',
    ])
  })

  it('should leave out a deleted test', () => {
    expect(tiedTests(['src/shared/gone.test.ts'], FILES)).toEqual([])
  })

  it('should pick the test left beside a deleted source', () => {
    const files = FILES.filter((file) => file !== 'src/server/board/frames.ts')

    expect(tiedTests(['src/server/board/frames.ts'], files)).toContain(
      'src/server/board/frames.test.ts',
    )
  })

  it('should pick nothing for a package file', () => {
    expect(tiedTests(['package.json'], FILES)).toEqual([])
  })

  it('should leave a Playwright spec to CI', () => {
    expect(tiedTests(['e2e/shell/home.spec.ts'], FILES)).toEqual([])
  })
})
