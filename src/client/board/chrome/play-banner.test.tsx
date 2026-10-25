import '../../styles.css'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { frameOf } from '@/test/board'

import { PlayBanner } from './play-banner'

const HINT = 'Nothing on this page takes a click'

/** A frame root holding a live page, as the canvas draws one. */
function Live({ frameRef, body }: { frameRef: string; body: string }) {
  return (
    <div data-frame={frameRef}>
      <iframe title={frameRef} srcDoc={body} />
    </div>
  )
}

describe('PlayBanner', () => {
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
