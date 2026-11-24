import { afterEach, describe, expect, it } from 'vitest'

import { frameFrom } from '@/server/checks/frame-source'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { elementHidden, hideElement, mayShow } from './hide'

const INDEX = 4

let board: TempBoard | undefined

afterEach(() => {
  board?.cleanup()
  board = undefined
})

/** A frame whose element 4 is `markup`, past the html, head, style, and body ahead of it. */
function page(markup: string, css = ''): string {
  return `<!doctype html><html><head><style>${css}</style></head><body>${markup}</body></html>`
}

function frame(html: string) {
  board ??= writeBoard({ 'site/home/hero.html': html })
  const target = {
    root: board.root,
    project: 'site',
    page: 'home',
    name: 'hero',
  }
  return frameFrom(target, html)
}

/** The frame once its element is hidden or shown, and the body's markup in it. */
function pressed(html: string, hidden: boolean) {
  const written = hideElement(html, INDEX, hidden, (now, index) =>
    mayShow(frame(now), [], index),
  )
  if (!written.ok) throw new Error(written.detail)
  return {
    html: written.html,
    body: written.html.slice(
      written.html.indexOf('<body>') + 6,
      written.html.indexOf('</body>'),
    ),
    span: written.span,
  }
}

describe('hideElement', () => {
  it('states hidden alone where nothing else sets the display', () => {
    const { body } = pressed(
      page('<p class="a">x</p>', '.a { color: red }'),
      true,
    )

    expect(body).toBe('<p class="a" hidden="">x</p>')
  })

  it.each([
    [
      'an inline flex, keeping it',
      '<div style="display: flex; gap: 8px">x</div>',
      '',
      '<div style="display: none; gap: 8px" hidden="" data-shown-display="flex">x</div>',
    ],
    [
      'a grid a rule sets',
      '<div class="g">x</div>',
      '.g { display: grid }',
      '<div class="g" hidden="" style="display: none">x</div>',
    ],
    [
      'a rule that resets every property',
      '<button class="b">x</button>',
      '.b { all: unset }',
      '<button class="b" hidden="" style="display: none">x</button>',
    ],
    [
      'a rule that hides it at one width alone',
      '<nav class="n">x</nav>',
      '.n { display: flex } @media (max-width: 600px) { .n { display: none } }',
      '<nav class="n" hidden="" style="display: none">x</nav>',
    ],
    [
      'a nested rule',
      '<p class="n">x</p>',
      'body { & .n { display: flex } }',
      '<p class="n" hidden="" style="display: none">x</p>',
    ],
    [
      'a rule on a hover',
      '<p class="n">x</p>',
      'body:hover .n { display: flex }',
      '<p class="n" hidden="" style="display: none">x</p>',
    ],
    [
      'a drawing, which the browser hides by no attribute',
      '<svg></svg>',
      '',
      '<svg hidden="" style="display: none"></svg>',
    ],
    [
      'a custom element',
      '<model-viewer></model-viewer>',
      '',
      '<model-viewer hidden="" style="display: none"></model-viewer>',
    ],
  ])('writes an inline none over %s', (_case, markup, css, hidden) => {
    expect(pressed(page(markup, css), true).body).toBe(hidden)
  })

  it('outranks an important rule', () => {
    const { body } = pressed(
      page('<div class="f">x</div>', '.f { display: flex !important }'),
      true,
    )

    expect(body).toBe(
      '<div class="f" hidden="" style="display: none !important">x</div>',
    )
  })

  it("leaves the attribute to a page's own [hidden] rule", () => {
    const { body } = pressed(
      page(
        '<div class="f">x</div>',
        '.f { display: flex } [hidden] { display: none !important }',
      ),
      true,
    )

    expect(body).toBe('<div class="f" hidden="">x</div>')
  })

  it('reads past a pseudo-element, which never draws the element itself', () => {
    const { body } = pressed(
      page('<p>x</p>', 'p::before { display: block }'),
      true,
    )

    expect(body).toBe('<p hidden="">x</p>')
  })

  it('hides an element already stating hidden that a rule shows', () => {
    const { body } = pressed(
      page('<div hidden class="g">x</div>', '.g { display: grid }'),
      true,
    )

    expect(body).toBe('<div hidden class="g" style="display: none">x</div>')
  })

  it('answers the start tag on both sides as its span', () => {
    expect(pressed(page('<p>x</p>'), true).span).toMatchObject({
      scope: 'start-tag',
      index: INDEX,
      before: '<p>',
      after: '<p hidden="">',
    })
  })

  it.each([
    ['a plain element', '<p class="a">x</p>', ''],
    ['an inline flex', '<div style="display: flex; gap: 8px">x</div>', ''],
    [
      'an important inline flex',
      '<div style="display: flex !important">x</div>',
      '',
    ],
    [
      'an inline none the frame states itself',
      '<div style="display: none">x</div>',
      '',
    ],
    [
      'an inline none over a rule',
      '<div class="g" style="display: none">x</div>',
      '.g { display: grid !important }',
    ],
    ['a grid a rule sets', '<div class="g">x</div>', '.g { display: grid }'],
    [
      'an important rule',
      '<b class="g">x</b>',
      '.g { display: grid !important }',
    ],
  ])('puts %s back as it was on a show', (_case, markup, css) => {
    const { html } = pressed(page(markup, css), true)

    expect(pressed(html, false).body).toBe(markup)
  })

  it('keeps a display set since the hide, dropping the one it kept', () => {
    const { body } = pressed(
      page(
        '<div style="display: grid" hidden="" data-shown-display="flex">x</div>',
      ),
      false,
    )

    expect(body).toBe('<div style="display: grid">x</div>')
  })

  it('refuses an index the frame does not hold', () => {
    expect(hideElement(page('<p>x</p>'), 99, true, () => false)).toMatchObject({
      ok: false,
      reason: 'invalid-address',
    })
  })
})

describe('elementHidden', () => {
  it.each([
    ['a stated hidden', '<p hidden>x</p>', '', true],
    ['no hidden', '<p>x</p>', '', false],
    [
      'a display none with no hidden',
      '<p style="display: none">x</p>',
      '',
      false,
    ],
    [
      'a hidden a rule shows anyway',
      '<p hidden class="f">x</p>',
      '.f { display: flex }',
      false,
    ],
    [
      'a hidden over an inline none',
      '<p hidden class="f" style="display: none">x</p>',
      '.f { display: flex }',
      true,
    ],
    ['a hidden drawing, which still draws', '<svg hidden></svg>', '', false],
  ])('reads %s', (_case, markup, css, expected) => {
    expect(elementHidden(frame(page(markup, css)), [])[INDEX]).toBe(expected)
  })
})
