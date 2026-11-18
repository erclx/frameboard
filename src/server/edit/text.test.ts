import { describe, expect, it } from 'vitest'

import { type Element, parseFrame } from './address'
import { applyEdit } from './apply'
import { setText } from './text'

function first(source: string, tag: string): Element {
  const element = parseFrame(source).elements.find(
    (candidate) => candidate.tagName === tag,
  )
  if (!element) throw new Error(`no <${tag}> in ${source}`)
  return element
}

describe('setText', () => {
  it('should replace the text between the tags, escaped', () => {
    const source = '<h1 class="a">Old</h1>'
    expect(setText(source, first(source, 'h1'), 'Ship <it> & go')).toEqual({
      ok: true,
      html: '<h1 class="a">Ship &lt;it&gt; &amp; go</h1>',
    })
  })

  it('should fill an empty element', () => {
    const source = '<p></p>'
    expect(setText(source, first(source, 'p'), 'x')).toEqual({
      ok: true,
      html: '<p>x</p>',
    })
  })

  it('should write a newline as itself, which the parser reads back as the text', () => {
    const source = '<p>Old</p>'

    const written = setText(source, first(source, 'p'), 'One\nTwo')

    expect(written).toEqual({ ok: true, html: '<p>One\nTwo</p>' })
    expect(
      applyEdit(source, { index: 3 }, { kind: 'text', value: 'One\nTwo' }),
    ).toMatchObject({
      ok: true,
      html: '<p>One\nTwo</p>',
    })
  })

  it('should double a leading newline inside pre, since the parser drops one', () => {
    const source = '<pre>a</pre>'
    expect(setText(source, first(source, 'pre'), '\nb')).toEqual({
      ok: true,
      html: '<pre>\n\nb</pre>',
    })
  })

  it('should refuse an element whose span holds markup the tree moved', () => {
    const source = '<b>1<p>2</b>3</p>'
    expect(setText(source, first(source, 'b'), 'x')).toMatchObject({
      ok: false,
    })
  })

  it('should refuse an element holding another element', () => {
    const source = '<p>a<b>b</b></p>'
    expect(setText(source, first(source, 'p'), 'x')).toMatchObject({
      ok: false,
    })
  })

  it.each([
    ['script', '<script>a</script>'],
    ['title', '<title>a</title>'],
    ['head', '<head></head>'],
    ['table', '<table></table>'],
  ])('should refuse <%s>', (tag, source) => {
    expect(setText(source, first(source, tag), 'x')).toMatchObject({
      ok: false,
    })
  })

  it('should refuse an element with no end tag', () => {
    const source = '<ul><li>a<li>b</ul>'
    expect(setText(source, first(source, 'li'), 'x')).toMatchObject({
      ok: false,
    })
  })

  describe('a run', () => {
    it('should replace one text node beside a child element, keeping the child and the other run', () => {
      const source = '<li>Wipes in &amp; beside it, <code>wipe</code> same</li>'

      expect(setText(source, first(source, 'li'), 'A <b> & c ', 0)).toEqual({
        ok: true,
        html: '<li>A &lt;b&gt; &amp; c <code>wipe</code> same</li>',
      })
    })

    it('should replace the run after the child', () => {
      const source = '<p>One <code>x</code> two</p>'

      expect(setText(source, first(source, 'p'), ' three', 1)).toEqual({
        ok: true,
        html: '<p>One <code>x</code> three</p>',
      })
    })

    it('should count only text nodes, past a comment between runs', () => {
      const source = '<p>a<!-- c -->b<i>i</i>c</p>'

      expect(setText(source, first(source, 'p'), 'z', 2)).toEqual({
        ok: true,
        html: '<p>a<!-- c -->b<i>i</i>z</p>',
      })
    })

    it('should double a leading newline in a pre run the parser would drop', () => {
      const source = '<pre>a<b>x</b></pre>'

      expect(setText(source, first(source, 'pre'), '\nb', 0)).toEqual({
        ok: true,
        html: '<pre>\n\nb<b>x</b></pre>',
      })
    })

    it('should keep the newline the parser already dropped before a pre run', () => {
      const source = '<pre>\na<b>x</b></pre>'

      expect(setText(source, first(source, 'pre'), '\nb', 0)).toEqual({
        ok: true,
        html: '<pre>\n\nb<b>x</b></pre>',
      })
    })

    it('should refuse a run past the last text node', () => {
      const source = '<p>One <code>x</code></p>'

      expect(setText(source, first(source, 'p'), 'z', 1)).toEqual({
        ok: false,
        detail: '<p> holds no text run 1',
      })
    })

    it('should refuse a run inside raw content', () => {
      const source = '<style>a{}</style>'

      expect(setText(source, first(source, 'style'), 'z', 0)).toMatchObject({
        ok: false,
      })
    })
  })
})
