import '../../styles.css'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { type NumberChange, NumberField } from './number-field'

/**
 * A field's writes and previews, each change read as the value it gives a
 * frame or element starting at `from`, and a preview put back as null.
 */
function recorder({ from = 0, answer = true } = {}) {
  const writes: number[] = []
  const previews: (number | null)[] = []
  return {
    writes,
    previews,
    onCommit: async (change: NumberChange) => {
      writes.push(change(from))
      return answer
    },
    onPreview: (change: NumberChange | null) => {
      previews.push(change ? change(from) : null)
    },
  }
}

function field(): HTMLInputElement {
  return screen.getByRole('textbox', { name: 'X position' })
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

/** Lets a refusal's answer reach the field. */
async function settle() {
  await act(async () => {})
}

describe('NumberField', () => {
  it('writes each separate press once', async () => {
    const calls = recorder({ from: 40 })
    render(
      <NumberField
        label="X position"
        prefix="X"
        value={40}
        disabled={false}
        {...calls}
      />,
    )

    await userEvent.click(field())
    await userEvent.keyboard('{ArrowUp}{ArrowUp}')

    expect(calls.writes).toEqual([41, 42])
    expect(field()).toHaveValue('42')
  })

  it('writes a held key once, on its keyup, after previewing each repeat', async () => {
    const calls = recorder({ from: 40 })
    render(
      <NumberField
        label="X position"
        prefix="X"
        value={40}
        disabled={false}
        {...calls}
      />,
    )

    await userEvent.click(field())
    await userEvent.keyboard('{ArrowDown>4/}')

    expect(calls.previews).toEqual([39, 38, 37, 36])
    expect(calls.writes).toEqual([36])
  })

  it('steps by ten with Shift, held to its bounds', async () => {
    const calls = recorder({ from: 95 })
    render(
      <NumberField
        label="X position"
        prefix="X"
        value={95}
        max={100}
        disabled={false}
        {...calls}
      />,
    )

    await userEvent.click(field())
    await userEvent.keyboard('{Shift>}{ArrowUp}{/Shift}')

    expect(calls.writes).toEqual([100])
  })

  it('steps by its own step, so a weight moves by a hundred', async () => {
    const calls = recorder({ from: 400 })
    render(
      <NumberField
        label="X position"
        prefix="X"
        value={400}
        step={100}
        disabled={false}
        {...calls}
      />,
    )

    await userEvent.click(field())
    await userEvent.keyboard('{ArrowUp}')

    expect(calls.writes).toEqual([500])
  })

  it('writes a step whose preview moved the stored value under it', async () => {
    const writes: number[] = []
    // A frame's preview is its pending box, which the field reads back as the stored value.
    function Previewed() {
      const [value, setValue] = useState(40)
      return (
        <NumberField
          label="X position"
          prefix="X"
          value={value}
          disabled={false}
          onPreview={(change) => setValue(change ? change(40) : 40)}
          onCommit={async (change) => {
            writes.push(change(40))
            return true
          }}
        />
      )
    }
    render(<Previewed />)

    await userEvent.click(field())
    await userEvent.keyboard('{ArrowUp}')

    expect(writes).toEqual([41])
  })

  it('puts the stored value back on Esc and writes nothing', async () => {
    const calls = recorder({ from: 40 })
    render(
      <NumberField
        label="X position"
        prefix="X"
        value={40}
        disabled={false}
        {...calls}
      />,
    )

    await userEvent.click(field())
    await userEvent.keyboard('{ArrowUp>3}')
    await userEvent.keyboard('{Escape}')
    await userEvent.keyboard('{/ArrowUp}')

    expect(calls.previews).toEqual([41, 42, 43, null])
    expect(calls.writes).toEqual([])
    expect(field()).toHaveValue('40')
    expect(field()).not.toHaveFocus()
  })

  it('writes a typed value once on Enter, and nothing more on blur', async () => {
    const calls = recorder()
    render(
      <NumberField
        label="X position"
        prefix="X"
        value={40}
        disabled={false}
        {...calls}
      />,
    )

    await userEvent.click(field())
    await userEvent.keyboard('120{Enter}')
    await userEvent.tab()

    expect(calls.writes).toEqual([120])
  })

  it('writes a typed value on blur', async () => {
    const calls = recorder()
    render(
      <NumberField
        label="X position"
        prefix="X"
        value={40}
        disabled={false}
        {...calls}
      />,
    )

    await userEvent.click(field())
    await userEvent.keyboard('120')
    await userEvent.tab()

    expect(calls.writes).toEqual([120])
  })

  it('writes nothing for a value left as stored or emptied', async () => {
    const calls = recorder()
    render(
      <NumberField
        label="X position"
        prefix="X"
        value={40}
        disabled={false}
        {...calls}
      />,
    )

    await userEvent.click(field())
    await userEvent.keyboard('40{Enter}')
    await userEvent.clear(field())
    await userEvent.tab()

    expect(calls.writes).toEqual([])
    expect(field()).toHaveValue('40')
  })

  it('puts the preview back and shows the stored value when the write is refused', async () => {
    const calls = recorder({ from: 40, answer: false })
    render(
      <NumberField
        label="X position"
        prefix="X"
        value={40}
        disabled={false}
        {...calls}
      />,
    )

    await userEvent.click(field())
    await userEvent.keyboard('{ArrowUp}')
    await settle()

    expect(calls.previews).toEqual([41, null])
    expect(field()).toHaveValue('40')
  })

  it('shows the stored value again when a typed value is refused, keeping focus', async () => {
    const calls = recorder({ answer: false })
    render(
      <NumberField
        label="X position"
        prefix="X"
        value={40}
        format={{ style: 'unit', unit: 'percent' }}
        disabled={false}
        {...calls}
      />,
    )

    await userEvent.click(field())
    await userEvent.keyboard('50{Enter}')
    await settle()

    expect(calls.writes).toEqual([50])
    expect(field()).toHaveValue('40%')
    expect(field()).toHaveFocus()
  })

  it('moves each Mixed value by the step from its own', async () => {
    const writes: number[][] = []
    render(
      <NumberField
        label="X position"
        prefix="X"
        value={null}
        min={1}
        disabled={false}
        onCommit={async (change) => {
          writes.push([10, 200, 1].map(change))
          return true
        }}
      />,
    )

    expect(field()).toHaveAttribute('placeholder', 'Mixed')
    await userEvent.click(field())
    await userEvent.keyboard('{ArrowUp>2/}{ArrowDown}')

    expect(writes).toEqual([
      [12, 202, 3],
      [9, 199, 1],
    ])
  })

  it('sets every Mixed value to a typed one', async () => {
    const writes: number[][] = []
    render(
      <NumberField
        label="X position"
        prefix="X"
        value={null}
        disabled={false}
        onCommit={async (change) => {
          writes.push([10, 200].map(change))
          return true
        }}
      />,
    )

    await userEvent.click(field())
    await userEvent.keyboard('64{Enter}')

    expect(writes).toEqual([[64, 64]])
  })

  it('takes no browser undo reaching it unfocused', async () => {
    const calls = recorder()
    render(
      <NumberField
        label="X position"
        prefix="X"
        value={40}
        disabled={false}
        {...calls}
      />,
    )
    const input = field()
    const proto = Object.getPrototypeOf(input)
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, '7')
    act(() => {
      input.dispatchEvent(
        new InputEvent('input', { bubbles: true, inputType: 'historyUndo' }),
      )
    })

    await userEvent.click(input)
    await userEvent.tab()

    expect(calls.writes).toEqual([])
    expect(input).toHaveValue('40')
  })

  it('scrubs from the prefix, previewing each move and writing once on release', async () => {
    const calls = recorder({ from: 40 })
    render(
      <NumberField
        label="X position"
        prefix="X"
        value={40}
        disabled={false}
        {...calls}
      />,
    )
    const scrub = screen.getByText('X')

    scrubBy(scrub, 3)

    expect(calls.previews.length).toBeGreaterThan(0)
    expect(calls.writes).toHaveLength(1)
    expect(calls.writes[0]).toBeGreaterThan(40)
  })

  it('scrubs from a zone spanning the field height and at least 24px', () => {
    render(
      <NumberField
        label="X position"
        prefix="X"
        value={40}
        disabled={false}
        {...recorder()}
      />,
    )

    const zone = screen.getByText('X').getBoundingClientRect()
    const input = field().getBoundingClientRect()

    expect(zone.height).toBe(input.height)
    expect(zone.top).toBe(input.top)
    expect(zone.left).toBe(input.left)
    expect(zone.width).toBeGreaterThanOrEqual(24)
  })

  it('scrubs from its caption, writing once on release', () => {
    const calls = recorder({ from: 40 })
    render(
      <NumberField
        label="X position"
        caption="Position"
        prefix="X"
        value={40}
        disabled={false}
        {...calls}
      />,
    )

    scrubBy(screen.getByText('Position'), 3)

    expect(calls.writes).toHaveLength(1)
    expect(calls.writes[0]).toBeGreaterThan(40)
  })

  it('sets its caption at the caption step', () => {
    const calls = recorder({ from: 40 })
    render(
      <NumberField
        label="X position"
        caption="Position"
        prefix="X"
        value={40}
        disabled={false}
        {...calls}
      />,
    )

    const caption = getComputedStyle(screen.getByText('Position'))
    expect(caption.fontSize).toBe('10px')
    expect(caption.fontWeight).toBe('400')
  })

  it('focuses the field and writes nothing on a caption click', async () => {
    const calls = recorder({ from: 40 })
    render(
      <NumberField
        label="X position"
        caption="Position"
        prefix="X"
        value={40}
        disabled={false}
        {...calls}
      />,
    )

    await userEvent.click(screen.getByText('Position'))

    expect(field()).toHaveFocus()
    expect(calls.writes).toEqual([])
  })

  it('scrubs from the number itself when it scrubs its value', () => {
    const calls = recorder({ from: 40 })
    render(
      <NumberField
        label="X position"
        value={40}
        scrubValue
        disabled={false}
        {...calls}
      />,
    )

    scrubBy(field(), 3)

    expect(calls.writes).toHaveLength(1)
    expect(calls.writes[0]).toBeGreaterThan(40)
  })

  it('types after a click on a number that scrubs its value', async () => {
    const calls = recorder({ from: 40 })
    render(
      <NumberField
        label="X position"
        value={40}
        scrubValue
        disabled={false}
        {...calls}
      />,
    )

    await userEvent.click(field())

    expect(field()).toHaveFocus()
    expect(calls.writes).toEqual([])

    await userEvent.keyboard('55{Enter}')

    expect(calls.writes).toEqual([55])
  })

  it('scrubs a Mixed value from its zone as an offset from zero', () => {
    const writes: number[][] = []
    render(
      <NumberField
        label="X position"
        prefix="X"
        value={null}
        disabled={false}
        onCommit={async (change) => {
          writes.push([10, 200].map(change))
          return true
        }}
      />,
    )

    scrubBy(screen.getByText('X'), 1)

    expect(writes).toEqual([[12, 202]])
  })

  it('puts the stored value back on Esc during a scrub and writes nothing on release', async () => {
    const calls = recorder({ from: 40 })
    render(
      <NumberField
        label="X position"
        prefix="X"
        value={40}
        disabled={false}
        {...calls}
      />,
    )
    const scrub = screen.getByText('X')

    act(() => {
      scrub.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          pointerType: 'mouse',
        }),
      )
    })
    act(() => {
      window.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, movementX: 2 }),
      )
    })
    await userEvent.keyboard('{Escape}')
    act(() => {
      window.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, movementX: 2 }),
      )
    })
    act(() => {
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    })

    expect(calls.previews.at(-1)).toBeNull()
    expect(calls.writes).toEqual([])
    expect(field()).toHaveValue('40')
  })

  it('scrubs nothing and writes nothing while disabled', async () => {
    const calls = recorder()
    render(
      <NumberField
        label="X position"
        prefix="X"
        value={40}
        disabled
        {...calls}
      />,
    )

    scrubBy(screen.getByText('X'), 3)

    expect(field()).toBeDisabled()
    expect(calls.previews).toEqual([])
    expect(calls.writes).toEqual([])
  })
})
