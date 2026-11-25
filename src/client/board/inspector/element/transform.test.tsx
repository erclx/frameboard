import '../../../styles.css'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { TooltipProvider } from '@/client/components/ui/tooltip'
import type { Placement } from '@/shared/frame-bridge/live-element'
import type {
  ModelReading,
  ModelStage,
  ModelTransform,
} from '@/shared/frame-bridge/model'

import { handlesStore } from '../../element/model-handles/store'
import type { FreeSpot } from '../../place/write'
import { TransformSection } from './transform'
import type { ElementChange } from './write'

const UNSTAGED: ModelReading['staged'] = {
  'camera-orbit': null,
  'min-camera-orbit': null,
  'max-camera-orbit': null,
  'camera-target': null,
  'field-of-view': null,
  'max-field-of-view': null,
  orientation: null,
  scale: null,
  'animation-name': null,
  autoplay: null,
}

const REST = { scale: { x: 1, y: 1, z: 1 }, depth: 0 }

function readingOf(over: Partial<ModelReading> = {}): ModelReading {
  return {
    src: '../assets/phone.glb',
    loaded: true,
    clips: [],
    orbit: { theta: 0, phi: 75 },
    camera: { distance: 3, view: 30 },
    bounds: { center: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1, z: 1 } },
    staged: UNSTAGED,
    ...over,
  }
}

const stating = (staged: Partial<ModelReading['staged']>) =>
  readingOf({ staged: { ...UNSTAGED, ...staged } })

const FREE: Placement = {
  free: true,
  left: 195,
  top: 542,
  width: 195,
  height: 110,
  inline: { width: '195px', height: '110px' },
  wordsLeft: null,
}

const ANSWER: ModelStage[] = [
  { name: 'scale', value: '2 2 2' },
  { name: 'camera-target', value: null },
  { name: 'camera-orbit', value: '0deg 75deg 3m' },
]

/** Renders the section over `reading`, recording each act, a held transform answering `ANSWER`. */
function renderSection(
  reading: ModelReading = readingOf(),
  { placement = FREE, disabled = false, written = true } = {},
) {
  const staged: ModelStage[][] = []
  const previews: ModelTransform[] = []
  const held: ModelTransform[] = []
  const writes: ModelStage[][] = []
  const changes: ElementChange[] = []
  const places: (FreeSpot | null)[] = []
  render(
    <TooltipProvider>
      <TransformSection
        element={{ frame: 'studio/home/hero', index: 3 }}
        model={{
          reading,
          stage: (stages) => staged.push([...stages]),
          preview: (transform) => previews.push(transform),
          hold: async (transform) => {
            held.push(transform)
            return ANSWER
          },
        }}
        placement={placement}
        disabled={disabled}
        write={async (change) => {
          changes.push(change)
          return true
        }}
        writeStaged={async (stages) => {
          writes.push([...stages])
          return written
        }}
        place={async (spot) => {
          places.push(spot)
          return true
        }}
      />
    </TooltipProvider>,
  )
  return { staged, previews, held, writes, changes, places }
}

const field = (name: string) => screen.getByRole('textbox', { name })
const Z = 'Z, meters nearer in its scene'

async function typeInto(name: string, value: string) {
  await userEvent.clear(field(name))
  await userEvent.type(field(name), `${value}{Enter}`)
}

afterEach(() => act(() => handlesStore.setState({ mode: 'move', links: {} })))

