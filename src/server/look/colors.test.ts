import { afterEach, describe, expect, it } from 'vitest'

import { readFrame } from '@/server/checks/frame-source'
import { tokenSheets } from '@/server/checks/tokens'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { colorKey, frameStyles, styleValue } from './colors'

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

  it('answers a property only the frame declares as its raw value', () => {
    const { element } = stylesOf(
      '<style>:root { --bg: #ececec }</style><p id="t" style="color: var(--bg)">x</p>',
      't',
    )

    expect(element?.color).toEqual({
      value: '#ececec',
      token: null,
      percent: 100,
    })
  })

  it('follows a chain of the frame’s own properties to its raw value', () => {
    const { element } = stylesOf(
      '<style>:root { --panel: #ffffff; --bg: var(--panel) }</style><p id="t" style="color: var(--bg)">x</p>',
      't',
    )

    expect(element?.color?.value).toBe('#ffffff')
  })

  it('reads a color-mix() over a frame property as raw, keeping its percent', () => {
    const { element } = stylesOf(
      '<style>:root { --bg: #ececec }</style><p id="t" style="background-color: color-mix(in srgb, var(--bg) 50%, transparent)">x</p>',
      't',
    )

    expect(element?.backgroundColor).toEqual({
      value: '#ececec',
      token: null,
      percent: 50,
    })
  })

  it('names the token a frame property aliases', () => {
    const { element } = stylesOf(
      '<style>:root { --bg: var(--primary) }</style><p id="t" style="color: color-mix(in srgb, var(--bg) 40%, transparent)">x</p>',
      't',
    )

    expect(element?.color).toEqual({
      value: 'var(--primary)',
      token: '--primary',
      percent: 40,
    })
  })

  it('keeps a token the frame overrides named as the token', () => {
    const { element } = stylesOf(
      '<style>:root { --primary: #000000 }</style><p id="t" style="color: var(--primary)">x</p>',
      't',
    )

    expect(element?.color?.token).toBe('--primary')
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
    expect(colors).toMatchObject([
      { value: 'var(--text)', token: '--text', percent: 100 },
      { value: '#ffffff', token: null, percent: 100 },
      { value: 'var(--primary)', token: '--primary', percent: 100 },
    ])
  })

  it('lists two frame properties holding one color once', () => {
    const { colors } = stylesOf(
      `<style>:root { --fg: #1a1a1a; --ink: #1a1a1a }</style>
      <p style="color: var(--fg)">a</p>
      <p style="color: var(--ink)">b</p>`,
    )

    expect(colors).toMatchObject([
      { value: '#1a1a1a', token: null, percent: 100 },
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

  it('lists one color written in hex case and rgb() once', () => {
    const { colors } = stylesOf(
      `<p style="color: #4F46E5">a</p>
      <p style="color: #4f46e5">b</p>
      <p style="color: rgb(79, 70, 229)">c</p>`,
    )

    expect(colors).toEqual([
      {
        value: '#4F46E5',
        token: null,
        percent: 100,
        uses: [expect.any(Number), expect.any(Number), expect.any(Number)],
      },
    ])
  })

  describe('uses', () => {
    /** Each color's `uses` as the `id`s of the elements at those indices, by its token or value. */
    function usesOf(body: string, id?: string) {
      const { colors } = stylesOf(body, id)
      const source = readFrame({
        root: board?.root ?? '',
        project: 'site',
        page: 'home',
        name: 'hero',
      })
      return Object.fromEntries(
        colors.map((color) => [
          color.token ?? color.value,
          color.uses?.map((at) => source.elements[at]?.attribs.id),
        ]),
      )
    }

    it('names each element setting a color, in document order', () => {
      expect(
        usesOf(
          `<i id="a" style="color: #4f46e5">a</i>
          <b id="b" style="color: #000000">b</b>
          <i id="c" style="color: #4F46E5">c</i>
          <u id="d" style="color: rgb(79, 70, 229)">d</u>`,
        ),
      ).toEqual({ '#4f46e5': ['a', 'c', 'd'], '#000000': ['b'] })
    })

    it('keeps a token and the raw value it holds apart', () => {
      expect(
        usesOf(
          `<i id="a" style="color: var(--primary)">a</i>
          <b id="b" style="color: #4f46e5">b</b>`,
        ),
      ).toEqual({ '--primary': ['a'], '#4f46e5': ['b'] })
    })

    it('names an element once for two properties holding one color', () => {
      expect(
        usesOf(`<i id="a" style="color: #4f46e5; border-color: #4f46e5">a</i>`),
      ).toEqual({ '#4f46e5': ['a'] })
    })

    it('names the elements a shared rule paints', () => {
      expect(
        usesOf(
          `<style>.card { background-color: #4f46e5 }</style>
          <div id="a" class="card">a</div>
          <div id="b" class="card">b</div>`,
        ),
      ).toEqual({ '#4f46e5': ['a', 'b'] })
    })

    it('names an element that inherits the color', () => {
      expect(
        usesOf(`<div id="a" style="color: #4f46e5"><p id="b">b</p></div>`),
      ).toEqual({ '#4f46e5': ['a', 'b'] })
    })

    it('leaves out the body, which the board selects as the frame', () => {
      board = writeBoard({
        'tokens.css': TOKENS,
        'site/home/hero.html': `<!doctype html><html><head></head><body id="body" style="background-color: #ffffff; color: #111827"><p id="a">a</p></body></html>`,
      })
      const source = readFrame({
        root: board.root,
        project: 'site',
        page: 'home',
        name: 'hero',
      })

      const { colors } = frameStyles(source, tokenSheets(board.root, 'site'))

      expect(
        colors.map(({ value, uses }) => [
          value,
          uses?.map((at) => source.elements[at]?.attribs.id),
        ]),
      ).toEqual([
        ['#111827', ['a']],
        ['#ffffff', []],
      ])
    })

    it('leaves out elements that never paint, inside a parent setting the color', () => {
      expect(
        usesOf(
          `<div id="a" style="color: #4f46e5">
            <style id="s">p { margin: 0 }</style>
            <p id="b">b</p>
            <br id="r" />
            <wbr id="w" />
            <script id="j">1</script>
            <template id="t"><i>x</i></template>
            <noscript id="n">x</noscript>
          </div>`,
        ),
      ).toEqual({ '#4f46e5': ['a', 'b'] })
    })

    it('names only the selected element’s subtree', () => {
      expect(
        usesOf(
          `<p id="a" style="color: #4f46e5">a</p>
          <div id="t"><b id="b" style="color: #4f46e5">b</b></div>`,
          't',
        ),
      ).toEqual({ '#4f46e5': ['b'] })
    })
  })
})

describe('colorKey', () => {
  it.each([
    ['#4f46e5', '#4F46E5'],
    ['#4f46e5', 'rgb(79, 70, 229)'],
    ['#4f46e5', 'rgb(79 70 229)'],
    ['#4f46e5cc', 'rgba(79, 70, 229, 0.8)'],
    ['#4f46e5cc', 'rgb(79 70 229 / 80%)'],
    ['#ffffff', '#fff'],
    ['var(--primary)', 'var( --primary )'],
  ])('reads %s and %s as one color', (one, other) => {
    expect(colorKey(styleValue(one))).toBe(colorKey(styleValue(other)))
  })

  it.each([
    ['#4f46e5', '#4f46e5cc'],
    ['#4f46e5', '#4f46e6'],
    ['var(--primary)', 'color-mix(in srgb, var(--primary) 50%, transparent)'],
    ['#ffffff', 'var(--white)'],
  ])('reads %s and %s as two colors', (one, other) => {
    expect(colorKey(styleValue(one))).not.toBe(colorKey(styleValue(other)))
  })

  it('joins a stated percent to the alpha a raw value carries', () => {
    expect(colorKey({ value: '#4f46e5', token: null, percent: 80 })).toBe(
      colorKey(styleValue('#4f46e5cc')),
    )
  })
})
