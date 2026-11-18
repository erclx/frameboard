import '../styles.css'

import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { HomeLoading } from './loading'

function renderLoading() {
  const { container } = render(
    <Router hook={memoryLocation({ path: '/' }).hook}>
      <HomeLoading />
    </Router>,
  )
  return container.querySelectorAll<HTMLElement>('[data-placeholder]')
}

afterEach(() => {
  localStorage.clear()
})

describe('HomeLoading', () => {
  it('draws four placeholders on a first visit', () => {
    expect(renderLoading()).toHaveLength(4)
  })

  it('draws as many placeholders as the last visit drew', () => {
    localStorage.setItem('frameboard.home.count', '6')

    expect(renderLoading()).toHaveLength(6)
  })

  it('caps the placeholders on a large board', () => {
    localStorage.setItem('frameboard.home.count', '40')

    expect(renderLoading()).toHaveLength(12)
  })

  it('draws the list layout at the remembered count too', () => {
    localStorage.setItem('frameboard.home.layout', 'list')
    localStorage.setItem('frameboard.home.count', '2')

    expect(renderLoading()).toHaveLength(2)
  })

  it("pulses each placeholder's blocks with the frame's loading motion", () => {
    const [first] = renderLoading()
    const blocks = first?.querySelectorAll('[data-slot="skeleton"]') ?? []

    expect(blocks.length).toBeGreaterThan(0)
    for (const block of blocks) {
      expect(getComputedStyle(block).animationName).toBe('frame-loading')
    }
  })
})