describe('TransformSection', () => {
  it('shows the place, rotation, and size of each axis', () => {
    renderSection(
      stating({
        orientation: '10deg 20deg 30deg',
        scale: '1 2 3',
        'camera-target': 'auto auto -0.5m',
      }),
    )

    const shown = [
      'X position in its parent',
      'Y position in its parent',
      Z,
      'Rotation X',
      'Rotation Y',
      'Rotation Z',
      'Scale X',
      'Scale Y',
      'Scale Z',
    ].map((name) => (field(name) as HTMLInputElement).value)
    expect(shown).toEqual([
      '195',
      '542',
      '0.5',
      '20°',
      '30°',
      '10°',
      '1',
      '2',
      '3',
    ])
  })

  it.each([
    ['X position in its parent', 'left'],
    ['Y position in its parent', 'top'],
  ])('writes %s as its own declaration', async (name, property) => {
    const { changes } = renderSection()

    await typeInto(name, '40')

    expect(changes).toEqual([{ kind: 'style', property, value: '40px' }])
  })

  it.each([
    ['Rotation X', '20', '0deg 20deg 0deg'],
    ['Rotation Y', '-30', '0deg 0deg -30deg'],
    ['Rotation Z', '45', '45deg 0deg 0deg'],
  ])('writes %s as the orientation', async (name, value, orientation) => {
    const { writes } = renderSection()

    await typeInto(name, value)

    expect(writes).toEqual([[{ name: 'orientation', value: orientation }]])
  })

  it('holds a depth with the size as it is', async () => {
    const { held } = renderSection(stating({ scale: '1 2 3' }))

    await typeInto(Z, '0.5')

    expect(held).toEqual([{ scale: { x: 1, y: 2, z: 3 }, depth: 0.5 }])
  })

  it.each(['X', 'Y', 'Z'])(
    'sizes every axis from %s while linked',
    async (axis) => {
      const { held } = renderSection()

      await typeInto(`Scale ${axis}`, '2')

      expect(held).toEqual([{ scale: { x: 2, y: 2, z: 2 }, depth: 0 }])
    },
  )

  it('sizes one axis alone once unlinked', async () => {
    const { held } = renderSection()
    await userEvent.click(screen.getByRole('button', { name: 'Scale linked' }))

    await typeInto('Scale Y', '2')

    expect(held).toEqual([{ scale: { x: 1, y: 2, z: 1 }, depth: 0 }])
  })

  it('starts unlinked for a model whose axes already differ', () => {
    renderSection(stating({ scale: '1 2 3' }))

    expect(screen.getByRole('button', { name: 'Scale unlinked' })).toBeEnabled()
  })

  it('keeps the ratio of differing axes once they are linked again', async () => {
    const { held } = renderSection(stating({ scale: '1 2 3' }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Scale unlinked' }),
    )

    await typeInto('Scale X', '2')

    expect(held).toEqual([{ scale: { x: 2, y: 4, z: 6 }, depth: 0 }])
  })

  it('holds a typed size of zero at the smallest', async () => {
    const { held } = renderSection()

    await typeInto('Scale X', '0')

    expect(held).toEqual([{ scale: { x: 0.01, y: 0.01, z: 0.01 }, depth: 0 }])
  })

  it('previews a step and holds it on keyup', async () => {
    const { previews, held } = renderSection()

    await userEvent.click(field('Scale X'))
    await userEvent.keyboard('{ArrowUp}')

    const stepped = { scale: { x: 1.1, y: 1.1, z: 1.1 }, depth: 0 }
    expect(previews).toEqual([stepped])
    expect(held).toEqual([stepped])
  })

  it('writes only what the page did not already state, as one write', async () => {
    const { writes } = renderSection(
      stating({ 'camera-orbit': '0deg 75deg 3m' }),
    )

    await typeInto('Scale X', '2')

    expect(writes).toEqual([[{ name: 'scale', value: '2 2 2' }]])
  })

  it('puts the size, camera, and view back when the write is refused', async () => {
    const { staged } = renderSection(
      stating({ 'camera-orbit': '9deg 75deg 6m' }),
      {
        written: false,
      },
    )

    await typeInto('Scale X', '2')

    expect(staged[0]).toEqual([
      { name: 'scale', value: null },
      { name: 'camera-target', value: null },
      { name: 'camera-orbit', value: '9deg 75deg 6m' },
      { name: 'min-camera-orbit', value: null },
      { name: 'max-camera-orbit', value: null },
      { name: 'max-field-of-view', value: null },
      { name: 'field-of-view', value: null },
    ])
  })

  it('puts a previewed step back on Esc', async () => {
    const { held, staged } = renderSection()

    await userEvent.click(field('Scale X'))
    await userEvent.keyboard('{ArrowUp>}{Escape}')

    expect(held).toEqual([])
    expect(staged).toEqual([
      [
        { name: 'scale', value: null },
        { name: 'camera-target', value: null },
      ],
    ])
  })

  it('places the model where it renders on Absolute', async () => {
    const { places } = renderSection(readingOf(), {
      placement: { ...FREE, free: false, left: 24, top: 16 },
    })

    await userEvent.click(screen.getByRole('button', { name: 'Absolute' }))

    expect(places).toEqual([{ left: 24, top: 16, width: 195, height: 110 }])
  })

  it('turns X and Y off in the flow and keeps Z', () => {
    renderSection(readingOf(), { placement: { ...FREE, free: false } })

    expect(field('X position in its parent')).toBeDisabled()
    expect(field('Y position in its parent')).toBeDisabled()
    expect(field(Z)).toBeEnabled()
  })

  it('turns off the fields a missing model cannot hold and keeps its rotation', () => {
    renderSection(readingOf({ loaded: false, camera: null, bounds: null }))

    expect(field(Z)).toBeDisabled()
    expect(field('Scale X')).toBeDisabled()
    expect(field('Rotation X')).toBeEnabled()
  })

  it('leaves a target it cannot read alone as the model sizes', async () => {
    const { held } = renderSection(
      stating({ 'camera-target': 'auto auto calc(1m + 1m)' }),
    )

    await typeInto('Scale X', '2')

    expect(held).toEqual([
      { ...REST, scale: { x: 2, y: 2, z: 2 }, depth: null },
    ])
  })

  it('takes no edit while the board cannot write', () => {
    renderSection(readingOf(), { disabled: true })

    expect(field('Rotation X')).toBeDisabled()
    expect(field('Scale X')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Scale linked' })).toBeDisabled()
  })
})
