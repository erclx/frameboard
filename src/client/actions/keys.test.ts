import { describe, expect, it } from 'vitest'

import { isCharacterKey, keyLabel, keyParts } from './keys'

describe('isCharacterKey', () => {
  it.each(['v', 'BracketRight', 'BracketLeft', 'Shift+?', 'Shift+Digit1'])(
    'reads %s as a character key',
    (binding) => {
      expect(isCharacterKey(binding)).toBe(true)
    },
  )

  it.each([
    'Escape',
    'ArrowLeft',
    'F2',
    '$mod+KeyK',
    'Alt+KeyA',
    'Control+KeyY',
  ])('reads %s as no character key', (binding) => {
    expect(isCharacterKey(binding)).toBe(false)
  })
})

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

describe('keyParts', () => {
  it('splits a Mac binding into a chip per modifier and key', () => {
    expect(keyParts('Shift+Digit1', true)).toEqual(['⇧', '1'])
  })

  it('splits a binding elsewhere into named modifiers', () => {
    expect(keyParts('$mod+Shift+KeyC', false)).toEqual(['Ctrl', 'Shift', 'C'])
  })

  it('prints a shifted symbol without its Shift', () => {
    expect(keyParts('Shift+?', true)).toEqual(['?'])
    expect(keyLabel('Shift+?', false)).toBe('?')
  })
})
