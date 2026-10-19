import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { JSDOM } from 'jsdom'
import { type DefaultTreeAdapterMap, parse } from 'parse5'
import { describe, expect, it } from 'vitest'

import { frameHead, injectHead } from './inject'

type Document = DefaultTreeAdapterMap['document']
type Element = DefaultTreeAdapterMap['element']

const HEAD = '<style data-frameboard></style>'
const HASH = 'a'.repeat(64)

function inject(html: string): string {
  return new TextDecoder().decode(
    injectHead(new TextEncoder().encode(html), HEAD),
  )
}

describe('injectHead', () => {
  it.each([
    [
      'after a stated head start tag',
      '<!doctype html><html lang="en"><head><title>x</title></head><body></body></html>',
      `<!doctype html><html lang="en"><head>${HEAD}<title>x</title></head><body></body></html>`,
    ],
    [
      'after a head start tag carrying attributes',
      '<!doctype html>\n<head data-x="1">\n</head>',
      `<!doctype html>\n<head data-x="1">${HEAD}\n</head>`,
    ],
    [
      'after the html start tag when no head is stated',
      '<!doctype html><html><body><p>x</p></body></html>',
      `<!doctype html><html>${HEAD}<body><p>x</p></body></html>`,
    ],
    [
      'after the doctype when neither html nor head is stated',
      '<!DOCTYPE html>\n<p>x</p>',
      `<!DOCTYPE html>${HEAD}\n<p>x</p>`,
    ],
    [
      'at the start of a bare fragment',
      '<h1>Bare</h1><p>fragment',
      `${HEAD}<h1>Bare</h1><p>fragment`,
    ],
    [
      'at the start when a head tag comes after body content',
      '<p>x</p><head></head>',
      `${HEAD}<p>x</p><head></head>`,
    ],
    [
      'after a head start tag past a comment and whitespace',
      '<!-- note -->\n  <html>\n<head>',
      `<!-- note -->\n  <html>\n<head>${HEAD}`,
    ],
  ])('splices %s', (_case, html, expected) => {
    expect(inject(html)).toBe(expected)
  })

  it('splices past a leading BOM in a bare fragment', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...encode('<p>x</p>')])

    const out = injectHead(bytes, HEAD)

    expect([...out.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(new TextDecoder().decode(out.subarray(3))).toBe(`${HEAD}<p>x</p>`)
  })

  it('splices after a stated head behind a BOM', () => {
    const bytes = new Uint8Array([
      0xef,
      0xbb,
      0xbf,
      ...encode('<!doctype html><head></head>'),
    ])

    const out = injectHead(bytes, HEAD)

    expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(out)).toBe(
      `﻿<!doctype html><head>${HEAD}</head>`,
    )
  })

  it('counts bytes rather than characters ahead of the head', () => {
    const html = '<!doctype html><html lang="日本語"><head><title>é</title>'

    expect(inject(html)).toBe(
      `<!doctype html><html lang="日本語"><head>${HEAD}<title>é</title>`,
    )
  })

  it('keeps bytes that are not valid UTF-8 as they were', () => {
    const bytes = new Uint8Array([
      ...encode('<html title="'),
      0xff,
      ...encode('"><head></head>'),
    ])

    const out = injectHead(bytes, HEAD)

    expect([...out]).toEqual([
      ...encode('<html title="'),
      0xff,
      ...encode(`"><head>${HEAD}</head>`),
    ])
  })

  it("leaves a bare fragment fixture's head as the first element", () => {
    const html = readFileSync(
      fileURLToPath(
        new URL(
          '../../../test/fixtures/frames/bare-fragment.html',
          import.meta.url,
        ),
      ),
      'utf8',
    )

    const document = parse(inject(html))

    expect(document.mode).toBe('quirks')
    expect(firstHeadChild(document)).toBe('style')
  })

  it('keeps standards mode for a doctype with no html or head', () => {
    const document = parse(inject('<!doctype html><p>x</p>'))

    expect(document.mode).toBe('no-quirks')
    expect(firstHeadChild(document)).toBe('style')
  })
})

describe('the injected theme script', () => {
  function load(query: string) {
    return new JSDOM(
      `<!doctype html><head>${frameHead([], HASH)}</head><p>x</p>`,
      {
        url: `http://127.0.0.1/frames/site/home/hero.html${query}`,
        runScripts: 'dangerously',
      },
    ).window.document
  }

  it('shows the root in the theme the query names, with its class', () => {
    const root = load('?theme=dark').documentElement

    expect(root.getAttribute('data-theme')).toBe('dark')
    expect(root.style.colorScheme).toBe('dark')
    expect([...root.classList]).toEqual(['dark'])
  })

  it('leaves the root alone for a query naming no theme', () => {
    const root = load('?theme=sepia').documentElement

    expect(root.hasAttribute('data-theme')).toBe(false)
    expect(root.classList.length).toBe(0)
  })

  it('removes itself, leaving the stylesheet the one injected element', () => {
    const document = load('?theme=light')

    expect(document.querySelectorAll('[data-frameboard]')).toHaveLength(1)
    expect(document.querySelector('[data-frameboard]')?.tagName).toBe('STYLE')
  })
})

describe('frameHead', () => {
  it('imports the sheets in the order given, ahead of the theme script', () => {
    const head = frameHead(['/a.css', '/b.css'], HASH)

    expect(head).toMatch(
      /^<style data-frameboard data-hash="[0-9a-f]{64}">@import url\("\/a\.css"\);@import url\("\/b\.css"\);<\/style><script data-frameboard>/,
    )
  })
})

describe('the rendered hash', () => {
  it('stamps the hash it is given on the stylesheet, which the theme script leaves', () => {
    const document = new JSDOM(
      `<!doctype html><head>${frameHead([], HASH)}</head><p>x</p>`,
      { runScripts: 'dangerously' },
    ).window.document

    expect(
      document
        .querySelector('style[data-frameboard]')
        ?.getAttribute('data-hash'),
    ).toBe(HASH)
  })
})

function encode(text: string): number[] {
  return [...new TextEncoder().encode(text)]
}

function firstHeadChild(document: Document): string {
  const html = document.childNodes.find(
    (node): node is Element => node.nodeName === 'html',
  )
  const head = html?.childNodes.find(
    (node): node is Element => node.nodeName === 'head',
  )
  return head?.childNodes.at(0)?.nodeName ?? ''
}
