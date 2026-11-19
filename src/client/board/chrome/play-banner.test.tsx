import '../../styles.css'

import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { liveStore } from '@/client/live/store'
import { frameOf } from '@/test/board'
import { contrastOnPage } from '@/test/contrast'
import { BRIDGE } from '@/test/frame-bridge'

import { enterFrame, leaveFrame } from '../play/entered'
import { PlayBanner } from './play-banner'

const HINT = 'Nothing on this page takes a click'

/** A frame root holding a live page with the stamp and the bridge the frame route injects, as the canvas draws one. */
function Live({ frameRef, body }: { frameRef: string; body: string }) {
  const page = `<!doctype html><html><head><style data-frameboard data-hash="${'c'.repeat(64)}"></style>${BRIDGE}</head><body>${body}</body></html>`
  return (
    <div data-frame={frameRef}>
      <iframe title={frameRef} srcDoc={page} />
    </div>
  )
}

describe('PlayBanner', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark')
    leaveFrame()
    liveStore.setState({ canWrite: false })
  })

  describe('Rotate', () => {
    it.each([
      ['a phone', 'phone'],
      ['a tablet', 'tablet'],
    ] as const)(
      'offers Rotate to a writer while %s is entered',
      (_label, device) => {
        liveStore.setState({ canWrite: true })
        const a = frameOf('a', { showDevice: true, device })
        enterFrame(a.ref)

        render(<PlayBanner frames={[a]} />)

        expect(screen.getByRole('button', { name: 'Rotate' })).toBeVisible()
      },
    )

    it.each([
      [
        'a laptop entered',
        { showDevice: true, device: 'laptop' as const },
        true,
      ],
      ['a phone with no device shown', {}, true],
      [
        'a view-only tab',
        { showDevice: true, device: 'phone' as const },
        false,
      ],
    ])('offers no Rotate with %s', (_label, flags, canWrite) => {
      liveStore.setState({ canWrite })
      const a = frameOf('a', flags)
      enterFrame(a.ref)

      render(<PlayBanner frames={[a]} />)

      expect(screen.queryByRole('button', { name: 'Rotate' })).toBeNull()
    })

    it('offers no Rotate while no frame is entered', () => {
      liveStore.setState({ canWrite: true })
      const a = frameOf('a', { showDevice: true, device: 'phone' })

      render(<PlayBanner frames={[a]} />)

      expect(screen.queryByRole('button', { name: 'Rotate' })).toBeNull()
    })
  })

  it.each(['light', 'dark'])(
    'reads its text at 4.5:1 or better in %s',
    (theme) => {
      document.documentElement.classList.toggle('dark', theme === 'dark')

      render(<PlayBanner frames={[frameOf('a')]} />)

      expect(contrastOnPage(screen.getByRole('status'))).toBeGreaterThanOrEqual(
        4.5,
      )
    },
  )

  it('says nothing takes a click once every frame loads static', async () => {
    const a = frameOf('a')
    render(
      <>
        <Live frameRef={a.ref} body="<h1>Static</h1>" />
        <PlayBanner frames={[a]} />
      </>,
    )

    expect(await screen.findByText(HINT)).toBeVisible()
  })

  it('stays quiet over a frame with a button', async () => {
    const a = frameOf('a')
    render(
      <>
        <Live frameRef={a.ref} body="<button>Go</button>" />
        <PlayBanner frames={[a]} />
      </>,
    )
    const iframe = screen.getByTitle(a.ref)
    await new Promise((resolve) =>
      iframe.addEventListener('load', resolve, { once: true }),
    )

    expect(screen.queryByText(HINT)).toBeNull()
  })
})
