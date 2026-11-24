import '../../styles.css'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { liveStore, receiveBoard } from '@/client/live/store'
import { createStructure } from '@/client/live/structure'
import { boardOf, frameOf, pageOf } from '@/test/board'

import { SlideSection } from './page-section'

const SWATCHES = frameOf('swatches', {
  name: 'Color swatches',
  box: { x: 460, y: 116, width: 640, height: 188 },
})
const SUNSET = frameOf('sunset', {
  box: { x: 460, y: 280, width: 640, height: 180 },
})

describe('This slide section', () => {
  beforeEach(() => {
    receiveBoard(liveStore, boardOf(pageOf([SWATCHES, SUNSET])))
    liveStore.setState({ canWrite: true })
  })

  function transitionCalls() {
    const sent: unknown[] = []
    const calls = createStructure(async (_path, init) => {
      sent.push(JSON.parse(String(init?.body)))
      return Response.json({ ok: true, data: [] })
    })
    return { sent, calls }
  }
  const pick = async (item: string) => {
    await userEvent.click(screen.getByRole('radio', { name: item }))
  }

  it('marks Same as page on a frame holding no transition', () => {
    render(<SlideSection frames={[SWATCHES]} />)

    expect(screen.getByRole('radio', { checked: true })).toHaveAccessibleName(
      'Same as page',
    )
  })

  it('marks no tile where the frames differ', () => {
    render(
      <SlideSection
        frames={[{ ...SWATCHES, transition: { name: 'zoom' } }, SUNSET]}
      />,
    )

    expect(screen.queryAllByRole('radio', { checked: true })).toEqual([])
  })

  it('sets a named transition on every frame in one write', async () => {
    const { sent, calls } = transitionCalls()
    render(<SlideSection frames={[SWATCHES, SUNSET]} calls={calls} />)

    await pick('Flip')

    expect(sent).toEqual([
      { refs: [SWATCHES.ref, SUNSET.ref], transition: { name: 'flip' } },
    ])
  })

  it("tiles the project's own after the built-ins and sets one by its name", async () => {
    const board = boardOf(pageOf([SWATCHES, SUNSET]))
    act(() =>
      receiveBoard(liveStore, {
        ...board,
        projects: board.projects.map((project) => ({
          ...project,
          transitions: ['wipe-up'],
        })),
      }),
    )
    const { sent, calls } = transitionCalls()
    render(<SlideSection frames={[SWATCHES]} calls={calls} />)

    const items = screen.getAllByRole('radio')
    await pick('wipe-up')

    expect(items.at(-1)).toHaveTextContent('wipe-up')
    expect(sent).toEqual([
      { refs: [SWATCHES.ref], transition: { name: 'wipe-up' } },
    ])
  })

  it('clears the override with Same as page, sending null', async () => {
    const { sent, calls } = transitionCalls()
    render(
      <SlideSection
        frames={[{ ...SWATCHES, transition: { name: 'zoom' } }]}
        calls={calls}
      />,
    )

    await pick('Same as page')

    expect(sent).toEqual([{ refs: [SWATCHES.ref], transition: null }])
  })
})
