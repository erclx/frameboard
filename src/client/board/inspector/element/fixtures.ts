import { act } from '@testing-library/react'

import type { Rotation } from '@/shared/frame-bridge/live-element'
import type { StyleValue } from '@/shared/records/elements'
import type { TokenRow } from '@/shared/records/tokens'

import { type ElementChange } from './write'

export function tokenOf(name: string, light: string, dark = light): TokenRow {
  return {
    name,
    group: 'color',
    light,
    dark,
    sheet: 'tokens.css',
    overrides: false,
  }
}

export const PRIMARY = tokenOf('--primary', '#4f46e5', '#818cf8')

export const BORDER = tokenOf('--border', '#e5e7eb', '#374151')

export const SHADOW: TokenRow = {
  name: '--shadow-sm',
  group: 'other',
  light: '0 1px 2px rgba(0,0,0,.1)',
  dark: '0 1px 2px rgba(0,0,0,.5)',
  sheet: 'tokens.css',
  overrides: false,
}

export function tokenValueOf(token: string, percent = 100): StyleValue {
  return { value: `var(${token})`, token, percent }
}

/** An element's rotation, upright and unflipped by default, with its own style setting neither. */
export function rotationOf(overrides: Partial<Rotation> = {}): Rotation {
  return {
    degrees: 0,
    scale: { x: 1, y: 1 },
    own: {},
    translated: false,
    ...overrides,
  }
}

/** A write that records each change and answers as the server would. */
export function recorder(answer = true) {
  const changes: ElementChange[] = []
  const write = async (change: ElementChange) => {
    changes.push(change)
    return answer
  }
  return { changes, write }
}

/** Types into a field the way a browser undo does: a value change tagged with its history input type. */
export function browserHistory(
  field: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  inputType: 'historyUndo' | 'historyRedo' = 'historyUndo',
) {
  const proto = Object.getPrototypeOf(field)
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(field, value)
  act(() => {
    field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType }))
  })
}

/**
 * Drags a scrub area right by `moves` steps of base-ui's default two
 * pixels, as a locked pointer reports them, and releases it.
 */
export function scrubBy(area: HTMLElement, moves: number) {
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
