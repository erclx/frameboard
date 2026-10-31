import '../../../styles.css'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { TooltipProvider } from '@/client/components/ui/tooltip'
import type { ElementFlow } from '@/shared/records/elements'

import { LayoutSection } from './layout'
import type { LiveLayout } from './styles'
import type { ElementChange } from './write'

/** A block container under a block parent, 200 by 100, with nothing set, unless overridden. */
function layoutOf(overrides: Partial<LiveLayout> = {}): LiveLayout {
  return {
    flow: 'block',
    inline: false,
    direction: 'row',
    wrap: 'nowrap',
    justify: 'normal',
    alignItems: 'normal',
    ownJustify: false,
    rowGap: 0,
    columnGap: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    parent: 'block',
    parentAlignItems: 'normal',
    width: 200,
    height: 100,
    ...overrides,
  }
}

const ROW = layoutOf({ flow: 'horizontal', direction: 'row' })

/** A static read naming no rule, with the given modes. */
function flowOf(
  size: ElementFlow['size'] = { width: null, height: 'hug' },
  rule: ElementFlow['rule'] = null,
): ElementFlow {
  return { rule, size }
}

/** Renders the section over a write that records each change. */
function renderSection(
  layout: LiveLayout,
  flow: ElementFlow | undefined = flowOf(),
  { textOnly = false } = {},
) {
  const changes: ElementChange[] = []
  render(
    <TooltipProvider>
      <LayoutSection
        layout={layout}
        flow={flow}
        textOnly={textOnly}
        disabled={false}
        write={async (change) => {
          changes.push(change)
          return true
        }}
      />
    </TooltipProvider>,
  )
  return changes
}

