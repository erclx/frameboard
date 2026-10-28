import '../styles.css'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { RenameField } from './rename-field'

const HOST_WIDTH = 300

/** Renders the field once the board's face has loaded, so a width read is the face's. */
async function renderField(hug: boolean) {
  await document.fonts.ready
  render(
    <div className="flex text-label" style={{ width: HOST_WIDTH }}>
      <RenameField
        name="hero"
        label="Rename frame hero"
        hug={hug}
        onCommit={() => {}}
        onCancel={() => {}}
      />
    </div>,
  )
  return screen.getByRole('textbox', { name: 'Rename frame hero' })
}

function widthOf(element: HTMLElement): number {
  return element.getBoundingClientRect().width
}

describe('RenameField', () => {
  it('fills its host without hug', async () => {
    const field = await renderField(false)

    // The field's -ml-1.5 pulls it 6px past the host's left edge.
    expect(widthOf(field)).toBe(HOST_WIDTH + 6)
  })

  it('hugs its name when it opens', async () => {
    const field = await renderField(true)

    expect(widthOf(field)).toBeGreaterThan(20)
    expect(widthOf(field)).toBeLessThan(80)
  })

  it('grows as the name grows and shrinks back as it is deleted', async () => {
    const field = await renderField(true)
    const opened = widthOf(field)

    await userEvent.keyboard('{End} section')
    const grown = widthOf(field)
    await userEvent.keyboard('{Backspace>8/}')

    expect(grown).toBeGreaterThan(opened)
    expect(widthOf(field)).toBe(opened)
  })

  it('stops at the width a filling field takes', async () => {
    const field = await renderField(true)

    await userEvent.keyboard(`{End}${'x'.repeat(80)}`)

    expect(widthOf(field)).toBe(HOST_WIDTH + 6)
  })
})
