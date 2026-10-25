import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { setCharacterKeys } from './character-keys'
import { IS_MAC } from './keys'
import { type Action, bindKeys, registerActions } from './registry'

const cleanups: (() => void)[] = []

function register(...actions: Action[]): void {
  cleanups.push(registerActions(actions))
}

function bind(target: Window | Element, only?: readonly string[]): void {
  cleanups.push(bindKeys(target, only))
}

function action(
  id: string,
  extra: Partial<Action> = {},
): Action & { runs: number } {
  const made = {
    id,
    label: id,
    group: 'test',
    runs: 0,
    run: () => {
      made.runs += 1
    },
    ...extra,
  }
  return made
}

/** tinykeys reads a press only when it carries both a key and a code. */
function pressIn(target: typeof window, key: string, code: string): void {
  target.document.body.dispatchEvent(
    new target.KeyboardEvent('keydown', { key, code, bubbles: true }),
  )
}

/** A press on the body, returned so a test reads whether a handler claimed it. */
function pressBody(
  key: string,
  code: string,
  modifiers: KeyboardEventInit = {},
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    code,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  })
  document.body.dispatchEvent(event)
  return event
}

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
  document.body.replaceChildren()
})

describe('bindKeys', () => {
  it('runs the action carrying the pressed key', async () => {
    const fit = action('view.zoomToFit', { keys: ['Shift+Digit1'] })
    register(fit)
    bind(window)

    await userEvent.keyboard('{Shift>}1{/Shift}')

    expect(fit.runs).toBe(1)
  })

  it('stops running an action once it is removed', async () => {
    const move = action('tool.move', { keys: ['v'] })
    const remove = registerActions([move])
    bind(window)

    remove()
    await userEvent.keyboard('v')

    expect(move.runs).toBe(0)
  })

  it('runs the first enabled action of several sharing a key', async () => {
    const exitPlay = action('mode.exitPlay', {
      keys: ['Escape'],
      enabled: () => false,
    })
    const walkUp = action('select.parent', { keys: ['Escape'] })
    const clear = action('select.clear', { keys: ['Escape'] })
    register(exitPlay, walkUp, clear)
    bind(window)

    await userEvent.keyboard('{Escape}')

    expect([exitPlay.runs, walkUp.runs, clear.runs]).toEqual([0, 1, 0])
  })

  it('binds a key registered after the binding started', async () => {
    bind(window)
    const hand = action('tool.hand', { keys: ['h'] })
    register(hand)

    await userEvent.keyboard('h')

    expect(hand.runs).toBe(1)
  })

  it('leaves a key typed into a field to the field', async () => {
    const move = action('tool.move', { keys: ['v'] })
    register(move)
    bind(window)
    const field = document.createElement('input')
    document.body.append(field)

    await userEvent.type(field, 'v')

    expect([move.runs, field.value]).toEqual([0, 'v'])
  })

  it('leaves a key typed inside an editable region to the region', async () => {
    const move = action('tool.move', { keys: ['v'] })
    register(move)
    bind(window)
    const region = document.createElement('div')
    region.contentEditable = 'true'
    const child = document.createElement('p')
    child.textContent = 'text'
    region.append(child)
    document.body.append(region)

    await userEvent.click(child)
    await userEvent.keyboard('v')

    expect(move.runs).toBe(0)
  })

  it('leaves a key pressed inside an open dialog to the dialog', async () => {
    const move = action('tool.move', { keys: ['v'] })
    register(move)
    bind(window)
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.tabIndex = -1
    document.body.append(dialog)
    dialog.focus()

    await userEvent.keyboard('v')

    expect(move.runs).toBe(0)
  })

  it('leaves Esc pressed inside an open dialog to the dialog', async () => {
    const clear = action('selection.clear', { keys: ['Escape'] })
    register(clear)
    bind(window)
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.tabIndex = -1
    document.body.append(dialog)
    dialog.focus()

    await userEvent.keyboard('{Escape}')

    expect(clear.runs).toBe(0)
  })

  it('runs a key pressed inside a toast', async () => {
    const move = action('tool.move', { keys: ['v'] })
    register(move)
    bind(window)
    const toast = document.createElement('div')
    toast.setAttribute('role', 'dialog')
    toast.dataset.slot = 'toast'
    toast.tabIndex = -1
    document.body.append(toast)
    toast.focus()

    await userEvent.keyboard('v')

    expect(move.runs).toBe(1)
  })

  it('leaves Enter pressed on a button inside a toast to the button', async () => {
    const down = action('element.down', { keys: ['Enter'] })
    register(down)
    bind(window)
    const toast = document.createElement('div')
    toast.setAttribute('role', 'dialog')
    toast.dataset.slot = 'toast'
    const show = document.createElement('button')
    toast.append(show)
    document.body.append(toast)
    let clicks = 0
    show.addEventListener('click', () => (clicks += 1))
    show.focus()

    await userEvent.keyboard('{Enter}')

    expect([down.runs, clicks]).toEqual([0, 1])
  })

  it('runs a key pressed with no element focused', () => {
    const exitPlay = action('mode.exitPlay', { keys: ['Escape'] })
    register(exitPlay)
    bind(window)

    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
      }),
    )

    expect(exitPlay.runs).toBe(1)
  })

  describe('with the Single-key shortcuts switch', () => {
    afterEach(() => {
      setCharacterKeys(true)
    })

    it('runs a character key while the switch is on', () => {
      const next = action('changes.next', { keys: ['BracketRight'] })
      register(next)
      bind(window)

      const event = pressBody(']', 'BracketRight')

      expect([next.runs, event.defaultPrevented]).toEqual([1, true])
    })

    it('leaves a character key to the browser while the switch is off', () => {
      const next = action('changes.next', { keys: ['BracketRight'] })
      register(next)
      bind(window)
      setCharacterKeys(false)

      const event = pressBody(']', 'BracketRight')

      expect([next.runs, event.defaultPrevented]).toEqual([0, false])
    })

    it('leaves a shifted character key to the browser while off', () => {
      const fit = action('view.zoomToFit', { keys: ['Shift+Digit1'] })
      register(fit)
      bind(window)
      setCharacterKeys(false)

      const event = pressBody('!', 'Digit1', { shiftKey: true })

      expect([fit.runs, event.defaultPrevented]).toEqual([0, false])
    })

    it('runs a modifier key while the switch is off', () => {
      const open = action('palette.open', { keys: ['$mod+KeyK'] })
      register(open)
      bind(window)
      setCharacterKeys(false)

      const event = pressBody(
        'k',
        'KeyK',
        IS_MAC ? { metaKey: true } : { ctrlKey: true },
      )

      expect([open.runs, event.defaultPrevented]).toEqual([1, true])
    })
  })

  it("binds into a frame's window, limited to the keys named", async () => {
    const exitPlay = action('mode.exitPlay', { keys: ['Escape'] })
    const move = action('tool.move', { keys: ['v'] })
    register(exitPlay, move)
    const frame = document.createElement('iframe')
    document.body.append(frame)
    const inner = frame.contentWindow as typeof window | null
    if (!inner) throw new Error('The frame has no window')
    bind(inner, ['Escape'])

    pressIn(inner, 'Escape', 'Escape')
    pressIn(inner, 'v', 'KeyV')

    expect([exitPlay.runs, move.runs]).toEqual([1, 0])
  })
})
