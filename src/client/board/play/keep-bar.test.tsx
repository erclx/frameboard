import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { liveStore } from '@/client/live/store'
import { frameOf } from '@/test/board'

import { controlsStore } from './controls'
import { KeepBar } from './keep-bar'

const HERO = frameOf('hero')

afterEach(() => {
  controlsStore.setState({ ref: null, moved: 0 })
  liveStore.setState({ canWrite: false })
})

describe('KeepBar', () => {
  it('counts the moved values and offers Keep values to a writer', () => {
    liveStore.setState({ canWrite: true })
    controlsStore.setState({ ref: HERO.ref, moved: 3 })

    render(<KeepBar page={HERO.page} frames={[HERO]} />)

    const bar = screen.getByRole('group', { name: 'Moved controls' })
    expect(bar).toHaveTextContent('3 values changed')
    expect(screen.getByRole('button', { name: 'Keep values' })).toBeVisible()
  })

  it('offers a view-only tab Reset alone', () => {
    liveStore.setState({ canWrite: false })
    controlsStore.setState({ ref: HERO.ref, moved: 1 })

    render(<KeepBar page={HERO.page} frames={[HERO]} />)

    expect(screen.getByRole('button', { name: 'Reset' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Keep values' })).toBeNull()
  })

  it('draws nothing until a control moves', () => {
    liveStore.setState({ canWrite: true })
    controlsStore.setState({ ref: HERO.ref, moved: 0 })

    render(<KeepBar page={HERO.page} frames={[HERO]} />)

    expect(screen.queryByRole('group', { name: 'Moved controls' })).toBeNull()
  })
})
