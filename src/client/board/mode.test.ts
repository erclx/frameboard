import { describe, expect, it } from 'vitest'

import { createModeStore } from './mode'

describe('createModeStore', () => {
  it('opens with the UI hidden below 1024px', () => {
    expect(createModeStore(1023).getState().hideUi).toBe(true)
  })

  it('opens with the UI shown from 1024px', () => {
    expect(createModeStore(1024).getState().hideUi).toBe(false)
  })
})
