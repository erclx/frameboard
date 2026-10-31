import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { findAction } from '@/client/actions/registry'

import { SHAPES, usePlaceTools } from './tool'

describe('usePlaceTools', () => {
  it('names each shape row in the palette with the article its word takes', () => {
    const { unmount } = renderHook(() => usePlaceTools())

    const labels = SHAPES.map((row) => findAction(row.id)?.command?.label)

    expect(labels).toEqual([
      'Add a rectangle',
      'Add an ellipse',
      'Add a divider',
    ])
    unmount()
  })
})
