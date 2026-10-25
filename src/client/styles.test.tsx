import './styles.css'

import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { Button } from './components/ui/button'

describe('Button', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark')
  })

  it('should paint the kit button with the light primary blue', () => {
    render(<Button>New board</Button>)

    const button = screen.getByRole('button')

    expect(getComputedStyle(button).backgroundColor).toBe('rgb(47, 123, 240)')
  })

  it('should paint the kit button with the dark primary blue under .dark', () => {
    document.documentElement.classList.add('dark')

    render(<Button>New board</Button>)

    const button = screen.getByRole('button')

    expect(getComputedStyle(button).backgroundColor).toBe('rgb(78, 146, 246)')
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
      'rgb(224, 163, 255)',
    )
  })
})
