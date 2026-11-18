import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { liveStore } from '@/client/live/store'
import { boardOf, pageOf } from '@/test/board'

import { EditKeyframes, TransitionKeyframes } from './transition'

const shared = () => document.querySelectorAll('#fb-present-keyframes')

afterEach(() => {
  liveStore.setState({ board: null })
})

describe('the keyframes mount', () => {
  it('defines the built-ins once while the overlay and the inspector both hold them', () => {
    render(
      <>
        <TransitionKeyframes own="" />
        <EditKeyframes project="studio" />
      </>,
    )

    expect(shared()).toHaveLength(1)
  })

  it('keeps the built-ins while the inspector holds them after presenting ends', () => {
    const overlay = render(<TransitionKeyframes own="" />)
    const inspector = render(<EditKeyframes project="studio" />)

    overlay.unmount()
    const kept = shared().length
    inspector.unmount()

    expect([kept, shared().length]).toEqual([1, 0])
  })

  it("mounts a project's own keyframes in Edit, read by the project's name", async () => {
    const board = boardOf(pageOf([]))
    liveStore.setState({
      board: {
        ...board,
        projects: board.projects.map((project) => ({
          ...project,
          transitions: ['rise'],
        })),
      },
    })
    const asked: string[] = []
    const css = '@keyframes fb-own-studio--rise-enter { from { opacity: 0 } }'

    const { container } = render(
      <EditKeyframes
        project="studio"
        load={async (project) => {
          asked.push(project)
          return { transitions: [{ name: 'rise', css }] }
        }}
      />,
    )

    await waitFor(() =>
      expect(
        container.querySelector('style[data-own-transitions]')?.textContent,
      ).toBe(css),
    )
    expect(asked).toEqual(['studio'])
  })
})
