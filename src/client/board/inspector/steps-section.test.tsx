import '../../styles.css'

import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { liveStore } from '@/client/live/store'
import type { Step } from '@/shared/present-steps'
import type { TreeElement } from '@/shared/records/elements'
import { dragOnto } from '@/test/drag-row'

import { trees } from '../element/tree'
import { clear, selectionStore } from '../selection'
import type { ElementEdit } from './element/write'
import { StepsSection } from './steps-section'

const FRAME = 'studio/home/hero'
const HASH = 'a'.repeat(64)

function stepped(
  name: string,
  index: number,
  step: Partial<Step> & { number: number },
  element: Partial<TreeElement> = {},
): TreeElement {
  return {
    index,
    parent: null,
    tag: 'p',
    name,
    textOnly: true,
    layout: 'block',
    round: false,
    placed: false,
    step: {
      effect: 'appear',
      start: 'click',
      durationMs: 400,
      delayMs: 0,
      plays: false,
      ...step,
    },
    ...element,
  }
}

const PLAIN: TreeElement = {
  index: 3,
  parent: null,
  tag: 'p',
  name: 'Plain',
  textOnly: true,
  layout: 'block',
  round: false,
  placed: false,
}

/** The frame's tree as the server last answered it. */
function holdTree(elements: TreeElement[], hash = HASH) {
  trees.store.setState({
    byRef: {
      [FRAME]: {
        status: 'ready',
        tree: { ref: FRAME, hash, elements },
        version: 0,
      },
    },
  })
}

/** The slide's live iframe on the canvas, which its previews play in. */
function showSlide() {
  const box = document.createElement('div')
  box.dataset.frame = FRAME
  box.append(document.createElement('iframe'))
  document.body.append(box)
  return box
}

type Preview = [index: number, effect: string, ms: number | undefined]

function mount(selected: number[] = []) {
  const batches: (readonly ElementEdit[])[] = []
  const previews: Preview[] = []
  render(
    <StepsSection
      page="studio/home"
      frame={FRAME}
      selected={selected}
      write={async (_page, edits) => {
        batches.push(edits)
        return true
      }}
      preview={(key, effect, ms) => previews.push([key.index, effect, ms])}
    />,
  )
  return { batches, previews }
}

const presses = () =>
  screen.queryAllByRole('listitem', { name: /^Press / }).map((press) =>
    within(press)
      .getAllByRole('button')
      .map((button) => button.ariaLabel)
      .filter((label) => !label?.startsWith('Preview ')),
  )

const row = (name: string) => {
  const item = screen
    .getByRole('button', { name: new RegExp(`^${name},`) })
    .closest('li')
  if (!item) throw new Error(`No row for ${name}`)
  return item
}

/** One batch as what it writes on each element, in order. */
const written = (edits: readonly ElementEdit[] | undefined) =>
  edits?.map(({ key, change }) => ({ index: key.index, change }))

let slide: HTMLElement | undefined

beforeEach(() => {
  liveStore.setState({ canWrite: true, reloads: {} })
})

afterEach(() => {
  slide?.remove()
  slide = undefined
  trees.store.setState({ byRef: {} })
  clear(selectionStore)
})

describe('the steps list', () => {
  it('lists one row a step by press with its effect and its start', () => {
    holdTree([
      stepped('Last', 4, { number: 5, effect: 'fade' }),
      PLAIN,
      stepped('First', 5, { number: 1 }),
      stepped('Beside', 6, { number: 1, effect: 'fly' }),
      stepped('Then', 7, { number: 2, start: 'after', effect: 'zoom' }),
    ])

    mount()

    expect(presses()).toEqual([
      [
        'First, Appear, on press',
        'Beside, Fly, with last',
        'Then, Zoom, after last',
      ],
      ['Last, Fade, on press'],
    ])
  })

  it('reads a first step as starting on the press, whatever it holds', () => {
    holdTree([stepped('Title', 4, { number: 1, start: 'after' })])

    mount()

    expect(presses()).toEqual([['Title, Appear, on press']])
  })

  it('lists a step inside a step, a hidden one, and a locked one', () => {
    holdTree([
      stepped('Card', 4, { number: 1 }),
      stepped('Inside', 5, { number: 2 }, { parent: 4 }),
      stepped('Hidden', 6, { number: 3 }, { hidden: true }),
      stepped('Locked', 7, { number: 4 }, { locked: true }),
    ])

    mount()

    expect(presses().flat()).toEqual([
      'Card, Appear, on press',
      'Inside, Appear, on press',
      'Hidden, hidden, Appear, on press',
      'Locked, Appear, on press',
    ])
  })

  it('says a slide holds no steps and what sets one', () => {
    holdTree([PLAIN])

    mount()

    expect(
      screen.getByText(
        'No steps yet. Select an element and set the step it appears on.',
      ),
    ).toBeVisible()
  })

  it('says why the server refused to address the slide', () => {
    trees.store.setState({
      byRef: {
        [FRAME]: {
          status: 'refused',
          message: 'the browser builds a <tbody> the file does not state',
          version: 0,
        },
      },
    })

    mount()

    expect(
      screen.getByText(
        'This slide’s steps cannot be listed. The browser builds a <tbody> the file does not state.',
      ),
    ).toBeVisible()
  })

  it('keeps its rows up while the tree is read again', () => {
    holdTree([stepped('Title', 4, { number: 1 })])
    mount()

    act(() =>
      trees.store.setState({
        byRef: { [FRAME]: { status: 'loading', version: 1 } },
      }),
    )

    expect(presses()).toEqual([['Title, Appear, on press']])
  })

  it('holds 40 steps and a long name inside its own box', () => {
    holdTree(
      Array.from({ length: 40 }, (_, at) =>
        stepped('A name of forty characters, all of them', at + 4, {
          number: at + 1,
        }),
      ),
    )
    mount()

    const list = screen.getAllByRole('list')[0]

    expect(list?.clientHeight).toBeLessThanOrEqual(248)
    expect(list?.scrollWidth).toBe(list?.clientWidth)
  })
})

