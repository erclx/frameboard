import '../../styles.css'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { liveStore } from '@/client/live/store'
import { boardOf, pageOf } from '@/test/board'

import type { TilePicture } from './effect-tile'
import { EffectTiles, type TileOption } from './effect-tiles'
import { PageSection } from './page-section'

const travel = (name: string): TilePicture => ({
  kind: 'transition',
  travel: { transition: { name, direction: null, ms: 500 }, back: false },
  project: 'studio',
})

const OPTIONS: TileOption[] = [
  { value: 'none', label: 'None', picture: { kind: 'still' } },
  { value: 'fade', label: 'Fade', picture: travel('fade') },
  { value: 'zoom', label: 'Zoom', picture: travel('zoom') },
]

/** The grid as a section holds it, keeping each pick as the stored value. */
function Holding({
  initial,
  disabled,
  picked,
  previews,
}: {
  initial: string | null
  disabled: boolean
  picked: string[]
  previews: string[]
}) {
  const [current, setCurrent] = useState(initial)
  return (
    <>
      <span id="tiles-label">Slide transition</span>
      <EffectTiles
        labelledBy="tiles-label"
        options={OPTIONS}
        current={current}
        columns={4}
        disabled={disabled}
        onPick={(value) => {
          picked.push(value)
          setCurrent(value)
        }}
        onPreview={(value) => previews.push(value)}
        onPreviewEnd={() => previews.push('end')}
      />
    </>
  )
}

/** Mounts the grid holding `current`, recording each pick and preview. */
function mount(current: string | null, disabled = false) {
  const picked: string[] = []
  const previews: string[] = []
  render(
    <Holding
      initial={current}
      disabled={disabled}
      picked={picked}
      previews={previews}
    />,
  )
  return { picked, previews }
}

const tile = (name: string) => screen.getByRole('radio', { name })

/** Answers the reduced motion query as `reduced`. */
function motion(reduced: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) => ({ matches: reduced, media: query }) as MediaQueryList,
  )
}

beforeEach(() => {
  motion(false)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the effect tiles', () => {
  it('names the group by its caption and marks the held tile', () => {
    mount('fade')

    expect(
      screen.getByRole('radiogroup', { name: 'Slide transition' }),
    ).toContainElement(
      screen.getByRole('radio', { checked: true, name: 'Fade' }),
    )
  })

  it('writes the tile clicked', async () => {
    const { picked } = mount('none')

    await userEvent.click(tile('Zoom'))

    expect(picked).toEqual(['zoom'])
  })

  it('writes nothing for a click on the held tile', async () => {
    const { picked } = mount('fade')

    await userEvent.click(tile('Fade'))

    expect(picked).toEqual([])
  })

  it('moves the pick and the focus with an arrow key', async () => {
    const { picked } = mount('fade')
    tile('Fade').focus()

    await userEvent.keyboard('{ArrowRight}')

    expect([picked, document.activeElement]).toEqual([['zoom'], tile('Zoom')])
  })

  it('puts back the value held when focus came in on Escape', async () => {
    const { picked } = mount('fade')
    tile('Fade').focus()
    await userEvent.keyboard('{ArrowRight}')
    picked.length = 0

    await userEvent.keyboard('{Escape}')

    expect(picked).toEqual(['fade'])
  })

  it('marks no tile where nothing is held, keeping the first in the tab order', () => {
    mount(null)

    expect([
      screen.queryAllByRole('radio', { checked: true }),
      tile('None').tabIndex,
    ]).toEqual([[], 0])
  })

  it('previews a tile on hover and ends it on leaving, writing nothing', async () => {
    const { picked, previews } = mount('none')

    await userEvent.hover(tile('Zoom'))
    await userEvent.unhover(tile('Zoom'))

    expect([previews, picked]).toEqual([['zoom', 'end'], []])
  })

  it("plays the tile's own keyframes once on hover", async () => {
    mount('none')

    await userEvent.hover(tile('Zoom'))

    const layer = tile('Zoom').querySelector<HTMLElement>(
      '[data-tile-layer="enter"]',
    )
    expect([
      layer?.style.animationName,
      layer?.style.animationPlayState,
    ]).toEqual(['fb-present-zoom-enter', 'running'])
  })

  it('holds every tile still under reduced motion', async () => {
    motion(true)
    mount('none')

    await userEvent.hover(tile('Zoom'))

    const layer = tile('Zoom').querySelector<HTMLElement>(
      '[data-tile-layer="enter"]',
    )
    expect(layer?.style.animationPlayState).toBe('paused')
  })

  it('previews nothing while the board is read only', async () => {
    const { previews } = mount('none', true)

    await userEvent.hover(tile('Zoom'), { pointerEventsCheck: 0 })

    expect(previews.filter((value) => value !== 'end')).toEqual([])
  })
})

describe("a project's own transition", () => {
  afterEach(() => {
    liveStore.setState({ canWrite: false, board: null })
  })

  it('shows as a tile after the built-ins, playing its own renamed keyframes', async () => {
    const page = { ...pageOf([]), transition: { name: 'rise' } }
    const board = boardOf(page)
    liveStore.setState({
      canWrite: true,
      board: {
        ...board,
        projects: board.projects.map((project) => ({
          ...project,
          transitions: ['rise'],
        })),
      },
    })
    render(<PageSection page={page} />)

    await userEvent.hover(tile('rise'))

    expect({
      order: screen.getAllByRole('radio').map((radio) => radio.textContent),
      checked: tile('rise').getAttribute('aria-checked'),
      animation: tile('rise').querySelector<HTMLElement>(
        '[data-tile-layer="enter"]',
      )?.style.animationName,
    }).toEqual({
      order: [
        'None',
        'Fade',
        'Slide',
        'Push',
        'Zoom',
        'Flip',
        'Dissolve',
        'rise',
      ],
      checked: 'true',
      animation: 'fb-own-studio--rise-enter',
    })
  })
})
