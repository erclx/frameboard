import '../styles.css'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import type { ProjectRecord } from '@/shared/records/list'

import { Projects } from './projects'

const NOW = Date.parse('2026-10-15T12:00:00.000Z')

function project(
  name: string,
  modifiedAt: string,
  pages = ['home'],
): ProjectRecord {
  return {
    name,
    path: `/board/${name}`,
    modifiedAt,
    projectFileError: null,
    pages: pages.map((page, index) => ({
      ref: `${name}/${page}`,
      project: name,
      name: page,
      path: `/board/${name}/${page}`,
      index,
      layoutError: null,
      frames: [],
    })),
  }
}

const PROJECTS = [
  project('studio', '2026-10-15T09:00:00.000Z', ['landing', 'pricing']),
  project('webapp', '2026-10-13T12:00:00.000Z'),
]

function renderAt(projects: ProjectRecord[]) {
  const memory = memoryLocation({ path: '/', record: true })
  render(
    <Router hook={memory.hook}>
      <Projects projects={projects} now={NOW} />
    </Router>,
  )
  return memory
}

describe('Projects', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('shows each project as a card with when it was last edited', () => {
    renderAt(PROJECTS)

    expect(screen.getByRole('link', { name: /studio/ })).toHaveTextContent(
      'Edited 3 hours ago',
    )
    expect(screen.getByRole('link', { name: /webapp/ })).toHaveTextContent(
      'Edited 2 days ago',
    )
  })

  it("opens a project's first page", async () => {
    const memory = renderAt(PROJECTS)

    await userEvent.click(screen.getByRole('link', { name: /studio/ }))

    expect(memory.history.at(-1)).toBe('/p/studio/landing')
  })

  it('switches to rows and remembers the choice for the next visit', async () => {
    renderAt(PROJECTS)

    await userEvent.click(screen.getByRole('button', { name: 'Rows' }))

    expect(screen.getByRole('button', { name: 'Rows' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(localStorage.getItem('frameboard.home.layout')).toBe('rows')
  })

  it('opens in rows when rows were chosen before', () => {
    localStorage.setItem('frameboard.home.layout', 'rows')

    renderAt(PROJECTS)

    expect(screen.getByRole('button', { name: 'Rows' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })

  it('says how to start a project when the board holds none', () => {
    renderAt([])

    expect(screen.getByText(/frameboard project add/)).toBeVisible()
  })
})
