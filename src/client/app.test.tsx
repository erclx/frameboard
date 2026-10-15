import './styles.css'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { App } from './app'

describe('App', () => {
  it('paints the kit button with the primary token', () => {
    render(<App />)

    const button = screen.getByRole('button')
    const primary = getComputedStyle(document.documentElement)
      .getPropertyValue('--primary')
      .trim()

    expect(primary).not.toBe('')
    expect(getComputedStyle(button).backgroundColor).toBe(primary)
  })
})
