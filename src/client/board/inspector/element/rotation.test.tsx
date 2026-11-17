import '../../../styles.css'

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/client/components/ui/tooltip'

import { recorder, rotationOf, scrubBy } from './fixtures'
import { RotationRow } from './rotation'
import { type Rotation } from './styles'
import { type WriteElement } from './write'

describe('RotationRow', () => {
  function renderRow(
    rotation: Rotation,
    write: WriteElement,
    { disabled = false, preview = vi.fn() } = {},
  ) {
    render(
      <TooltipProvider>
        <RotationRow
          rotation={rotation}
          disabled={disabled}
          write={write}
          preview={preview}
        />
      </TooltipProvider>,
    )
    return preview
  }

  it('writes a typed angle as rotate in degrees', async () => {
    const { changes, write } = recorder()
    renderRow(rotationOf(), write)

    const field = screen.getByRole('textbox', { name: 'Rotation' })
    await userEvent.clear(field)
    await userEvent.type(field, '45{Enter}')

    expect(changes).toEqual([
      { kind: 'style', property: 'rotate', value: '45deg' },
    ])
  })

  it('writes 270 normalized to -90', async () => {
    const { changes, write } = recorder()
    renderRow(rotationOf(), write)

    const field = screen.getByRole('textbox', { name: 'Rotation' })
    await userEvent.clear(field)
    await userEvent.type(field, '270{Enter}')

    expect(changes).toEqual([
      { kind: 'style', property: 'rotate', value: '-90deg' },
    ])
  })

  it('drops the element’s own rotate at 0 rather than writing 0deg', async () => {
    const { changes, write } = recorder()
    renderRow(rotationOf({ degrees: 90, own: { rotate: 0 } }), write)

    const field = screen.getByRole('textbox', { name: 'Rotation' })
    await userEvent.clear(field)
    await userEvent.type(field, '0{Enter}')

    expect(changes).toEqual([{ kind: 'style', property: 'rotate', value: '' }])
  })

  it('writes nothing for a typed full turn and shows the stored angle', async () => {
    const { changes, write } = recorder()
    renderRow(rotationOf({ degrees: 90, own: { rotate: 0 } }), write)

    const field = screen.getByRole('textbox', { name: 'Rotation' })
    await userEvent.clear(field)
    await userEvent.type(field, '450{Enter}')

    expect(changes).toEqual([])
    await waitFor(() => expect(field).toHaveValue('90°'))
  })

  it('previews a scrub live and writes it once on release', () => {
    const { changes, write } = recorder()
    const preview = renderRow(rotationOf({ degrees: 10 }), write)

    scrubBy(screen.getByText('Rotation'), 1)

    expect(preview).toHaveBeenCalledWith('rotate', '12deg')
    expect(changes).toEqual([
      { kind: 'style', property: 'rotate', value: '12deg' },
    ])
  })

  it('puts the stored angle back on Esc and writes nothing', async () => {
    const { changes, write } = recorder()
    const preview = renderRow(rotationOf({ degrees: 10 }), write)

    await userEvent.click(screen.getByRole('textbox', { name: 'Rotation' }))
    await userEvent.keyboard('{ArrowUp>3}{Escape}{/ArrowUp}')

    expect(preview).toHaveBeenLastCalledWith('rotate', null)
    expect(changes).toEqual([])
  })

  it('rotates 135 by 90 to -135', async () => {
    const { changes, write } = recorder()
    renderRow(rotationOf({ degrees: 135, own: { rotate: 0 } }), write)

    await userEvent.click(screen.getByRole('button', { name: 'Rotate 90°' }))

    expect(changes).toEqual([
      { kind: 'style', property: 'rotate', value: '-135deg' },
    ])
  })

  it('drops the element’s own rotate on the fourth quarter turn', async () => {
    const { changes, write } = recorder()
    renderRow(rotationOf({ degrees: -90, own: { rotate: 0 } }), write)

    await userEvent.click(screen.getByRole('button', { name: 'Rotate 90°' }))

    expect(changes).toEqual([{ kind: 'style', property: 'rotate', value: '' }])
  })

  it('flips an unscaled element horizontally as scale -1 1', async () => {
    const { changes, write } = recorder()
    renderRow(rotationOf(), write)

    await userEvent.click(
      screen.getByRole('button', { name: 'Flip horizontal' }),
    )

    expect(changes).toEqual([
      { kind: 'style', property: 'scale', value: '-1 1' },
    ])
  })

  it('flips vertically over a rule’s uniform scale', async () => {
    const { changes, write } = recorder()
    renderRow(rotationOf({ scale: { x: 1.5, y: 1.5 } }), write)

    await userEvent.click(screen.getByRole('button', { name: 'Flip vertical' }))

    expect(changes).toEqual([
      { kind: 'style', property: 'scale', value: '1.5 -1.5' },
    ])
  })

  it('drops the element’s own scale on a flip back to 1 1', async () => {
    const { changes, write } = recorder()
    renderRow(
      rotationOf({ scale: { x: -1, y: 1 }, own: { scale: { x: 1, y: 1 } } }),
      write,
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Flip horizontal' }),
    )

    expect(changes).toEqual([{ kind: 'style', property: 'scale', value: '' }])
  })

  it('writes a flip back the rule under the element’s own scale does not give', async () => {
    const { changes, write } = recorder()
    renderRow(
      rotationOf({
        scale: { x: -1.5, y: 1.5 },
        own: { scale: { x: 1, y: 1 } },
      }),
      write,
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Flip horizontal' }),
    )

    expect(changes).toEqual([
      { kind: 'style', property: 'scale', value: '1.5 1.5' },
    ])
  })

  it('writes 0deg over a rule’s angle under the element’s own rotate', async () => {
    const { changes, write } = recorder()
    renderRow(rotationOf({ degrees: -90, own: { rotate: 90 } }), write)

    await userEvent.click(screen.getByRole('button', { name: 'Rotate 90°' }))

    expect(changes).toEqual([
      { kind: 'style', property: 'rotate', value: '0deg' },
    ])
  })

  it('drops the element’s own rotate on reaching the rule’s angle under it', async () => {
    const { changes, write } = recorder()
    renderRow(rotationOf({ degrees: 0, own: { rotate: 90 } }), write)

    await userEvent.click(screen.getByRole('button', { name: 'Rotate 90°' }))

    expect(changes).toEqual([{ kind: 'style', property: 'rotate', value: '' }])
  })

  it('drops the element’s own scale on flipping to the rule’s scale under it', async () => {
    const { changes, write } = recorder()
    renderRow(
      rotationOf({ scale: { x: 1, y: 1 }, own: { scale: { x: -1, y: 1 } } }),
      write,
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Flip horizontal' }),
    )

    expect(changes).toEqual([{ kind: 'style', property: 'scale', value: '' }])
  })

  it('locks the row on a translating transform, saying why', async () => {
    const { changes, write } = recorder()
    renderRow(rotationOf({ translated: true }), write)
    const rotate = screen.getByRole('button', { name: 'Rotate 90°' })

    await userEvent.click(rotate)

    expect(changes).toEqual([])
    expect(screen.getByRole('textbox', { name: 'Rotation' })).toBeDisabled()
    expect(rotate).toHaveAttribute('aria-disabled', 'true')
    expect(rotate).toHaveAccessibleDescription(
      'Its transform moves it, so a rotation would swing it away',
    )
  })

  it('shows a 3D rotate as unreadable and locks the row', () => {
    const { write } = recorder()
    renderRow(rotationOf({ degrees: null }), write)

    const field = screen.getByRole('textbox', { name: 'Rotation' })
    expect(field).toHaveAttribute('placeholder', '3D')
    expect(field).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Flip vertical' }),
    ).toHaveAttribute('aria-disabled', 'true')
  })

  it('disables every control while the tab may not write', () => {
    const { write } = recorder()
    renderRow(rotationOf(), write, { disabled: true })

    expect(screen.getByRole('textbox', { name: 'Rotation' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Rotate 90°' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Flip horizontal' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Flip vertical' })).toBeDisabled()
  })
})
