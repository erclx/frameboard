import '../styles.css'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import type { ProjectRecord } from '@/shared/records/list'

import { Home } from './home'
import type { HomeLayout } from './layout'
import { Projects } from './projects'

const NOW = Date.parse('2026-10-15T12:00:00.000Z')

function project(
  name: string,
  modifiedAt: string,
  pages = ['home'],
  createdAt: string | null = null,
): ProjectRecord {
  return {
    name,
    path: `/board/${name}`,
    modifiedAt,
    createdAt,
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
  project(
    'studio',
    '2026-10-15T09:00:00.000Z',
    ['landing', 'pricing'],
    '2026-09-02T10:00:00.000Z',
  ),
  project('webapp', '2026-10-13T12:00:00.000Z'),
]

function renderProjects(layout: HomeLayout) {
  const memory = memoryLocation({ path: '/', record: true })
  render(
    <Router hook={memory.hook}>
      <Projects projects={PROJECTS} layout={layout} now={NOW} />
    </Router>,
  )
  return memory
}

function renderHome(projects: ProjectRecord[]) {
  render(
    <Router hook={memoryLocation({ path: '/' }).hook}>
      <Home projects={projects} />
    </Router>,
  )
}

afterEach(() => {
  localStorage.clear()
})

describe('Projects', () => {
  it('shows each project as a card with when it was last edited', () => {
    renderProjects('grid')

    expect(screen.getByRole('link', { name: /studio/ })).toHaveTextContent(
      'Edited 3 hours ago',
    )
    expect(screen.getByRole('link', { name: /webapp/ })).toHaveTextContent(
      'Edited 2 days ago',
    )
  })

  it("opens a project's first page", async () => {
    const memory = renderProjects('grid')

    await userEvent.click(screen.getByRole('link', { name: /studio/ }))

    expect(memory.history.at(-1)).toBe('/p/studio/landing')
  })

  it('shows the day a row was made', () => {
    renderProjects('list')

    expect(screen.getByRole('link', { name: /studio/ })).toHaveTextContent(
      '2026-09-02',
    )
  })

  it('leaves the made day empty on a project that records none', () => {
    renderProjects('list')

    expect(screen.getByRole('link', { name: /webapp/ })).toHaveTextContent(
      /^webapp2 days ago$/,
    )
  })
})

describe('Home', () => {
  it('switches to the list and remembers it for the next visit', async () => {
    renderHome(PROJECTS)

    await userEvent.click(screen.getByRole('button', { name: 'List' }))

    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(localStorage.getItem('frameboard.home.layout')).toBe('list')
  })

  it('opens in the list when the list was chosen before', () => {
    localStorage.setItem('frameboard.home.layout', 'list')

    renderHome(PROJECTS)

    expect(screen.getByText('Created')).toBeInTheDocument()
  })

  it('shows New project disabled until its action registers', () => {
    renderHome(PROJECTS)

    expect(screen.getByRole('button', { name: 'New project' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('says how to start a project when the board holds none', () => {
    renderHome([])

    expect(
      screen.getByRole('heading', { name: 'No projects yet' }),
    ).toBeVisible()
    expect(screen.getByText('frameboard project add <name>')).toBeVisible()
  })
})
