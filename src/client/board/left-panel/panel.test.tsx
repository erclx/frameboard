import '../../styles.css'

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { registerActions } from '@/client/actions/registry'
import { TooltipProvider } from '@/client/components/ui/tooltip'
import type {
  FrameRecord,
  PageRecord,
  ProjectRecord,
} from '@/shared/records/list'

import { LeftPanel } from './panel'

function frame(name: string, extra: Partial<FrameRecord> = {}): FrameRecord {
  return {
    ref: `studio/home/${name}`,
    project: 'studio',
    page: 'home',
    name,
    path: `/board/studio/home/${name}.html`,
    box: { x: 0, y: 0, width: 400, height: 300 },
    order: 0,
    hidden: false,
    locked: false,
    placed: true,
    modifiedAt: '2026-10-15T00:00:00.000Z',
    ...extra,
  }
}

function page(name: string, frames: FrameRecord[] = []): PageRecord {
  return {
    ref: `studio/${name}`,
    project: 'studio',
    name,
    path: `/board/studio/${name}`,
    index: 0,
    layoutError: null,
    frames,
  }
}

function project(pages: PageRecord[]): ProjectRecord {
  return {
    name: 'studio',
    path: '/board/studio',
    modifiedAt: '2026-10-15T00:00:00.000Z',
    createdAt: null,
    projectFileError: null,
    pages,
  }
}

function renderPanel(
  record: ProjectRecord,
  current = 'home',
  assets?: ReactNode,
) {
  render(
    <Router hook={memoryLocation({ path: '/' }).hook}>
      <TooltipProvider>
        <LeftPanel project={record} page={current} assets={assets} />
      </TooltipProvider>
    </Router>,
  )
}

const cleanups: (() => void)[] = []

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

describe('LeftPanel', () => {
  it('opens on the Design tab with Theme waiting on its body', () => {
    renderPanel(project([page('home')]))

    expect(screen.getByRole('tab', { name: 'Design' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: 'Theme' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('leaves Assets disabled with no body and opens it when given one', async () => {
    renderPanel(project([page('home')]))
    expect(screen.getByRole('tab', { name: 'Assets' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    cleanup()

    renderPanel(project([page('home')]), 'home', <p>the files</p>)
    await userEvent.click(screen.getByRole('tab', { name: 'Assets' }))

    expect(screen.getByText('the files')).toBeVisible()
  })

  it("lists the page's frames, a hidden one marked so", () => {
    renderPanel(
      project([
        page('home', [frame('hero'), frame('footer', { hidden: true })]),
      ]),
    )

    expect(
      screen.getAllByRole('listitem').map((item) => item.ariaLabel),
    ).toContain('footer, hidden')
  })

  it('says when the page has no frames', () => {
    renderPanel(project([page('home')]))

    expect(screen.getByText('No frames on this page')).toBeInTheDocument()
  })

  it('hides the UI from its header button', async () => {
    let runs = 0
    cleanups.push(
      registerActions([
        {
          id: 'view.hideUi',
          label: 'Hide UI',
          group: 'view',
          run: () => (runs += 1),
        },
      ]),
    )
    renderPanel(project([page('home')]))

    await userEvent.click(screen.getByRole('button', { name: 'Hide UI' }))

    expect(runs).toBe(1)
  })
})
