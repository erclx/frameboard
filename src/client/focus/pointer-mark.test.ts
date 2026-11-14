import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { markPointerFocus } from './pointer-mark'

const MARK = 'data-pointer-focus'

function button(name: string): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.textContent = name
  document.body.append(element)
  return element
}

describe('markPointerFocus', () => {
  let stop: () => void

  beforeEach(() => {
    stop = markPointerFocus(window)
  })

  afterEach(() => {
    stop()
    document.body.replaceChildren()
  })

  it('marks a control focused by a pointer press', async () => {
    const first = button('First')

    await userEvent.click(first)

    expect(first).toHaveAttribute(MARK)
  })

  it('keeps the mark while Shift is held on the clicked control', async () => {
    const first = button('First')
    const user = userEvent.setup()

    await user.click(first)
    await user.keyboard('{Shift>}')

    expect(first).toHaveAttribute(MARK)
  })

  it('clears the mark when the control loses focus', async () => {
    const first = button('First')
    const second = button('Second')
    const user = userEvent.setup()

    await user.click(first)
    await user.tab()

    expect([first.hasAttribute(MARK), document.activeElement]).toEqual([
      false,
      second,
    ])
  })

  it('leaves a control reached by Tab unmarked', async () => {
    const first = button('First')

    await userEvent.tab()

    expect([first.hasAttribute(MARK), document.activeElement]).toEqual([
      false,
      first,
    ])
  })

  it('leaves a control script focuses after a key press unmarked', async () => {
    const first = button('First')
    const second = button('Second')
    const user = userEvent.setup()

    await user.click(first)
    await user.keyboard('{Escape}')
    second.focus()

    expect(second).not.toHaveAttribute(MARK)
  })

  it('marks a control script focuses after a pointer press', async () => {
    const first = button('First')
    const second = button('Second')
    first.addEventListener('click', () => second.focus())

    await userEvent.click(first)

    expect(second).toHaveAttribute(MARK)
  })

  it('leaves a clicked text field unmarked, so its ring shows', async () => {
    const field = document.createElement('input')
    field.type = 'text'
    document.body.append(field)

    await userEvent.click(field)

    expect(field).not.toHaveAttribute(MARK)
  })

  it('marks a clicked range input', async () => {
    const track = document.createElement('input')
    track.type = 'range'
    document.body.append(track)

    await userEvent.click(track)

    expect(track).toHaveAttribute(MARK)
  })

  it('reads the window losing focus to a frame as a pointer press', async () => {
    const first = button('First')
    const frame = document.createElement('iframe')
    document.body.append(frame)
    await userEvent.keyboard('{Escape}')

    frame.focus()
    first.focus()

    expect(first).toHaveAttribute(MARK)
  })
})
