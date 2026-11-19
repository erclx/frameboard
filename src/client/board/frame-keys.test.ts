import { afterEach, describe, expect, it } from 'vitest'

import { setCharacterKeys } from '@/client/actions/character-keys'
import { registerActions } from '@/client/actions/registry'
import { ask, bridgedFrame } from '@/test/frame-bridge'

import { shownHashOf } from './bridge/shown'
import { bindFrameKeys } from './frame-keys'

const cleanups: (() => void)[] = []

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
  setCharacterKeys(true)
  for (const iframe of document.querySelectorAll('iframe')) iframe.remove()
})

/** A bridged frame with `keys` bound for the board, resolved once the frame took the binding. */
async function bound(keys: string[]): Promise<HTMLIFrameElement> {
  const iframe = await bridgedFrame('<p>Hi</p>')
  await expect.poll(() => shownHashOf(iframe)).not.toBeNull()
  cleanups.push(bindFrameKeys(iframe, keys, { keepTyping: false }))
  await settled(iframe)
  return iframe
}

/** A round trip, so every request the board sent the frame before it has landed. */
async function settled(iframe: HTMLIFrameElement): Promise<void> {
  ;(await ask(iframe, 'live-body', {})).close()
}

/** Presses a key in the frame, answering whether anything prevented it there. */
function press(iframe: HTMLIFrameElement, key: string, code: string): boolean {
  const view = iframe.contentWindow as typeof window | null
  if (!view) throw new Error('The iframe holds no window')
  const event = new view.KeyboardEvent('keydown', {
    key,
    code,
    bubbles: true,
    cancelable: true,
  })
  view.document.body.dispatchEvent(event)
  return event.defaultPrevented
}

describe('bindFrameKeys', () => {
  it('runs the action a key pressed in the frame names', async () => {
    let exits = 0
    cleanups.push(
      registerActions([
        {
          id: 'mode.exitPlay',
          label: 'Exit Play',
          group: 'mode',
          palette: false,
          keys: ['Escape'],
          run: () => (exits += 1),
        },
      ]),
    )
    const iframe = await bound(['Escape'])

    press(iframe, 'Escape', 'Escape')

    await expect.poll(() => exits).toBe(1)
  })

  it('leaves a character key to the page while single-key shortcuts are off', async () => {
    setCharacterKeys(false)
    const iframe = await bound(['BracketRight'])

    expect(press(iframe, ']', 'BracketRight')).toBe(false)
  })

  it('takes a character key again once single-key shortcuts come back on', async () => {
    setCharacterKeys(false)
    const iframe = await bound(['BracketRight'])

    setCharacterKeys(true)
    await settled(iframe)

    expect(press(iframe, ']', 'BracketRight')).toBe(true)
  })
})
