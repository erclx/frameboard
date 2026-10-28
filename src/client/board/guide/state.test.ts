import { act, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { liveStore, receiveBoard } from '@/client/live/store'
import type { ListResult } from '@/shared/records/list'

import {
  agentFolder,
  armGuideLanding,
  guideStore,
  resetGuide,
  useGuideLanding,
} from './state'

describe('agentFolder', () => {
  it('names the folder holding a .frameboard board', () => {
    expect(agentFolder('/home/dev/acme/.frameboard')).toBe('/home/dev/acme')
  })

  it('names a --root board by its own folder', () => {
    expect(agentFolder('/home/dev/boards/acme')).toBe('/home/dev/boards/acme')
  })

  it('names the root folder for a .frameboard made there', () => {
    expect(agentFolder('/.frameboard')).toBe('/')
  })

  it('reads past a trailing slash', () => {
    expect(agentFolder('/home/dev/acme/.frameboard/')).toBe('/home/dev/acme')
  })

  it('keeps spaces in a folder name', () => {
    expect(agentFolder('/home/dev/My Designs/.frameboard')).toBe(
      '/home/dev/My Designs',
    )
  })
})

function untouchedBoard(): ListResult {
  return {
    root: '/board',
    projects: [
      {
        name: 'untitled',
        path: '/board/untitled',
        modifiedAt: '2026-10-25T09:00:00.000Z',
        createdAt: '2026-10-25T09:00:00.000Z',
        projectFileError: null,
        pages: [
          {
            ref: 'untitled/page-1',
            project: 'untitled',
            name: 'page-1',
            path: '/board/untitled/page-1',
            index: 0,
            layoutError: null,
            frames: [],
            sections: [],
          },
        ],
      },
    ],
  }
}

/** Renders the landing on home in a tab whose history the test reads. */
function renderLanding() {
  const memory = memoryLocation({ path: '/', record: true })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(Router, { hook: memory.hook, children })
  const view = renderHook(() => useGuideLanding(), { wrapper })
  return { memory, view }
}

describe('useGuideLanding', () => {
  beforeEach(() => {
    resetGuide()
    armGuideLanding('/')
    receiveBoard(liveStore, untouchedBoard())
  })

  afterEach(() => {
    resetGuide()
    liveStore.setState({ board: null, canWrite: false, accessKnown: false })
  })

  it('sends a writing tab on an untouched board to the start page', () => {
    liveStore.setState({ canWrite: true, accessKnown: true })

    const { memory } = renderLanding()

    expect(memory.history).toEqual(['/p/untitled/page-1'])
  })

  it('holds home and waits until access is known', () => {
    const { memory, view } = renderLanding()

    expect(view.result.current).toBe(true)
    expect(memory.history).toEqual(['/'])
    act(() => liveStore.setState({ canWrite: true, accessKnown: true }))
    expect(memory.history).toEqual(['/p/untitled/page-1'])
  })

  it('leaves a view-only tab on home', () => {
    liveStore.setState({ canWrite: false, accessKnown: true })

    const { memory, view } = renderLanding()

    expect(memory.history).toEqual(['/'])
    expect(view.result.current).toBe(false)
  })

  it('fires once per tab, so a later way home shows home', () => {
    liveStore.setState({ canWrite: true, accessKnown: true })
    renderLanding().view.unmount()

    const { memory, view } = renderLanding()

    expect(memory.history).toEqual(['/'])
    expect(view.result.current).toBe(false)
  })

  it('leaves home for a tab that first opened on a page', () => {
    liveStore.setState({ canWrite: true, accessKnown: true })
    armGuideLanding('/p/untitled/page-1')

    const { memory, view } = renderLanding()

    expect(memory.history).toEqual(['/'])
    expect(view.result.current).toBe(false)
  })

  it('leaves home once the guide is skipped', () => {
    liveStore.setState({ canWrite: true, accessKnown: true })
    guideStore.setState({ phase: 'done' })

    const { memory } = renderLanding()

    expect(memory.history).toEqual(['/'])
  })
})
