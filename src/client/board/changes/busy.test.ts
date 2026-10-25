import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type Busy, watchBusy } from './busy'

let watching: Busy | null = null

function watch(): Busy {
  watching = watchBusy(document)
  return watching
}

afterEach(() => {
  watching?.dispose()
  watching = null
  document.body.replaceChildren()
})

function popup(slot: string, open = true): HTMLElement {
  const element = document.createElement('div')
  element.dataset.slot = slot
  if (open) element.dataset.open = ''
  document.body.append(element)
  return element
}

describe('busy', () => {
  it('reads idle on a bare page', () => {
    expect(watch().busy()).toBe(false)
  })

  it('reads busy while a text field has focus and clears on blur', () => {
    const busy = watch()
    const field = document.createElement('input')
    document.body.append(field)

    field.focus()
    expect(busy.busy()).toBe(true)

    field.blur()
    expect(busy.busy()).toBe(false)
  })

  it('does not read a focused button as busy', () => {
    const busy = watch()
    const button = document.createElement('button')
    document.body.append(button)

    button.focus()

    expect(busy.busy()).toBe(false)
  })

  it('reads busy while a pointer is held and clears on release', () => {
    const busy = watch()

    document.dispatchEvent(new Event('pointerdown'))
    expect(busy.busy()).toBe(true)

    document.dispatchEvent(new Event('pointerup'))
    expect(busy.busy()).toBe(false)
  })

  it('clears a held pointer on a cancel and on a window blur', () => {
    const busy = watch()

    document.dispatchEvent(new Event('pointerdown'))
    document.dispatchEvent(new Event('pointercancel'))
    expect(busy.busy()).toBe(false)

    document.dispatchEvent(new Event('pointerdown'))
    window.dispatchEvent(new Event('blur'))
    expect(busy.busy()).toBe(false)
  })

  it.each([
    'dropdown-menu-content',
    'context-menu-content',
    'popover-content',
    'dialog-content',
  ])('reads busy while %s is open', (slot) => {
    const busy = watch()
    const open = popup(slot)

    expect(busy.busy()).toBe(true)

    open.remove()
    expect(busy.busy()).toBe(false)
  })

  it('ignores a popup that is not open and the toast viewport', () => {
    const busy = watch()
    popup('popover-content', false)
    popup('toast-viewport')

    expect(busy.busy()).toBe(false)
  })
})

describe('whenIdle', () => {
  /** Runs the read after an event, which waits a timer turn since focus has not moved inside `focusout`. */
  const settled = () => vi.advanceTimersByTimeAsync(0)

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('runs once the last signal clears, and only once', async () => {
    const busy = watch()
    const run = vi.fn()
    const field = document.createElement('input')
    document.body.append(field)
    field.focus()
    document.dispatchEvent(new Event('pointerdown'))

    busy.whenIdle(run)
    document.dispatchEvent(new Event('pointerup'))
    await settled()
    expect(run).not.toHaveBeenCalled()

    field.blur()
    await settled()
    expect(run).toHaveBeenCalledTimes(1)

    document.dispatchEvent(new Event('pointerup'))
    await settled()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('runs on the next turn when nothing is busy', async () => {
    const run = vi.fn()

    watch().whenIdle(run)
    await settled()

    expect(run).toHaveBeenCalledTimes(1)
  })

  it('runs when an open popup closes', async () => {
    const busy = watch()
    const run = vi.fn()
    const open = popup('dropdown-menu-content')

    busy.whenIdle(run)
    await settled()
    expect(run).not.toHaveBeenCalled()

    open.remove()
    await settled()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('does not run once cancelled', async () => {
    const busy = watch()
    const run = vi.fn()

    busy.whenIdle(run)()
    await settled()

    expect(run).not.toHaveBeenCalled()
  })
})
