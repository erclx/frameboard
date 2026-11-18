import '../../../styles.css'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/client/components/ui/tooltip'
import type { Rotation } from '@/shared/frame-bridge/live-element'

import { recorder, rotationOf } from './fixtures'
import { TiltSection } from './tilt'
import { type WriteElement } from './write'

function transformOf(
  own: string,
  { ruled = false, reanchors = false } = {},
): Rotation['transform'] {
  return { own, ruled, reanchors }
}

function renderSection(
  rotation: Rotation,
  write: WriteElement,
  { disabled = false, preview = vi.fn() } = {},
) {
  render(
    <TooltipProvider>
      <TiltSection
        rotation={rotation}
        disabled={disabled}
        write={write}
        preview={preview}
      />
    </TooltipProvider>,
  )
  return preview
}

async function typeInto(name: string, value: string) {
  const field = screen.getByRole('textbox', { name })
  await userEvent.clear(field)
  await userEvent.type(field, `${value}{Enter}`)
}

describe('TiltSection', () => {
  it('writes a first tilt into the element’s own transform with the default perspective', async () => {
    const { changes, write } = recorder()
    renderSection(rotationOf(), write)

    await typeInto('Rotate X', '20')

    expect(changes).toEqual([
      {
        kind: 'style',
        property: 'transform',
        value: 'perspective(800px) rotateX(20deg)',
      },
    ])
  })

  it.each([
    ['Rotate Y', '-30', 'perspective(600px) rotateX(10deg) rotateY(-30deg)'],
    ['Rotate Z', '45', 'perspective(600px) rotateX(10deg) rotateZ(45deg)'],
    ['Depth', '12', 'perspective(600px) translateZ(12px) rotateX(10deg)'],
    ['Perspective', '400', 'perspective(400px) rotateX(10deg)'],
  ])(
    'writes %s into the transform in the fixed order',
    async (name, value, transform) => {
      const { changes, write } = recorder()
      renderSection(
        rotationOf({
          transform: transformOf('perspective(600px) rotateX(10deg)'),
        }),
        write,
      )

      await typeInto(name, value)

      expect(changes).toEqual([
        { kind: 'style', property: 'transform', value: transform },
      ])
    },
  )

  it('drops the declaration once every rotation and the depth are zero', async () => {
    const { changes, write } = recorder()
    renderSection(
      rotationOf({
        transform: transformOf('perspective(800px) rotateX(20deg)'),
      }),
      write,
    )

    await typeInto('Rotate X', '0')

    expect(changes).toEqual([
      { kind: 'style', property: 'transform', value: '' },
    ])
  })

  it('moves an own rotate into Rotate Z on a first tilt, dropping rotate in the same write', async () => {
    const { changes, write } = recorder()
    renderSection(rotationOf({ degrees: 30, own: { rotate: 0 } }), write)

    expect(screen.getByRole('textbox', { name: 'Rotate Z' })).toHaveValue('30°')
    await typeInto('Rotate Y', '15')

    expect(changes).toEqual([
      {
        kind: 'styles',
        declarations: [
          {
            property: 'transform',
            value: 'perspective(800px) rotateY(15deg) rotateZ(30deg)',
          },
          { property: 'rotate', value: '' },
        ],
      },
    ])
  })

  it('reverses an own rotate it carries past a one-axis flip, so the turn holds', async () => {
    const { changes, write } = recorder()
    renderSection(
      rotationOf({
        degrees: 30,
        scale: { x: -1, y: 1 },
        own: { rotate: 0, scale: { x: 1, y: 1 } },
      }),
      write,
    )

    await typeInto('Rotate Y', '15')

    expect(changes).toEqual([
      {
        kind: 'styles',
        declarations: [
          {
            property: 'transform',
            value: 'perspective(800px) rotateY(15deg) rotateZ(-30deg)',
          },
          { property: 'rotate', value: '' },
        ],
      },
    ])
  })

  it('carries an own rotate as it is past a flip on both axes', async () => {
    const { changes, write } = recorder()
    renderSection(
      rotationOf({
        degrees: 30,
        scale: { x: -1, y: -1 },
        own: { rotate: 0, scale: { x: 1, y: 1 } },
      }),
      write,
    )

    await typeInto('Rotate Y', '15')

    expect(changes).toEqual([
      {
        kind: 'styles',
        declarations: [
          {
            property: 'transform',
            value: 'perspective(800px) rotateY(15deg) rotateZ(30deg)',
          },
          { property: 'rotate', value: '' },
        ],
      },
    ])
  })

  it('refuses a perspective of zero, writing the least one', async () => {
    const { changes, write } = recorder()
    renderSection(
      rotationOf({
        transform: transformOf('perspective(800px) rotateX(20deg)'),
      }),
      write,
    )

    await typeInto('Perspective', '0')

    expect(changes).toEqual([
      {
        kind: 'style',
        property: 'transform',
        value: 'perspective(1px) rotateX(20deg)',
      },
    ])
  })

  it('previews a scrub on the transform, never the parent', async () => {
    const { write } = recorder()
    const preview = renderSection(rotationOf(), write)
    const field = screen.getByRole('textbox', { name: 'Rotate X' })

    field.focus()
    await userEvent.keyboard('{ArrowUp}')

    expect(preview).toHaveBeenCalledWith(
      'transform',
      'perspective(800px) rotateX(1deg)',
    )
  })

  it('holds Perspective off until a rotation or depth is set', () => {
    const { write } = recorder()
    renderSection(rotationOf(), write)

    const field = screen.getByRole('textbox', { name: 'Perspective' })
    expect(field).toBeDisabled()
    expect(field).toHaveValue('800')
  })

  it.each([
    [
      'a transform in another order',
      rotationOf({
        transform: transformOf('rotateY(10deg) perspective(800px)'),
      }),
      'Its transform is not one this section writes, so edit it in the file.',
    ],
    [
      'a transform the section does not write',
      rotationOf({ transform: transformOf('translate(10px, 0)') }),
      'Its transform is not one this section writes, so edit it in the file.',
    ],
    [
      'a transform a rule sets',
      rotationOf({ transform: transformOf('', { ruled: true }) }),
      'A rule sets its transform, which a tilt here would replace.',
    ],
    [
      'an element anchoring a descendant above it',
      rotationOf({ transform: transformOf('', { reanchors: true }) }),
      'A tilt would move an element anchored above it.',
    ],
    [
      'an element a rule rotates',
      rotationOf({ degrees: 30 }),
      'A rule rotates it, so a tilt would turn it twice.',
    ],
    [
      'a rotated element its scale stretches',
      rotationOf({ degrees: 30, own: { rotate: 0 }, scale: { x: 2, y: 1 } }),
      'Its scale stretches its turn, so a tilt could not hold the picture.',
    ],
  ])('turns the section off for %s, saying why', (_name, rotation, reason) => {
    const { write } = recorder()
    renderSection(rotation, write)

    expect(screen.getByText(reason)).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Rotate X' })).toBeDisabled()
  })

  it('disables every field while the tab may not write', () => {
    const { write } = recorder()
    renderSection(rotationOf(), write, { disabled: true })

    expect(screen.getByRole('textbox', { name: 'Rotate Y' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Depth' })).toBeDisabled()
  })
})
