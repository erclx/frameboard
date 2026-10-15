import fc from 'fast-check'

import type { EditChange } from './apply'

// Test-only. Generates frames shaped to reach every guard the writer carries:
// line endings, entities, every attribute quoting, duplicated and mixed-case
// names, values ending in `/`, void and raw-text elements, templates, SVG,
// tables, misnesting, and a leading BOM.

const lineBreak = fc.constantFrom('\n', '\r\n', '', ' ', '\t')
const textChunk = fc.constantFrom(
  'Ship it',
  'a &amp; b',
  '&lt;tag&gt;',
  'café',
  '😀 emoji',
  '&nbsp;x',
  'x > y',
  '   ',
  '&copy',
  'naïve   sep',
)
const attributeName = fc.constantFrom(
  'class',
  'id',
  'title',
  'data-x',
  'CLASS',
  'Style',
  'style',
  'href',
  'aria-label',
  'hidden',
)
const attributeValue = fc.constantFrom(
  'a',
  'b c',
  '',
  'x&amp;y',
  '&quot;q&quot;',
  'color: red',
  'color:red;padding:4px',
  'padding-top: 2px; border-top-left-radius: 3px; color: red',
  'font-family: &quot;Geist&quot;, sans-serif',
  "it's",
  'a"b',
  'x/',
  '😀',
  'url(a;b)',
)
const quoting = fc.constantFrom('"', "'", '', 'bare')
const gap = fc.constantFrom(' ', '  ', '\n  ', '\r\n\t', '\t')
const equalsGap = fc.constantFrom('=', ' = ', '=\n')

const attribute = fc
  .tuple(gap, attributeName, quoting, attributeValue, equalsGap)
  .map(([lead, name, quote, value, equals]) => {
    if (quote === 'bare') return `${lead}${name}`
    if (quote === '') {
      const unquoted = value.replace(/[\s"'=<>`]/g, '') || 'u'
      return `${lead}${name}=${unquoted}`
    }
    const safe =
      quote === '"'
        ? value.replace(/"/g, '&quot;')
        : value.replace(/'/g, '&#39;')
    return `${lead}${name}${equals}${quote}${safe}${quote}`
  })
const attributes = fc
  .array(attribute, { maxLength: 4 })
  .map((list) => list.join(''))

const VOID = ['br', 'img', 'input', 'hr', 'meta']
const CONTAINER = [
  'div',
  'p',
  'span',
  'a',
  'b',
  'section',
  'h1',
  'button',
  'ul',
  'li',
  'em',
  'label',
  'pre',
]
const RAW = ['script', 'style', 'textarea', 'title']
const RAW_CONTENT: Readonly<Record<string, string>> = {
  script: 'const s = "<div></p>";',
  style: 'p > a { color: red }',
}

const node = fc.letrec<{ node: string }>((tie) => ({
  node: fc.oneof(
    { weight: 3, arbitrary: textChunk },
    {
      weight: 3,
      arbitrary: fc
        .tuple(
          fc.constantFrom('span', 'p', 'h1', 'a', 'button', 'em', 'li', 'pre'),
          attributes,
          textChunk,
        )
        .map(([tag, attrs, text]) => `<${tag}${attrs}>${text}</${tag}>`),
    },
    {
      weight: 1,
      arbitrary: fc.constantFrom(
        '<!-- <div>c</div> -->',
        '<!---->',
        '<!-- x -->',
      ),
    },
    {
      weight: 2,
      arbitrary: fc
        .tuple(
          fc.constantFrom(...VOID),
          attributes,
          fc.constantFrom('>', '/>', ' />'),
        )
        .map(([tag, attrs, end]) => `<${tag}${attrs}${end}`),
    },
    {
      weight: 1,
      arbitrary: fc
        .tuple(fc.constantFrom(...RAW), attributes)
        .map(
          ([tag, attrs]) =>
            `<${tag}${attrs}>${RAW_CONTENT[tag] ?? 'a <b> & c'}</${tag}>`,
        ),
    },
    {
      weight: 1,
      arbitrary: fc
        .tuple(attributes, fc.constantFrom('<li>a</li>', '<span>t</span>'))
        .map(([attrs, inner]) => `<template${attrs}>${inner}</template>`),
    },
    {
      weight: 1,
      arbitrary: fc
        .tuple(attributes, attributes)
        .map(
          ([outer, inner]) =>
            `<svg${outer}><circle${inner}/><path d="M0 0"></path></svg>`,
        ),
    },
    {
      weight: 1,
      arbitrary: fc
        .tuple(attributes, attributes)
        .map(
          ([outer, inner]) =>
            `<table${outer}><tbody><tr${inner}><td>c</td></tr></tbody></table>`,
        ),
    },
    {
      weight: 4,
      arbitrary: fc
        .tuple(
          fc.constantFrom(...CONTAINER),
          fc.boolean(),
          attributes,
          fc.array(tie('node'), { maxLength: 3 }),
          lineBreak,
        )
        .map(([name, isUpper, attrs, children, separator]) => {
          const tag = isUpper ? name.toUpperCase() : name
          return `<${tag}${attrs}>${children.join(separator)}</${tag}>`
        }),
    },
  ),
})).node

const shape = fc.constantFrom('full', 'bare', 'bom', 'crlf-full')

export const frameArbitrary = fc
  .tuple(shape, fc.array(node, { minLength: 1, maxLength: 4 }))
  .map(([kind, body]) => {
    const inner = body.join('\n')
    if (kind === 'bare') return inner
    const separator = kind === 'crlf-full' ? '\r\n' : '\n'
    const document = [
      '<!doctype html>',
      '<html lang="en">',
      '<head><title>t</title></head>',
      '<body>',
      inner,
      '</body>',
      '</html>',
      '',
    ].join(separator)
    return kind === 'bom' ? `\uFEFF${document}` : document
  })

export const changeArbitrary: fc.Arbitrary<EditChange> = fc.oneof(
  fc.record({
    kind: fc.constant('style' as const),
    property: fc.constantFrom(
      'color',
      'font-size',
      'padding',
      'padding-top',
      'opacity',
      'border-radius',
      'border-top-left-radius',
    ),
    value: fc.constantFrom(
      'red',
      '48px',
      'var(--color-accent)',
      '0.5',
      '',
      'url("a;b.png")',
      "'Geist', serif",
    ),
  }),
  fc.record({
    kind: fc.constant('attribute' as const),
    name: fc.constantFrom('class', 'title', 'data-x', 'id', 'aria-label'),
    value: fc.constantFrom(
      '',
      'new',
      'a "quoted" & <odd>',
      "it's",
      '😀',
      'x\ny',
    ),
  }),
  fc.record({
    kind: fc.constant('text' as const),
    value: fc.constantFrom(
      '',
      'Ship <it> & go',
      'plain',
      '😀 café',
      '\nlead newline',
      '&amp; literal',
    ),
  }),
)
