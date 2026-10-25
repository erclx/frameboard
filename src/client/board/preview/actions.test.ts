import { afterEach, describe, expect, it } from 'vitest'

import { type Action, isEnabled } from '@/client/actions/registry'
import { frameOf } from '@/test/board'

import { createSelectionStore, select } from '../selection'
import { previewActions } from './actions'
import { endPreview, previewOf, setPreview } from './store'

const PAGE = 'studio/home'
const A = frameOf('a')
const B = frameOf('b')

function setup(selected: readonly string[]) {
  const selection = createSelectionStore()
  if (selected.length > 0) select(selection, PAGE, [...selected])
  const actions = previewActions(selection)
  const action = (id: string): Action => {
    const found = actions.find((candidate) => candidate.id === id)
    if (!found) throw new Error(`no action ${id}`)
    return found
  }
  return { action }
}

describe('previewActions', () => {
  afterEach(() => {
    endPreview([A.ref, B.ref])
  })

  it.each([
    ['preview.phone', 390],
    ['preview.tablet', 834],
    ['preview.desktop', 1440],
  ])('%s previews the selected frame at %i', (id, width) => {
    const { action } = setup([A.ref])

    action(id).run()

    expect(previewOf(A.ref)).toEqual({ width })
  })

  it('previews every selected frame at once', () => {
    const { action } = setup([A.ref, B.ref])

    action('preview.phone').run()

    expect([previewOf(A.ref), previewOf(B.ref)]).toEqual([
      { width: 390 },
      { width: 390 },
    ])
  })

  it('offers no preview with nothing selected', () => {
    const { action } = setup([])

    expect(isEnabled(action('preview.phone'))).toBe(false)
  })

  it('ends the preview of every selected frame', () => {
    setPreview([A.ref, B.ref], 390)
    const { action } = setup([A.ref, B.ref])

    action('preview.end').run()

    expect([previewOf(A.ref), previewOf(B.ref)]).toEqual([undefined, undefined])
  })

  it('offers End preview only while a selected frame is previewed', () => {
    const { action } = setup([A.ref])
    const before = isEnabled(action('preview.end'))

    setPreview([A.ref], 390)

    expect([before, isEnabled(action('preview.end'))]).toEqual([false, true])
  })
})
