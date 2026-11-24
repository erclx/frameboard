import '../styles.css'

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { projectStore } from '@/client/projects/actions'
import type { ProjectRecord } from '@/shared/records/list'
import { keyboardFocus } from '@/test/focus-ring'
import { pointerOff, pointerOver } from '@/test/real-pointer'

import { Projects } from './projects'

function project(name: string, group: string | null = null): ProjectRecord {
  return {
    name,
    path: `/board/${name}`,
    modifiedAt: '2026-10-15T09:00:00.000Z',
    title: null,
    createdAt: null,
    group,
    archived: false,
    projectFileError: null,
    transitions: [],
    checksOff: [],
    kits: [],
    pages: [],
  }
}

function renderCards() {
  render(
    <Router hook={memoryLocation({ path: '/' }).hook}>
      <Projects
        projects={[project('drawings'), project('web', 'Client A')]}
        layout="grid"
        now={Date.parse('2026-10-15T12:00:00.000Z')}
      />
    </Router>,
  )
}

const CLEAR = 'rgba(0, 0, 0, 0)'

afterEach(() => {
  cleanup()
  act(() => projectStore.setState({ focused: null, folder: null }))
})

describe.each([
  ['folder', () => screen.getByRole('button', { name: /^Client A/ })],
  ['project', () => screen.getByRole('link', { name: /^drawings/ })],
])('a %s card border', (_kind, find) => {
  /** The card, held since an open menu hides it from a role query, and a read of its border. */
  function renderCard() {
    renderCards()
    const card = find()
    return { card, border: () => getComputedStyle(card).borderTopColor }
  }

  it('shows at rest', () => {
    const { border } = renderCard()

    expect(border()).not.toBe(CLEAR)
  })

  it('goes clear under the pointer and shows again after it', async () => {
    const { card, border } = renderCard()
    const atRest = border()

    await pointerOver(card)
    const hovered = border()
    await pointerOff(card)

    expect([hovered, border()]).toEqual([CLEAR, atRest])
  })

  it('goes clear under keyboard focus', async () => {
    const { card, border } = renderCard()

    await keyboardFocus(card)

    expect(border()).toBe(CLEAR)
  })

  it('goes clear while its menu is open and shows again once dismissed', async () => {
    const { card, border } = renderCard()
    const atRest = border()

    await userEvent.pointer({ keys: '[MouseRight]', target: card })
    await screen.findByRole('menu')
    const open = border()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    // The closed menu hands the card focus, whose ring clears the border too.
    act(() => card.blur())

    expect([open, border()]).toEqual([CLEAR, atRest])
  })

  it('goes clear while a project is held over it', () => {
    const { card, border } = renderCard()

    // Set by hand, since a native drag needs the real pointer e2e drives.
    card.closest('li')?.setAttribute('data-drop-over', 'true')

    expect(border()).toBe(CLEAR)
  })
})