describe('selecting a row', () => {
  it('selects its element at the tree’s bytes', async () => {
    holdTree([
      stepped('Title', 4, { number: 1 }),
      stepped('Body', 5, { number: 2 }),
    ])
    mount()

    await userEvent.click(screen.getByRole('button', { name: /^Body,/ }))

    expect(selectionStore.getState().element).toEqual({
      frame: FRAME,
      index: 5,
      hash: HASH,
    })
  })

  it('marks the selected element’s row', () => {
    holdTree([
      stepped('Title', 4, { number: 1 }),
      stepped('Body', 5, { number: 2 }),
    ])

    mount([5])

    expect(screen.getByRole('button', { current: true })).toHaveAccessibleName(
      /^Body,/,
    )
  })
})

describe('previewing a row', () => {
  it('plays the step’s effect for its own length', async () => {
    slide = showSlide()
    holdTree([
      stepped('Title', 4, { number: 1, effect: 'fly', durationMs: 900 }),
    ])
    const { previews } = mount()

    await userEvent.click(screen.getByRole('button', { name: 'Preview Title' }))

    expect(previews).toEqual([[4, 'fly', 900]])
  })

  it('turns previews off for a slide off screen, saying why', () => {
    holdTree([stepped('Title', 4, { number: 1 })])

    mount()

    expect(screen.getByRole('button', { name: 'Preview Title' })).toBeDisabled()
    expect(
      screen.getByText('Previews play once the slide is on screen.'),
    ).toBeVisible()
  })

  it('turns them on as the slide comes on screen', async () => {
    holdTree([stepped('Title', 4, { number: 1 })])
    mount()

    act(() => {
      slide = showSlide()
    })

    await expect
      .poll(() =>
        screen
          .getByRole('button', { name: 'Preview Title' })
          .hasAttribute('disabled'),
      )
      .toBe(false)
  })
})

describe('reordering', () => {
  const THREE = () =>
    holdTree([
      stepped('One', 4, { number: 1 }),
      stepped('Two', 5, { number: 3 }),
      stepped('Three', 6, { number: 7 }),
    ])

  it('writes every number in one batch at the tree’s bytes', async () => {
    THREE()
    const { batches } = mount()

    await dragOnto(row('Three'), row('One'), 'top')

    expect(batches).toHaveLength(1)
    expect(batches[0]?.map(({ key }) => key.hash)).toEqual([HASH, HASH])
    expect(written(batches[0])).toEqual([
      {
        index: 6,
        change: { kind: 'attribute', name: 'data-step', value: '1' },
      },
      {
        index: 4,
        change: { kind: 'attribute', name: 'data-step', value: '2' },
      },
    ])
  })

  it('moves a row across presses', async () => {
    THREE()
    const { batches } = mount()

    await dragOnto(row('One'), row('Two'), 'bottom')

    expect(written(batches[0])).toEqual([
      {
        index: 5,
        change: { kind: 'attribute', name: 'data-step', value: '1' },
      },
      {
        index: 4,
        change: { kind: 'attribute', name: 'data-step', value: '2' },
      },
      {
        index: 6,
        change: { kind: 'attribute', name: 'data-step', value: '3' },
      },
    ])
  })

  it('reorders a slide off screen', async () => {
    THREE()
    const { batches } = mount()

    await dragOnto(row('Three'), row('Two'), 'top')

    expect(batches).toHaveLength(1)
  })

  it('moves nothing in a read-only tab, which still selects', async () => {
    liveStore.setState({ canWrite: false })
    THREE()
    const { batches } = mount()

    await dragOnto(row('Three'), row('One'), 'top')
    await userEvent.click(screen.getByRole('button', { name: /^Two,/ }))

    expect(batches).toEqual([])
    expect(selectionStore.getState().element?.index).toBe(5)
  })
})
