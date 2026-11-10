import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { wireFilmPlayer } from './film-player'

function renderFilm(): HTMLElement {
  document.body.innerHTML = `
    <section id="hero">
      <div class="shot" data-film>
        <picture>
          <img src="/hero-loop.webp" alt="The board canvas as an agent draws" />
        </picture>
        <button type="button" class="pause">Pause</button>
        <a href="/film.mp4" aria-label="Play the film" data-play></a>
        <button type="button" hidden data-close>Close</button>
      </div>
    </section>`
  return document.body
}

function player(): HTMLVideoElement | null {
  return document.querySelector('video')
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(document, 'fullscreenElement')
  document.body.innerHTML = ''
})

async function playFilm(): Promise<ReturnType<typeof userEvent.setup>> {
  const root = renderFilm()
  const user = userEvent.setup()
  wireFilmPlayer(root)
  await user.click(screen.getByRole('link', { name: 'Play the film' }))
  return user
}

function playLink(): HTMLElement | null {
  return screen.queryByRole('link', { name: 'Play the film' })
}

describe('wireFilmPlayer', () => {
  it('leaves the play control a link to the film before any click', () => {
    const root = renderFilm()

    wireFilmPlayer(root)

    expect(screen.getByRole('link', { name: 'Play the film' })).toHaveAttribute(
      'href',
      '/film.mp4',
    )
  })

  it('swaps the hero footage for a player of the film on play', async () => {
    const root = renderFilm()
    const user = userEvent.setup()
    wireFilmPlayer(root)

    await user.click(screen.getByRole('link', { name: 'Play the film' }))

    expect(player()?.getAttribute('src')).toBe('/film.mp4')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('takes the footage pause and the play control away with the footage', async () => {
    const root = renderFilm()
    const user = userEvent.setup()
    wireFilmPlayer(root)

    await user.click(screen.getByRole('link', { name: 'Play the film' }))

    expect(
      screen.queryByRole('button', { name: 'Pause' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('keeps the browser on the page rather than following the link', async () => {
    const root = renderFilm()
    const user = userEvent.setup()
    wireFilmPlayer(root)
    const clicks: MouseEvent[] = []
    document.addEventListener('click', (event) => clicks.push(event), {
      once: true,
    })

    await user.click(screen.getByRole('link', { name: 'Play the film' }))

    expect(clicks[0]?.defaultPrevented).toBe(true)
  })

  it('starts the new player once', async () => {
    const root = renderFilm()
    const user = userEvent.setup()
    wireFilmPlayer(root)

    await user.click(screen.getByRole('link', { name: 'Play the film' }))

    const play = vi.mocked(HTMLMediaElement.prototype.play)
    expect(play).toHaveBeenCalledOnce()
    expect(play.mock.contexts[0]).toBe(player())
  })

  it('gives the player its own controls', async () => {
    const root = renderFilm()
    const user = userEvent.setup()
    wireFilmPlayer(root)

    await user.click(screen.getByRole('link', { name: 'Play the film' }))

    expect(player()?.controls).toBe(true)
  })

  // jsdom counts no <video> as focusable, while a browser focuses one carrying
  // controls, so this reads which element the focus call landed on.
  it('moves focus to the player', async () => {
    const root = renderFilm()
    const user = userEvent.setup()
    wireFilmPlayer(root)
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')

    await user.click(screen.getByRole('link', { name: 'Play the film' }))

    expect(focus.mock.contexts.at(-1)).toBe(player())
  })

  it('names the player for assistive technology', async () => {
    const root = renderFilm()
    const user = userEvent.setup()
    wireFilmPlayer(root)

    await user.click(screen.getByRole('link', { name: 'Play the film' }))

    expect(player()).toHaveAttribute('aria-label', 'The Frameboard launch film')
  })

  it('plays the film in a 16:9 box', async () => {
    await playFilm()

    expect(player()).toHaveClass('aspect-video')
  })

  it('shows the Close button while the film plays', async () => {
    await playFilm()

    expect(screen.getByRole('button', { name: 'Close' })).toBeVisible()
  })

  it('returns to the hero on Close', async () => {
    const user = await playFilm()

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(player()).toBeNull()
    expect(screen.getByRole('img')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(playLink()).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })

  it('puts focus back on Play after closing', async () => {
    const user = await playFilm()

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(playLink()).toHaveFocus()
  })

  it('returns to the hero on Escape', async () => {
    const user = await playFilm()

    await user.keyboard('{Escape}')

    expect(player()).toBeNull()
    expect(playLink()).toHaveFocus()
  })

  it('leaves Escape to the browser while the film is fullscreen', async () => {
    const user = await playFilm()
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: player(),
    })

    await user.keyboard('{Escape}')

    expect(player()).toBeInTheDocument()
  })

  it('returns to the hero when the film ends', async () => {
    await playFilm()

    player()?.dispatchEvent(new Event('ended'))

    expect(player()).toBeNull()
    expect(playLink()).toHaveFocus()
  })

  it('ignores Escape once the film has closed', async () => {
    const user = await playFilm()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    screen.getByRole('button', { name: 'Pause' }).focus()

    await user.keyboard('{Escape}')

    expect(screen.getByRole('button', { name: 'Pause' })).toHaveFocus()
  })

  it('opens one player when played a second time', async () => {
    const user = await playFilm()
    await user.click(screen.getByRole('button', { name: 'Close' }))

    await user.click(screen.getByRole('link', { name: 'Play the film' }))

    expect(document.querySelectorAll('video')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Close' })).toBeVisible()
  })

  it('does nothing on a page with no film', () => {
    document.body.innerHTML = '<main></main>'

    wireFilmPlayer(document.body)

    expect(document.body.innerHTML).toBe('<main></main>')
  })
})
