import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { wireBarLine, wireThemeButtons } from './nav'

function stubSystemTheme(scheme: 'light' | 'dark'): void {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: query === `(prefers-color-scheme: ${scheme})`,
      }) as MediaQueryList,
  )
}

function renderButton(): HTMLButtonElement {
  document.body.innerHTML = `<button type="button" aria-label="Switch theme"></button>`
  const button = document.querySelector('button')
  if (!button) throw new Error('button did not render')
  return button
}

function renderTwoButtons(): HTMLButtonElement[] {
  document.body.innerHTML = `
    <header><button type="button" aria-label="Switch theme"></button></header>
    <footer><button type="button" aria-label="Switch theme"></button></footer>`
  return [...document.querySelectorAll('button')]
}

function renderHeroSources(): void {
  document.body.insertAdjacentHTML(
    'beforeend',
    `<picture>
      <source id="still" media="(prefers-reduced-motion: reduce) and (prefers-color-scheme: dark)" data-dark-media="(prefers-reduced-motion: reduce)" />
      <source id="loop" media="(prefers-color-scheme: dark)" data-dark-media="all" />
    </picture>`,
  )
}

function media(id: string): string | null | undefined {
  return document.getElementById(id)?.getAttribute('media')
}

function setScrollY(y: number): void {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.body.innerHTML = ''
  setScrollY(0)
})

describe('wireThemeButtons', () => {
  it('offers the dark theme to a light system reader', () => {
    stubSystemTheme('light')

    wireThemeButtons([renderButton()])

    expect(
      screen.getByRole('button', { name: 'Switch to dark theme' }),
    ).toBeInTheDocument()
  })

  it('offers the light theme to a dark system reader', () => {
    stubSystemTheme('dark')

    wireThemeButtons([renderButton()])

    expect(
      screen.getByRole('button', { name: 'Switch to light theme' }),
    ).toBeInTheDocument()
  })

  it('reads a stored choice over the system theme', () => {
    stubSystemTheme('dark')
    document.documentElement.setAttribute('data-theme', 'light')

    wireThemeButtons([renderButton()])

    expect(
      screen.getByRole('button', { name: 'Switch to dark theme' }),
    ).toBeInTheDocument()
  })

  it('flips a dark system reader to light and stores the choice', async () => {
    stubSystemTheme('dark')
    const user = userEvent.setup()
    wireThemeButtons([renderButton()])

    await user.click(screen.getByRole('button'))

    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(localStorage.getItem('theme')).toBe('light')
    expect(
      screen.getByRole('button', { name: 'Switch to dark theme' }),
    ).toBeInTheDocument()
  })

  it('flips a stored dark choice back to light', async () => {
    stubSystemTheme('light')
    document.documentElement.setAttribute('data-theme', 'dark')
    const user = userEvent.setup()
    wireThemeButtons([renderButton()])

    await user.click(screen.getByRole('button'))

    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(localStorage.getItem('theme')).toBe('light')
  })

  it('still switches the page when storage refuses the write', async () => {
    stubSystemTheme('light')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    const user = userEvent.setup()
    wireThemeButtons([renderButton()])

    await user.click(screen.getByRole('button'))

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })
})

describe('two theme buttons', () => {
  it('names the same theme on both buttons', () => {
    stubSystemTheme('light')

    wireThemeButtons(renderTwoButtons())

    expect(
      screen.getAllByRole('button', { name: 'Switch to dark theme' }),
    ).toHaveLength(2)
  })

  it('relabels the header button after a click on the footer button', async () => {
    stubSystemTheme('light')
    const user = userEvent.setup()
    const [header, footer] = renderTwoButtons()
    wireThemeButtons([header, footer])

    await user.click(footer)

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(header).toHaveAccessibleName('Switch to light theme')
  })

  it('switches back from the other button', async () => {
    stubSystemTheme('light')
    const user = userEvent.setup()
    const [header, footer] = renderTwoButtons()
    wireThemeButtons([header, footer])

    await user.click(footer)
    await user.click(header)

    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(localStorage.getItem('theme')).toBe('light')
    expect(footer).toHaveAccessibleName('Switch to dark theme')
  })
})

describe('themed picture sources', () => {
  it('keeps the system media while no choice is stored', () => {
    stubSystemTheme('light')
    const button = renderButton()
    renderHeroSources()

    wireThemeButtons([button])

    expect(media('loop')).toBe('(prefers-color-scheme: dark)')
    expect(media('still')).toBe(
      '(prefers-reduced-motion: reduce) and (prefers-color-scheme: dark)',
    )
  })

  it('turns the dark sources on for a stored dark choice', () => {
    stubSystemTheme('light')
    document.documentElement.setAttribute('data-theme', 'dark')
    const button = renderButton()
    renderHeroSources()

    wireThemeButtons([button])

    expect(media('loop')).toBe('all')
    expect(media('still')).toBe('(prefers-reduced-motion: reduce)')
  })

  it('turns the dark sources off once a dark reader picks light', async () => {
    stubSystemTheme('dark')
    const button = renderButton()
    renderHeroSources()
    const user = userEvent.setup()
    wireThemeButtons([button])

    await user.click(screen.getByRole('button'))

    expect(media('loop')).toBe('not all')
    expect(media('still')).toBe('not all')
  })
})

describe('wireBarLine', () => {
  function renderBar(): HTMLElement {
    document.body.innerHTML = '<header></header>'
    const bar = document.querySelector('header')
    if (!bar) throw new Error('bar did not render')
    return bar
  }

  it('draws no line at the top of the page', () => {
    setScrollY(0)
    const bar = renderBar()

    wireBarLine(bar)

    expect(bar).not.toHaveAttribute('data-scrolled')
  })

  it('draws the line once the page scrolls one pixel', () => {
    const bar = renderBar()
    wireBarLine(bar)

    setScrollY(1)
    window.dispatchEvent(new Event('scroll'))

    expect(bar).toHaveAttribute('data-scrolled')
  })

  it('drops the line on the way back to the top', () => {
    setScrollY(1)
    const bar = renderBar()
    wireBarLine(bar)

    setScrollY(0)
    window.dispatchEvent(new Event('scroll'))

    expect(bar).not.toHaveAttribute('data-scrolled')
  })
})
