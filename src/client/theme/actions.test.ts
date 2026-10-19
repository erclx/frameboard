import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useActionGroup, useActions } from '@/client/actions/registry'

import { registerThemeActions } from './actions'
import {
  chooseTheme,
  createThemeStore,
  shownTheme,
  type ThemeStore,
} from './store'

describe('registerThemeActions', () => {
  let store: ThemeStore
  let unregister: () => void

  beforeEach(() => {
    store = createThemeStore()
    unregister = registerThemeActions(store)
  })

  afterEach(() => {
    unregister()
  })

  it('switches to the opposite of the theme shown on theme.toggle', () => {
    store.setState({ system: 'dark' })
    const { result } = renderHook(() => useActions(['theme.toggle']))

    act(() => result.current[0]?.run())

    expect(shownTheme(store.getState())).toBe('light')
  })

  it('registers theme.toggle with no checked state, so it never draws pressed', () => {
    const { result } = renderHook(() => useActions(['theme.toggle']))

    expect(result.current[0]?.checked).toBeUndefined()
  })

  it('lists System, Light, and Dark in the theme group', () => {
    const { result } = renderHook(() => useActionGroup('theme'))

    expect(result.current.map((action) => action.label)).toEqual([
      'System',
      'Light',
      'Dark',
    ])
  })

  it('checks the row of the current choice', () => {
    const { result } = renderHook(() => useActionGroup('theme'))

    act(() => chooseTheme('dark', store))

    expect(
      result.current
        .filter((action) => action.checked?.())
        .map((action) => action.id),
    ).toEqual(['theme.dark'])
  })

  it('checks System while nothing was chosen', () => {
    const { result } = renderHook(() => useActionGroup('theme'))

    expect(
      result.current
        .filter((action) => action.checked?.())
        .map((action) => action.id),
    ).toEqual(['theme.system'])
  })

  it('removes every theme action when unregistered', () => {
    unregister()
    unregister = () => {}

    const { result } = renderHook(() => useActionGroup('theme'))

    expect(result.current).toEqual([])
  })
})
