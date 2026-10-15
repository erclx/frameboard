import { describe, expect, it } from 'vitest'

import { type Element, parseFrame } from './address'
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
})
