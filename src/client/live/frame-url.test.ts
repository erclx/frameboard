import { describe, expect, it } from 'vitest'

import { onFramePort } from './frame-url'

describe('onFramePort', () => {
  it('names localhost frames for a localhost tab', () => {
    expect(onFramePort('/frames/a/b/c.html', 47123, 'localhost')).toBe(
      'http://localhost:47123/frames/a/b/c.html',
    )
  })

  it('names 127.0.0.1 frames for a 127.0.0.1 tab', () => {
    expect(
      onFramePort('/frames/a/b/c.html?theme=dark', 47123, '127.0.0.1'),
    ).toBe('http://127.0.0.1:47123/frames/a/b/c.html?theme=dark')
  })

  it('names no URL before the frame port arrives', () => {
    expect(onFramePort('/frames/a/b/c.html', null, 'localhost')).toBeNull()
  })
})
