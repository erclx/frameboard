import '../styles.css'

import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { modeStore } from '@/client/board/mode'
import { liveStore } from '@/client/live/store'

import { ViewOnlyNotice } from './notice'

const COPY = 'View only. Run frameboard open to edit'

function renderAt(path: string) {
  render(
    <Router hook={memoryLocation({ path }).hook}>
      <ViewOnlyNotice />
    </Router>,
  )
}

function live(state: Partial<ReturnType<typeof liveStore.getState>>): void {
  act(() => liveStore.setState(state))
}

afterEach(() => {
  act(() => {
    liveStore.setState({
      connected: false,
      canWrite: false,
      accessKnown: false,
    })
    modeStore.setState({ mode: 'edit' })
  })
})

describe('ViewOnlyNotice', () => {
  it('says the tab reads and names the fix once the server answers no', () => {
    live({ connected: true, accessKnown: true, canWrite: false })
    renderAt('/')

    expect(screen.getByRole('status')).toHaveTextContent(COPY)
  })

  it('shows nothing before the first answer', () => {
    live({ connected: true, accessKnown: false, canWrite: false })
    renderAt('/')

    expect(screen.queryByText(COPY)).toBeNull()
  })

  it('shows nothing in a tab that writes', () => {
    live({ connected: true, accessKnown: true, canWrite: true })
    renderAt('/')

    expect(screen.queryByText(COPY)).toBeNull()
  })

  it('leaves the slot to Reconnecting while the socket is down', () => {
    live({ connected: false, accessKnown: false, canWrite: false })
    renderAt('/')

    expect(screen.queryByText(COPY)).toBeNull()
  })

  it('appears when a writing tab loses its cookie on a restart', () => {
    live({ connected: true, accessKnown: true, canWrite: true })
    renderAt('/')

    live({ connected: false, accessKnown: false, canWrite: false })
    live({ connected: true, accessKnown: true, canWrite: false })

    expect(screen.getByRole('status')).toHaveTextContent(COPY)
  })

  it('steps aside for the Play banner on the board', () => {
    live({ connected: true, accessKnown: true, canWrite: false })
    act(() => modeStore.setState({ mode: 'play' }))
    renderAt('/p/studio/home')

    expect(screen.queryByText(COPY)).toBeNull()
  })

  it('still shows on home while the mode left behind reads Play', () => {
    live({ connected: true, accessKnown: true, canWrite: false })
    act(() => modeStore.setState({ mode: 'play' }))
    renderAt('/')

    expect(screen.getByRole('status')).toHaveTextContent(COPY)
  })
})
