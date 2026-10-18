import { describe, expect, it } from 'vitest'

import { keyLabel } from './keys'

describe('keyLabel', () => {
  it('prints a letter key in capitals', () => {
    expect(keyLabel('v', true)).toBe('V')
  })

  it('prints $mod as Cmd on a Mac', () => {
    expect(keyLabel('$mod+Backslash', true)).toBe('⌘\\')
  })

  it('prints $mod as Ctrl elsewhere', () => {
    expect(keyLabel('$mod+Equal', false)).toBe('Ctrl+=')
  })

  it('orders Mac modifiers Shift before Cmd', () => {
    expect(keyLabel('$mod+Shift+h', true)).toBe('⇧⌘H')
  })

  it('prints a shifted digit code as the digit', () => {
    expect(keyLabel('Shift+Digit1', true)).toBe('⇧1')
  })

  it('shortens Escape', () => {
    expect(keyLabel('Escape', false)).toBe('Esc')
  })
})
