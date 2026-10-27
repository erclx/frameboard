import { afterEach, describe, expect, it } from 'vitest'

import { readFrame } from '@/server/checks/frame-source'
import { tokenSheets } from '@/server/checks/tokens'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { frameStyles } from './colors'

let board: TempBoard | undefined

afterEach(() => {
  board?.cleanup()
  board = undefined
})

const TOKENS = `:root { --primary: #4f46e5; --text: #111827; --border: #e5e7eb }`

/** The styles of one frame, at the element with `id` when one is named. */
function stylesOf(body: string, id?: string) {
  board = writeBoard({
    'tokens.css': TOKENS,
    'site/home/hero.html': `<!doctype html><html><head></head><body>${body}</body></html>`,
  })
  const source = readFrame({
    root: board.root,
    project: 'site',
    page: 'home',
    name: 'hero',
  })
  const index =
    id === undefined
      ? undefined
      : source.elements.findIndex((candidate) => candidate.attribs.id === id)
  return frameStyles(source, tokenSheets(board.root, 'site'), index)
}

describe('frameStyles', () => {
  it('names the token a var() states', () => {
    const { element } = stylesOf(
      '<p id="t" style="background-color: var(--primary)">x</p>',
      't',
    )

    expect(element?.backgroundColor).toEqual({
      value: 'var(--primary)',
      token: '--primary',
      percent: 100,
    })
  })

  it('flags a raw hex as having no token, even one equal to a token', () => {
    const { element } = stylesOf('<p id="t" style="color: #4f46e5">x</p>', 't')

    expect(element?.color).toEqual({
      value: '#4f46e5',
      token: null,
      percent: 100,
    })
  })

  it('reads a color-mix() over a token back as the token and its percent', () => {
    const { element } = stylesOf(
      '<p id="t" style="background-color: color-mix(in srgb, var(--primary) 50%, transparent)">x</p>',
      't',
    )

    expect(element?.backgroundColor).toMatchObject({
      token: '--primary',
      percent: 50,
    })
  })

  it('reads an 8-digit hex as its color and its alpha as a percent', () => {
    const { element } = stylesOf(
      '<p id="t" style="color: #11182780">x</p>',
      't',
    )

    expect(element?.color).toEqual({
      value: '#111827',
      token: null,
      percent: 50,
    })
  })

  it('names a token no sheet defines, rather than flagging it raw', () => {
    const { element } = stylesOf(
      '<p id="t" style="color: var(--missing)">x</p>',
      't',
    )

    expect(element?.color?.token).toBe('--missing')
  })

  it('takes the color and width out of a border shorthand', () => {
    const { element } = stylesOf(
      '<p id="t" style="border: 1px solid var(--border)">x</p>',
      't',
    )

    expect([element?.borderColor?.token, element?.borderWidth?.value]).toEqual([
      '--border',
      '1px',
    ])
  })

  it('reads a background color stated after a background shorthand', () => {
    const { element } = stylesOf(
      '<p id="t" style="background: var(--border); background-color: var(--primary)">x</p>',
      't',
    )

    expect(element?.backgroundColor?.token).toBe('--primary')
  })

  it('names the font token an ancestor states, through inheritance', () => {
    const { element } = stylesOf(
      '<div style="font-family: var(--font-text)"><p id="t">x</p></div>',
      't',
    )

    expect(element?.fontFamily).toEqual({
      value: 'var(--font-text)',
      token: '--font-text',
      percent: 100,
    })
  })

  it('answers a raw family as having no token', () => {
    const { element } = stylesOf(
      '<p id="t" style="font-family: Geist, sans-serif">x</p>',
      't',
    )

    expect(element?.fontFamily?.token).toBeNull()
  })

  it('answers null for a property nothing sets', () => {
    const { element } = stylesOf('<p id="t">x</p>', 't')

    expect(element?.boxShadow).toBeNull()
  })

  it('lists the frame’s colors once each, with their tokens', () => {
    const { element, colors } = stylesOf(
      `<div style="color: var(--text); background: #ffffff">
        <p style="color: var(--primary)">a</p>
        <p style="color: var(--primary)">b</p>
        <span>c</span>
      </div>`,
    )

    expect(element).toBeNull()
    expect(colors).toEqual([
      { value: 'var(--text)', token: '--text', percent: 100 },
      { value: '#ffffff', token: null, percent: 100 },
      { value: 'var(--primary)', token: '--primary', percent: 100 },
    ])
  })

  it('lists only the selected element’s subtree', () => {
    const { colors } = stylesOf(
      `<p style="color: #000000">a</p>
      <div id="t" style="color: var(--text)"><b style="background-color: var(--primary)">b</b></div>`,
      't',
    )

    expect(colors.map((color) => color.token ?? color.value)).toEqual([
      '--text',
      '--primary',
    ])
  })
})
