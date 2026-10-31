import '../../../styles.css'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { TooltipProvider } from '@/client/components/ui/tooltip'

import type { FreeSpot } from '../../place/write'
import { PositionSection } from './position'
import type { Placement } from './styles'
import type { ElementChange } from './write'

/** An element in the flow at 24, 16 in its parent, 120 by 40. */
function placementOf(overrides: Partial<Placement> = {}): Placement {
  return {
    free: false,
    left: 24,
    top: 16,
    width: 120,
    height: 40,
    ...overrides,
  }
}

/** Renders the section, recording each place call, write, and preview. */
function renderSection(placement: Placement) {
  const places: (FreeSpot | null)[] = []
  const changes: ElementChange[] = []
  const previews: [string, string | null][] = []
  render(
    <TooltipProvider>
      <PositionSection
        placement={placement}
        disabled={false}
        write={async (change) => {
          changes.push(change)
          return true
        }}
        preview={(property, value) => previews.push([property, value])}
        place={async (spot) => {
          places.push(spot)
          return true
        }}
      />
    </TooltipProvider>,
  )
  return { places, changes, previews }
}

/**
 * Drags a scrub area right by `moves` steps of base-ui's default two
 * pixels, as a locked pointer reports them, and releases it.
 */
function scrubBy(area: HTMLElement, moves: number) {
  act(() => {
    area.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        pointerType: 'mouse',
      }),
    )
  })
  for (let move = 0; move < moves; move++) {
    act(() => {
      window.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, movementX: 2 }),
      )
    })
  }
  act(() => {
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  })
}

describe('PositionSection', () => {
  it('places an in-flow element where it renders, at its size, in one call', async () => {
    const { places } = renderSection(placementOf())

    await userEvent.click(screen.getByRole('button', { name: 'Free' }))

    expect(places).toEqual([{ left: 24, top: 16, width: 120, height: 40 }])
  })

  it('leaves out a size that resolves to no length', async () => {
    const { places } = renderSection(placementOf({ width: null }))

    await userEvent.click(screen.getByRole('button', { name: 'Free' }))

    expect(places).toEqual([{ left: 24, top: 16, height: 40 }])
  })

  it('puts a placed element back in the flow', async () => {
    const { places } = renderSection(placementOf({ free: true }))

    await userEvent.click(screen.getByRole('button', { name: 'In flow' }))

    expect(places).toEqual([null])
  })

  it('sends nothing for the option already chosen', async () => {
    const { places } = renderSection(placementOf({ free: true }))

    await userEvent.click(screen.getByRole('button', { name: 'Free' }))

    expect(places).toEqual([])
  })

  it('shows no X or Y in the flow', () => {
    renderSection(placementOf())

    expect(
      screen.queryByRole('textbox', { name: /position in its parent/ }),
    ).toBeNull()
  })

  it('previews an X scrub and writes left once on release', () => {
    const { changes, previews } = renderSection(placementOf({ free: true }))

    scrubBy(screen.getByText('X'), 3)

    expect([previews[0]?.[0], changes]).toEqual([
      'left',
      [
        {
          kind: 'style',
          property: 'left',
          value: expect.stringMatching(/^\d+px$/),
        },
      ],
    ])
  })

  it('writes a typed Y as top in px', async () => {
    const { changes } = renderSection(placementOf({ free: true }))

    const field = screen.getByRole('textbox', {
      name: 'Y position in its parent',
    })
    await userEvent.clear(field)
    await userEvent.type(field, '40{Enter}')

    expect(changes).toEqual([{ kind: 'style', property: 'top', value: '40px' }])
  })

  it('says on Free that it positions the element inside its parent', async () => {
    renderSection(placementOf())

    await userEvent.hover(screen.getByRole('button', { name: 'Free' }))

    expect(
      await screen.findByText('Free positions it inside its parent', {
        selector: '[data-slot="tooltip-content"]',
      }),
    ).toBeInTheDocument()
  })
})