describe('LayoutSection flow', () => {
  it('writes only the direction when a row turns vertical', async () => {
    const changes = renderSection(ROW)

    await userEvent.click(screen.getByRole('button', { name: 'Vertical' }))

    expect(changes).toEqual([
      {
        kind: 'styles',
        declarations: [{ property: 'flex-direction', value: 'column' }],
      },
    ])
  })

  it('adds flow to a block stack as a flex column, leaving its children alone', async () => {
    const changes = renderSection(layoutOf())

    await userEvent.click(screen.getByRole('button', { name: 'Add flow' }))

    expect(changes).toEqual([
      {
        kind: 'styles',
        declarations: [
          { property: 'display', value: 'flex' },
          { property: 'flex-direction', value: 'column' },
        ],
      },
    ])
  })

  it('writes display alone for Grid, so no track is written', async () => {
    const changes = renderSection(ROW)

    await userEvent.click(screen.getByRole('button', { name: 'Grid' }))

    expect(changes).toEqual([
      {
        kind: 'styles',
        declarations: [{ property: 'display', value: 'grid' }],
      },
    ])
  })

  it('writes the wrap on a row turning to Wrap', async () => {
    const changes = renderSection(ROW)

    await userEvent.click(screen.getByRole('button', { name: 'Wrap' }))

    expect(changes).toEqual([
      {
        kind: 'styles',
        declarations: [{ property: 'flex-wrap', value: 'wrap' }],
      },
    ])
  })

  it('keeps an inline flex inline when it turns to Grid', async () => {
    const changes = renderSection({ ...ROW, inline: true })

    await userEvent.click(screen.getByRole('button', { name: 'Grid' }))

    expect(changes).toEqual([
      {
        kind: 'styles',
        declarations: [{ property: 'display', value: 'inline-grid' }],
      },
    ])
  })

  it('offers no flow on an element holding text alone', () => {
    renderSection(layoutOf(), flowOf(), { textOnly: true })

    expect(screen.queryByRole('button', { name: 'Vertical' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add flow' })).toBeNull()
  })
})

describe('LayoutSection rule caption', () => {
  it('names a shared rule and how many elements it matches', () => {
    renderSection(ROW, flowOf(undefined, { selector: '.row', count: 9 }))

    expect(screen.getByText('.row')).toBeVisible()
    expect(screen.getByText(/shared by 9 elements/)).toBeVisible()
  })

  it('says nothing for a rule only this element matches', () => {
    renderSection(ROW, flowOf(undefined, { selector: '#hero', count: 1 }))

    expect(screen.queryByText(/shared by/)).toBeNull()
  })

  it('says nothing before the static read answers', () => {
    renderSection(ROW, undefined)

    expect(screen.queryByText(/shared by/)).toBeNull()
  })
})

describe('LayoutSection gap and alignment', () => {
  it('writes the gap in px', async () => {
    const changes = renderSection({ ...ROW, columnGap: 8 })

    const gap = screen.getByRole('textbox', { name: 'Gap' })
    await userEvent.clear(gap)
    await userEvent.type(gap, '12{Enter}')

    expect(changes).toEqual([{ kind: 'style', property: 'gap', value: '12px' }])
  })

  it('gives a grid a gap and no alignment or Auto gap', async () => {
    const changes = renderSection(layoutOf({ flow: 'grid', columnGap: 4 }))

    const gap = screen.getByRole('textbox', { name: 'Gap' })
    await userEvent.clear(gap)
    await userEvent.type(gap, '16{Enter}')

    expect(changes).toEqual([{ kind: 'style', property: 'gap', value: '16px' }])
    expect(screen.queryByRole('group', { name: 'Alignment' })).toBeNull()
  })

  it('writes space-between for Auto gap and leaves the gap', async () => {
    const changes = renderSection({ ...ROW, columnGap: 8 })

    await userEvent.click(
      screen.getByRole('button', { name: /^Auto gap: spread items/ }),
    )

    expect(changes).toEqual([
      { kind: 'style', property: 'justify-content', value: 'space-between' },
    ])
  })

  it('drops its own space-between when Auto gap turns off', async () => {
    const changes = renderSection({
      ...ROW,
      justify: 'space-between',
      ownJustify: true,
    })

    await userEvent.click(
      screen.getByRole('button', { name: /^Gap between: space items/ }),
    )

    expect(changes).toEqual([
      { kind: 'style', property: 'justify-content', value: '' },
    ])
  })

  it('names the start over a rule’s space-between when Auto gap turns off', async () => {
    const changes = renderSection({ ...ROW, justify: 'space-between' })

    await userEvent.click(
      screen.getByRole('button', { name: /^Gap between: space items/ }),
    )

    expect(changes).toEqual([
      { kind: 'style', property: 'justify-content', value: 'flex-start' },
    ])
  })

  it('aligns a row by its columns along and its rows across', async () => {
    const changes = renderSection(ROW)

    await userEvent.click(
      screen.getByRole('button', { name: 'Align bottom center' }),
    )

    expect(changes).toEqual([
      {
        kind: 'styles',
        declarations: [
          { property: 'justify-content', value: 'center' },
          { property: 'align-items', value: 'flex-end' },
        ],
      },
    ])
  })

  it('aligns a column by its rows along and its columns across', async () => {
    const changes = renderSection(
      layoutOf({ flow: 'vertical', direction: 'column' }),
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Align bottom center' }),
    )

    expect(changes).toEqual([
      {
        kind: 'styles',
        declarations: [
          { property: 'justify-content', value: 'flex-end' },
          { property: 'align-items', value: 'center' },
        ],
      },
    ])
  })

  it('lights the cell the computed alignment names', () => {
    renderSection({ ...ROW, justify: 'center', alignItems: 'center' })

    expect(
      screen.getByRole('button', { name: 'Align center center' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByRole('button', { name: 'Align top left' }),
    ).toHaveAttribute('aria-pressed', 'false')
  })

  it('holds one tab stop on the lit cell, so Tab leaves the grid in one press', async () => {
    renderSection({ ...ROW, justify: 'center', alignItems: 'center' })

    screen.getByRole('button', { name: 'Align center center' }).focus()
    await userEvent.tab()

    expect(screen.getByRole('textbox', { name: 'Gap' })).toHaveFocus()
  })

  it('leaves the grid on Tab from a cell an arrow key reached', async () => {
    renderSection({ ...ROW, justify: 'flex-end', alignItems: 'flex-end' })

    screen.getByRole('button', { name: 'Align bottom right' }).focus()
    await userEvent.keyboard('{ArrowUp}{ArrowUp}{ArrowLeft}')
    await userEvent.tab()

    expect(screen.getByRole('textbox', { name: 'Gap' })).toHaveFocus()
  })

  it('moves focus across the cells with the arrow keys and writes nothing', async () => {
    const changes = renderSection({
      ...ROW,
      justify: 'center',
      alignItems: 'center',
    })

    screen.getByRole('button', { name: 'Align center center' }).focus()
    await userEvent.keyboard('{ArrowRight}{ArrowDown}')

    expect(
      screen.getByRole('button', { name: 'Align bottom right' }),
    ).toHaveFocus()
    expect(changes).toEqual([])
  })

  it('offers no gap on a block', () => {
    renderSection(layoutOf())

    expect(screen.queryByRole('textbox', { name: 'Gap' })).toBeNull()
  })
})

describe('LayoutSection padding', () => {
  it('writes both sides of the horizontal padding as longhands in one edit', async () => {
    const changes = renderSection(layoutOf())

    const field = screen.getByRole('textbox', { name: 'Horizontal padding' })
    await userEvent.clear(field)
    await userEvent.type(field, '24{Enter}')

    expect(changes).toEqual([
      {
        kind: 'styles',
        declarations: [
          { property: 'padding-left', value: '24px' },
          { property: 'padding-right', value: '24px' },
        ],
      },
    ])
  })

  it('reads Mixed for a pair whose sides differ and opens per side', () => {
    renderSection(
      layoutOf({ padding: { top: 4, right: 8, bottom: 4, left: 16 } }),
    )

    expect(
      screen.getByRole('button', { name: 'Padding per side' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('textbox', { name: 'Left padding' })).toHaveValue(
      '16',
    )
  })

  it('writes one side alone once opened per side', async () => {
    const changes = renderSection(layoutOf())

    await userEvent.click(
      screen.getByRole('button', { name: 'Padding per side' }),
    )
    const field = screen.getByRole('textbox', { name: 'Top padding' })
    await userEvent.clear(field)
    await userEvent.type(field, '6{Enter}')

    expect(changes).toEqual([
      {
        kind: 'styles',
        declarations: [{ property: 'padding-top', value: '6px' }],
      },
    ])
  })
})

describe('LayoutSection size', () => {
  const CHILD_OF_ROW = layoutOf({ parent: 'horizontal' })

  it('writes Fill along a row parent as flex 1 1 0', async () => {
    const changes = renderSection(
      CHILD_OF_ROW,
      flowOf({ width: 'hug', height: 'fill' }),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Width mode' }))
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Fill' }),
    )

    expect(changes).toEqual([
      { kind: 'styles', declarations: [{ property: 'flex', value: '1 1 0' }] },
    ])
  })

  it('writes Fill across a row parent as a stretch, dropping a fixed height', async () => {
    const changes = renderSection(
      { ...CHILD_OF_ROW, parentAlignItems: 'center' },
      flowOf({ width: 'hug', height: 'fixed' }),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Height mode' }))
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Fill' }),
    )

    expect(changes).toEqual([
      {
        kind: 'styles',
        declarations: [
          { property: 'height', value: 'auto' },
          { property: 'align-self', value: 'stretch' },
        ],
      },
    ])
  })

  it('writes Hug along a row parent by putting back the flex a Fill set', async () => {
    const changes = renderSection(
      CHILD_OF_ROW,
      flowOf({ width: 'fill', height: 'fill' }),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Width mode' }))
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Hug' }),
    )

    expect(changes).toEqual([
      {
        kind: 'styles',
        declarations: [{ property: 'flex', value: '0 1 auto' }],
      },
    ])
  })

  it('writes a typed width as Fixed, leaving the Fill along a row', async () => {
    const changes = renderSection(
      CHILD_OF_ROW,
      flowOf({ width: 'fill', height: 'fill' }),
    )

    const width = screen.getByRole('textbox', { name: 'Width' })
    await userEvent.clear(width)
    await userEvent.type(width, '120{Enter}')

    expect(changes).toEqual([
      {
        kind: 'styles',
        declarations: [
          { property: 'width', value: '120px' },
          { property: 'flex', value: '0 1 auto' },
        ],
      },
    ])
  })

  it('offers no Fill under a block parent', async () => {
    renderSection(layoutOf(), flowOf({ width: null, height: 'hug' }))

    await userEvent.click(screen.getByRole('button', { name: 'Width mode' }))

    const modes = await screen.findAllByRole('menuitemradio')
    expect(modes.map((mode) => mode.textContent)).toEqual(['Fixed', 'Hug'])
  })

  it('writes Hug under a block parent as fit-content', async () => {
    const changes = renderSection(
      layoutOf(),
      flowOf({ width: null, height: 'hug' }),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Width mode' }))
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Hug' }),
    )

    expect(changes).toEqual([
      {
        kind: 'styles',
        declarations: [{ property: 'width', value: 'fit-content' }],
      },
    ])
  })

  it('writes Hug across a stretching column from Fixed by stopping the stretch', async () => {
    const changes = renderSection(
      layoutOf({ parent: 'vertical' }),
      flowOf({ width: 'fixed', height: 'hug' }),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Width mode' }))
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Hug' }),
    )

    expect(changes).toEqual([
      {
        kind: 'styles',
        declarations: [
          { property: 'width', value: 'auto' },
          { property: 'align-self', value: 'flex-start' },
        ],
      },
    ])
  })

  it('writes Fill across a row from a fit-content Hug by dropping the size', async () => {
    const changes = renderSection(
      { ...CHILD_OF_ROW, parentAlignItems: 'center' },
      flowOf({ width: 'hug', height: 'hug' }),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Height mode' }))
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Fill' }),
    )

    expect(changes).toEqual([
      {
        kind: 'styles',
        declarations: [
          { property: 'height', value: 'auto' },
          { property: 'align-self', value: 'stretch' },
        ],
      },
    ])
  })

  it('writes Hug along a flex parent the static read missed', async () => {
    const changes = renderSection(
      CHILD_OF_ROW,
      flowOf({ width: null, height: 'hug' }),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Width mode' }))
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Hug' }),
    )

    expect(changes).toEqual([
      {
        kind: 'styles',
        declarations: [
          { property: 'width', value: 'auto' },
          { property: 'flex', value: '0 1 auto' },
        ],
      },
    ])
  })
})
