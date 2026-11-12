import '../../styles.css'

import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { frameOf } from '@/test/board'
import { realClick } from '@/test/real-pointer'

import { motionHoldOf, releaseMotion } from '../motion/store'
import { MotionSection } from './motion-section'

const HERO = frameOf('hero', { box: { x: 0, y: 0, width: 300, height: 40 } })

const SLIDE = `<style>
  @keyframes slide { to { transform: translateX(200px) } }
  #box { width: 10px; height: 10px; animation: slide 2s linear forwards }
</style><div id="box"></div>`

const SPIN = `<style>
  @keyframes spin { to { transform: rotate(360deg) } }
  #box { width: 10px; height: 10px; animation: spin 1s linear infinite }
</style><div id="box"></div>`

const hosts: HTMLElement[] = []

afterEach(() => {
  for (const host of hosts.splice(0)) host.remove()
  releaseMotion(HERO.ref)
})

/** Puts the frame on the canvas as the board does, its live page loaded from `html`. */
async function showFrame(html: string): Promise<void> {
  const host = document.createElement('div')
  host.dataset.frame = HERO.ref
  const iframe = document.createElement('iframe')
  const loaded = new Promise((done) => iframe.addEventListener('load', done))
  iframe.srcdoc = html
  host.append(iframe)
  document.body.append(host)
  hosts.push(host)
  await loaded
}

describe('MotionSection', () => {
  it('shows for a frame whose page animates', async () => {
    await showFrame(SLIDE)

    render(<MotionSection frame={HERO} />)

    expect(await screen.findByRole('heading', { name: 'Motion' })).toBeVisible()
  })

  it('holds the frame where the track is pressed', async () => {
    await showFrame(SLIDE)
    render(<MotionSection frame={HERO} />)
    const track = await screen.findByRole('slider', { name: 'Position' })

    // A real press on the track's middle, since user-event cannot drive a range.
    await realClick(track)

    await waitFor(() =>
      expect(motionHoldOf(HERO.ref)).toEqual({
        at: expect.closeTo(1000, -2),
        playing: false,
      }),
    )
    expect(screen.getByRole('button', { name: 'Play' })).toBeVisible()
  })

  it('disables the filmstrip of a frame that repeats forever, saying why', async () => {
    await showFrame(SPIN)

    render(<MotionSection frame={HERO} />)

    expect(
      await screen.findByRole('button', { name: 'Export filmstrip' }),
    ).toBeDisabled()
    expect(screen.getByText(/repeat forever/)).toBeVisible()
  })

  it('names one filmstrip file per theme at the export scale', async () => {
    await showFrame(SLIDE)

    render(<MotionSection frame={HERO} />)

    expect(
      await screen.findByText(
        'PNG, hero.filmstrip-5.light@2x.png and hero.filmstrip-5.dark@2x.png',
      ),
    ).toBeVisible()
  })
})
