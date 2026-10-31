import { afterEach, describe, expect, it } from 'vitest'

import { type Action, isEnabled } from '@/client/actions/registry'
import { createLiveStore, receiveBoard } from '@/client/live/store'
import { boardOf, frameOf, pageOf } from '@/test/board'

import { createSelectionStore, select } from '../selection'
import { previewActions } from './actions'
import { endPreview, previewOf, setPreview } from './store'

const PAGE = 'studio/home'
const A = frameOf('a')
const B = frameOf('b')
const IPHONE = frameOf('iphone', {
  box: { x: 0, y: 0, width: 393, height: 852 },
})
const WIDE = frameOf('wide', { box: { x: 0, y: 0, width: 1180, height: 820 } })

function setup(selected: readonly string[]) {
  const selection = createSelectionStore()
  if (selected.length > 0) select(selection, PAGE, [...selected])
  const live = createLiveStore()
  receiveBoard(live, boardOf(pageOf([IPHONE, WIDE])))
  const actions = previewActions(selection, live)
  const action = (id: string): Action => {
    const found = actions.find((candidate) => candidate.id === id)
    if (!found) throw new Error(`no action ${id}`)
    return found
  }
  return { action }
}

describe('previewActions', () => {
  afterEach(() => {
    endPreview([A.ref, B.ref, IPHONE.ref, WIDE.ref])
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

  it('keeps a width already in the preset range', () => {
    const { action } = setup([IPHONE.ref])

    action('preview.phone').run()

    expect(previewOf(IPHONE.ref)).toEqual({ width: 393 })
  })

  it('takes the preset default from a width outside its range', () => {
    const { action } = setup([WIDE.ref])

    action('preview.tablet').run()

    expect(previewOf(WIDE.ref)).toEqual({ width: 834 })
  })

  it('checks the preset whose range holds the frame width', () => {
    const { action } = setup([IPHONE.ref])

    expect([
      action('preview.phone').checked?.(),
      action('preview.tablet').checked?.(),
    ]).toEqual([true, false])
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
