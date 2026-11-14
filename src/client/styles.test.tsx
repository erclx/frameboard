import './styles.css'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { contrastOnPage } from '@/test/contrast'
import { contrastHovered } from '@/test/hover-contrast'

import { Button } from './components/ui/button'
import { cn } from './lib/cn'

describe('Button', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark')
  })

  it('should paint the kit button with the light fill blue', () => {
    render(<Button>New board</Button>)

    const button = screen.getByRole('button')

    expect(getComputedStyle(button).backgroundColor).toBe('rgb(31, 111, 229)')
  })

  it('should paint the kit button with the dark fill blue under .dark', () => {
    document.documentElement.classList.add('dark')

    render(<Button>New board</Button>)

    const button = screen.getByRole('button')

    expect(getComputedStyle(button).backgroundColor).toBe('rgb(32, 104, 220)')
  })

  describe.each(['light', 'dark'])('in the %s theme', (theme) => {
    beforeEach(() => {
      document.documentElement.classList.toggle('dark', theme === 'dark')
    })

    it('should read its label at 4.5:1 or better at rest', () => {
      render(<Button>New board</Button>)

      expect(contrastOnPage(screen.getByRole('button'))).toBeGreaterThanOrEqual(
        4.5,
      )
    })

    it('should read its label at 4.5:1 or better hovered', async () => {
      render(<Button>New board</Button>)

      expect(
        await contrastHovered(screen.getByRole('button')),
      ).toBeGreaterThanOrEqual(4.5)
    })
  })
})

describe('styles.css', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark')
  })

  it('should carry the light claim token to the text-claim utility', () => {
    render(<span className="text-claim">claimed</span>)

    expect(getComputedStyle(screen.getByText('claimed')).color).toBe(
      'rgb(127, 45, 181)',
    )
  })

  it('should carry the dark claim token to the text-claim utility under .dark', () => {
    document.documentElement.classList.add('dark')

    render(<span className="text-claim">claimed</span>)

    expect(getComputedStyle(screen.getByText('claimed')).color).toBe(
      'rgb(232, 180, 255)',
    )
  })

  describe('the focus-visible variant', () => {
    it('should ring a control focused by keyboard', async () => {
      render(
        <button type="button" className="focus-visible:ring-3">
          Next
        </button>,
      )

      await userEvent.tab()

      expect(getComputedStyle(screen.getByRole('button')).boxShadow).not.toBe(
        'none',
      )
    })

    it('should draw no ring on a control carrying the pointer mark', async () => {
      render(
        <button
          type="button"
          data-pointer-focus=""
          className="focus-visible:ring-3"
        >
          Next
        </button>,
      )

      await userEvent.tab()

      expect(getComputedStyle(screen.getByRole('button')).boxShadow).toBe(
        'none',
      )
    })

    it('should draw no group ring under a group carrying the pointer mark', async () => {
      render(
        <button type="button" data-pointer-focus="" className="group">
          <span className="group-focus-visible:ring-3">Next</span>
        </button>,
      )

      await userEvent.tab()

      expect(getComputedStyle(screen.getByText('Next')).boxShadow).toBe('none')
    })
  })

  it('should render a size step at its size beside a color through cn', () => {
    render(<p className={cn('text-label', 'text-claim')}>sized</p>)

    const style = getComputedStyle(screen.getByText('sized'))

    expect(style.fontSize).toBe('11px')
    expect(style.color).toBe('rgb(127, 45, 181)')
  })
})
