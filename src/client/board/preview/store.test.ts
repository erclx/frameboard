import { afterEach, describe, expect, it } from 'vitest'

import { createLiveStore, receiveBoard } from '@/client/live/store'
import { boardOf, frameOf, pageOf } from '@/test/board'

import {
  endPreview,
  followPreview,
  measurePreview,
  previewedBox,
  previewOf,
  setPreview,
} from './store'

const HERO = frameOf('hero', {
  box: { x: 10, y: 20, width: 1440, height: 900 },
})
const CARD = frameOf('card')

describe('preview store', () => {
  let stop = () => {}

  afterEach(() => {
    stop()
    endPreview([HERO.ref, CARD.ref])
  })

  it('previews every frame named at one width', () => {
    setPreview([HERO.ref, CARD.ref], 390)

    expect(previewOf(HERO.ref)).toEqual({ width: 390 })
    expect(previewOf(CARD.ref)).toEqual({ width: 390 })
  })

  it('ends a preview, leaving the others', () => {
    setPreview([HERO.ref, CARD.ref], 390)

    endPreview([HERO.ref])

    expect(previewOf(HERO.ref)).toBeUndefined()
    expect(previewOf(CARD.ref)).toEqual({ width: 390 })
  })

  it('drops a measured height when the width changes', () => {
    setPreview([HERO.ref], 390)
    measurePreview(HERO.ref, 390, 1200)

    setPreview([HERO.ref], 834)

    expect(previewOf(HERO.ref)).toEqual({ width: 834 })
  })

  it('ignores a height measured at a width the preview has left', () => {
    setPreview([HERO.ref], 834)

    measurePreview(HERO.ref, 390, 1200)

    expect(previewOf(HERO.ref)).toEqual({ width: 834 })
  })

  it('drops a preview whose frame leaves the board', () => {
    const live = createLiveStore()
    stop = followPreview(live)
    setPreview([HERO.ref, CARD.ref], 390)

    receiveBoard(live, boardOf(pageOf([CARD])))

    expect(previewOf(HERO.ref)).toBeUndefined()
    expect(previewOf(CARD.ref)).toEqual({ width: 390 })
  })

  it('drops a preview whose frame is hidden', () => {
    const live = createLiveStore()
    stop = followPreview(live)
    setPreview([HERO.ref], 390)

    receiveBoard(live, boardOf(pageOf([{ ...HERO, hidden: true }])))

    expect(previewOf(HERO.ref)).toBeUndefined()
  })
})

describe('previewedBox', () => {
  it('draws the previewed width and keeps a fixed height', () => {
    const box = previewedBox(HERO, HERO.box, { width: 390, height: 2000 })

    expect(box).toEqual({ x: 10, y: 20, width: 390, height: 900 })
  })

  it('draws a hugging height at the height measured for the width', () => {
    const hugging = { ...HERO, hugHeight: true }

    const box = previewedBox(hugging, HERO.box, { width: 390, height: 2000 })

    expect(box).toEqual({ x: 10, y: 20, width: 390, height: 2000 })
  })

  it('keeps a hugging height not measured yet', () => {
    const hugging = { ...HERO, hugHeight: true }

    const box = previewedBox(hugging, HERO.box, { width: 390 })

    expect(box).toEqual({ x: 10, y: 20, width: 390, height: 900 })
  })
})
