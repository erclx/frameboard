import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { wireHeroPause } from './hero-pause'

function renderHero(): HTMLElement {
  document.body.innerHTML = `
    <section id="hero">
      <picture>
        <source id="reduced" media="(prefers-reduced-motion: reduce)" srcset="/still.png" />
        <source id="dark" media="(prefers-color-scheme: dark)" srcset="/loop-dark.webp" data-loop data-still="/still-dark.png" />
        <img id="light" src="/loop.webp" alt="" data-loop data-still="/still.png" />
      </picture>
      <button type="button" class="pause" hidden aria-pressed="false">Pause</button>
    </section>`
  return document.body
}

function darkSrcset(): string | null | undefined {
  return document.querySelector('#dark')?.getAttribute('srcset')
}

function lightSrc(): string | null | undefined {
  return document.querySelector('#light')?.getAttribute('src')
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('wireHeroPause', () => {
  it('shows the pause button once scripts run', () => {
    const root = renderHero()

    wireHeroPause(root)

    expect(screen.getByRole('button', { name: 'Pause' })).toBeVisible()
  })

  it('pause swaps a matching dark source and the img to their own stills', async () => {
    const root = renderHero()
    const user = userEvent.setup()
    wireHeroPause(root)

    await user.click(screen.getByRole('button', { name: 'Pause' }))

    expect(darkSrcset()).toBe('/still-dark.png')
    expect(lightSrc()).toBe('/still.png')
  })

  it('play restores the dark loop and the light loop', async () => {
    const root = renderHero()
    const user = userEvent.setup()
    wireHeroPause(root)

    await user.click(screen.getByRole('button', { name: 'Pause' }))
    await user.click(screen.getByRole('button', { name: 'Play' }))

    expect(darkSrcset()).toBe('/loop-dark.webp')
    expect(lightSrc()).toBe('/loop.webp')
  })

  it('a second pause after a play reaches the stills again', async () => {
    const root = renderHero()
    const user = userEvent.setup()
    wireHeroPause(root)

    await user.click(screen.getByRole('button', { name: 'Pause' }))
    await user.click(screen.getByRole('button', { name: 'Play' }))
    await user.click(screen.getByRole('button', { name: 'Pause' }))

    expect(darkSrcset()).toBe('/still-dark.png')
    expect(lightSrc()).toBe('/still.png')
  })

  it('leaves the reduced-motion source alone', async () => {
    const root = renderHero()
    const user = userEvent.setup()
    wireHeroPause(root)

    await user.click(screen.getByRole('button', { name: 'Pause' }))

    expect(document.querySelector('#reduced')).toHaveAttribute(
      'srcset',
      '/still.png',
    )
  })

  it('reports the paused state on the button', async () => {
    const root = renderHero()
    const user = userEvent.setup()
    wireHeroPause(root)

    await user.click(screen.getByRole('button', { name: 'Pause' }))

    expect(screen.getByRole('button', { name: 'Play' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('reports the playing state on the button after a play', async () => {
    const root = renderHero()
    const user = userEvent.setup()
    wireHeroPause(root)

    await user.click(screen.getByRole('button', { name: 'Pause' }))
    await user.click(screen.getByRole('button', { name: 'Play' }))

    expect(screen.getByRole('button', { name: 'Pause' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })
})
