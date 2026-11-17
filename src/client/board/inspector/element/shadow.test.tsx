import '../../../styles.css'

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { recorder, SHADOW, tokenValueOf } from './fixtures'
import { ShadowSection } from './shadow'

describe('ShadowSection', () => {
  it('shows a raw shadow by its value with no mark', () => {
    render(
      <ShadowSection
        boxShadow={{ value: '0 2px 4px #0003', token: null, percent: 100 }}
        shadows={[SHADOW]}
        theme="light"
        disabled={false}
        write={recorder().write}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Shadow' })
    expect(trigger).toHaveTextContent('0 2px 4px #0003')
    expect(within(trigger).queryByRole('img')).toBeNull()
  })

  it('writes a shadow token', async () => {
    const { changes, write } = recorder()
    render(
      <ShadowSection
        boxShadow={null}
        shadows={[SHADOW]}
        theme="light"
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Shadow' }))
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'shadow-sm' }),
    )

    expect(changes).toEqual([
      { kind: 'style', property: 'box-shadow', value: 'var(--shadow-sm)' },
    ])
  })

  it('writes none for None, which also covers a shadow a rule sets', async () => {
    const { changes, write } = recorder()
    render(
      <ShadowSection
        boxShadow={tokenValueOf('--shadow-sm')}
        shadows={[SHADOW]}
        theme="light"
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Shadow' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'None' }))

    expect(changes).toEqual([
      { kind: 'style', property: 'box-shadow', value: 'none' },
    ])
  })

  it('writes nothing for None while no shadow is set', async () => {
    const { changes, write } = recorder()
    render(
      <ShadowSection
        boxShadow={null}
        shadows={[SHADOW]}
        theme="light"
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Shadow' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'None' }))

    expect(changes).toEqual([])
  })
})
