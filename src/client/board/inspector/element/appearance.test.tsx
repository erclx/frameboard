import '../../../styles.css'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { AppearanceSection } from './appearance'
import { browserHistory, recorder, rotationOf, scrubBy } from './fixtures'

describe('AppearanceSection', () => {
  it('scrubs the opacity from its caption, writing once on release', () => {
    const { changes, write } = recorder()
    render(
      <AppearanceSection
        opacity={0.5}
        radius={0}
        rotation={rotationOf()}
        disabled={false}
        write={write}
      />,
    )

    scrubBy(screen.getByText('Opacity'), 3)

    expect(changes).toEqual([
      { kind: 'style', property: 'opacity', value: '0.56' },
    ])
  })

  it('scrubs the radius from its caption', () => {
    const { changes, write } = recorder()
    render(
      <AppearanceSection
        opacity={1}
        radius={4}
        rotation={rotationOf()}
        disabled={false}
        write={write}
      />,
    )

    scrubBy(screen.getByText('Corner radius'), 1)

    expect(changes).toEqual([
      { kind: 'style', property: 'border-radius', value: '6px' },
    ])
  })

  it.each(['50', '50%'])('writes opacity 0.5 for %s', async (typed) => {
    const { changes, write } = recorder()
    render(
      <AppearanceSection
        opacity={1}
        radius={0}
        rotation={rotationOf()}
        disabled={false}
        write={write}
      />,
    )

    const field = screen.getByRole('textbox', { name: 'Opacity' })
    await userEvent.clear(field)
    await userEvent.type(field, `${typed}{Enter}`)

    expect(changes).toEqual([
      { kind: 'style', property: 'opacity', value: '0.5' },
    ])
  })

  it('writes the radius in px', async () => {
    const { changes, write } = recorder()
    render(
      <AppearanceSection
        opacity={1}
        radius={0}
        rotation={rotationOf()}
        disabled={false}
        write={write}
      />,
    )

    const field = screen.getByRole('textbox', { name: 'Corner radius' })
    await userEvent.clear(field)
    await userEvent.type(field, '8{Enter}')

    expect(changes).toEqual([
      { kind: 'style', property: 'border-radius', value: '8px' },
    ])
  })

  it('writes a held opacity step once, as a fraction', async () => {
    const { changes, write } = recorder()
    render(
      <AppearanceSection
        opacity={0.5}
        radius={0}
        rotation={rotationOf()}
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(screen.getByRole('textbox', { name: 'Opacity' }))
    await userEvent.keyboard('{ArrowUp>3/}')

    expect(changes).toEqual([
      { kind: 'style', property: 'opacity', value: '0.53' },
    ])
  })

  it('writes nothing for an opacity that is not a number', async () => {
    const { changes, write } = recorder()
    render(
      <AppearanceSection
        opacity={1}
        radius={0}
        rotation={rotationOf()}
        disabled={false}
        write={write}
      />,
    )

    const field = screen.getByRole('textbox', { name: 'Opacity' })
    await userEvent.clear(field)
    await userEvent.type(field, 'half{Enter}')

    expect(changes).toEqual([])
  })
})

describe('AppearanceSection on a model', () => {
  function renderModel(rotation = rotationOf()) {
    const { write } = recorder()
    render(
      <AppearanceSection
        opacity={1}
        radius={0}
        rotation={rotation}
        model
        disabled={false}
        write={write}
      />,
    )
  }

  it('leaves the turns to the Model section for a model with none', () => {
    renderModel()

    expect(
      screen.queryByRole('group', { name: 'Rotate and flip' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '3D' })).not.toBeInTheDocument()
  })

  it('keeps the turns for a model whose file holds a transform', () => {
    renderModel(
      rotationOf({
        transform: { own: 'rotate(10deg)', ruled: false, reanchors: false },
      }),
    )

    expect(screen.getByRole('group', { name: 'Rotate and flip' })).toBeVisible()
    expect(screen.getByRole('region', { name: '3D' })).toBeVisible()
  })

  it('keeps the turns for a model the file rotates', () => {
    renderModel(rotationOf({ degrees: 15 }))

    expect(screen.getByRole('group', { name: 'Rotate and flip' })).toBeVisible()
  })
})

describe('AppearanceSection commit field', () => {
  it('drops a historyUndo while the field is unfocused', () => {
    const { changes, write } = recorder()
    render(
      <AppearanceSection
        opacity={1}
        radius={0}
        rotation={rotationOf()}
        disabled={false}
        write={write}
      />,
    )
    const field = screen.getByRole('textbox', { name: 'Opacity' })

    browserHistory(field as HTMLInputElement, '50')
    act(() => (field as HTMLInputElement).focus())
    act(() => (field as HTMLInputElement).blur())

    expect(changes).toEqual([])
    expect(field).toHaveValue('100%')
  })
})
