import { describe, expect, it } from 'vitest'

import { classifyDrift } from './drift'

describe('classifyDrift', () => {
  it('should fail the HTML and the file set and only warn on PNG bytes', () => {
    const drift = classifyDrift(
      new Map<string, string | Uint8Array>([
        ['x/a.html', '<p>a</p>'],
        ['x/b.html', '<p>b2</p>'],
        ['x/c.png', new Uint8Array([1, 2])],
        ['x/d.png', new Uint8Array([3])],
      ]),
      new Map<string, string | Uint8Array>([
        ['x/a.html', '<p>a</p>'],
        ['x/b.html', '<p>b</p>'],
        ['x/c.png', new Uint8Array([1, 9])],
        ['x/old.png', new Uint8Array([4])],
      ]),
    )

    expect(drift).toEqual({
      changed: ['x/b.html'],
      pngDiffers: ['x/c.png'],
      missing: ['x/d.png'],
      stray: ['x/old.png'],
    })
  })
})
