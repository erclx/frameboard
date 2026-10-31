import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { frameOf } from '@/test/board'

import { endPreview, previewOf } from '../preview/store'
import { PreviewRow } from './preview-row'

const PHONE = /^Preview at phone width/
const TABLET = /^Preview at tablet width/
const DESKTOP = /^Preview at desktop width/

function frameAt(name: string, width: number) {
  return frameOf(name, { box: { x: 0, y: 0, width, height: 600 } })
}

const IPHONE = frameAt('iphone', 393)
const IPAD = frameAt('ipad', 834)
const WIDE = frameAt('wide', 1180)
const NARROW = frameAt('narrow', 300)

function pressed(name: RegExp) {
  return screen.getByRole('button', { name }).getAttribute('aria-pressed')
}

describe('PreviewRow', () => {
  afterEach(() => {
    act(() => endPreview([IPHONE.ref, IPAD.ref, WIDE.ref, NARROW.ref]))
  })

  it('presses Phone for a frame at 393', () => {
    render(<PreviewRow frames={[IPHONE]} />)

    expect([pressed(PHONE), pressed(TABLET), pressed(DESKTOP)]).toEqual([
      'true',
      'false',
      'false',
    ])
  })

  it('keeps 393 when Phone is clicked', async () => {
    render(<PreviewRow frames={[IPHONE]} />)

    await userEvent.click(screen.getByRole('button', { name: PHONE }))

    expect(previewOf(IPHONE.ref)).toEqual({ width: 393 })
  })

  it('takes 834 when Tablet is clicked from 1180', async () => {
    render(<PreviewRow frames={[WIDE]} />)

    await userEvent.click(screen.getByRole('button', { name: TABLET }))

    expect(previewOf(WIDE.ref)).toEqual({ width: 834 })
    expect(pressed(TABLET)).toBe('true')
  })

  it('presses no toggle for a selection of 393 and 834', () => {
    render(<PreviewRow frames={[IPHONE, IPAD]} />)

    expect([pressed(PHONE), pressed(TABLET), pressed(DESKTOP)]).toEqual([
      'false',
      'false',
      'false',
    ])
  })

  it('presses no toggle below 320, and Phone takes 390 from there', async () => {
    render(<PreviewRow frames={[NARROW]} />)
    const before = pressed(PHONE)

    await userEvent.click(screen.getByRole('button', { name: PHONE }))

    expect(before).toBe('false')
    expect(previewOf(NARROW.ref)).toEqual({ width: 390 })
  })

  it('moves each frame of a mixed selection by its own width', async () => {
    render(<PreviewRow frames={[IPHONE, WIDE]} />)

    await userEvent.click(screen.getByRole('button', { name: PHONE }))

    expect([previewOf(IPHONE.ref), previewOf(WIDE.ref)]).toEqual([
      { width: 393 },
      { width: 390 },
    ])
  })

  it('names the range and the default of each toggle', () => {
    render(<PreviewRow frames={[IPHONE]} />)

    expect(
      [PHONE, TABLET, DESKTOP].map(
        (name) => screen.getByRole('button', { name }).ariaLabel,
      ),
    ).toEqual([
      'Preview at phone width, 320 to 479, default 390',
      'Preview at tablet width, 480 to 1023, default 834',
      'Preview at desktop width, 1024 and up, default 1440',
    ])
  })
})
