import { afterEach, describe, expect, it } from 'vitest'

import { LOOK_MARKER } from '@/shared/theme'
import { ask, bridgedFrame } from '@/test/frame-bridge'

import { takesClicks } from './reach'

function documentOf(body: string, head = ''): Document {
  const made = document.implementation.createHTMLDocument('frame')
  made.head.innerHTML = head
  made.body.innerHTML = body
  return made
}

describe('takesClicks', () => {
  it('finds a button', () => {
    expect(takesClicks(documentOf('<p>Hi</p><button>Go</button>'))).toBe(true)
  })

  it('finds a link with somewhere to go', () => {
    expect(takesClicks(documentOf('<a href="#next">Next</a>'))).toBe(true)
  })

  it('finds a script, which may wire clicks itself', () => {
    expect(takesClicks(documentOf('<div></div><script>1</script>'))).toBe(true)
  })

  it('finds nothing in text, images, and a link with no href', () => {
    expect(
      takesClicks(documentOf('<h1>Title</h1><img alt=""><a>Plain</a>')),
    ).toBe(false)
  })

  it('skips the script the frame route injects', () => {
    expect(
      takesClicks(
        documentOf('<p>Static</p>', `<script ${LOOK_MARKER}>0</script>`),
      ),
    ).toBe(false)
  })
})

describe('takes-clicks', () => {
  let iframe: HTMLIFrameElement | undefined

  afterEach(() => {
    iframe?.remove()
    iframe = undefined
  })

  it('answers whether a page takes a click, past the bridge it runs', async () => {
    iframe = await bridgedFrame('<h1>Title</h1>')

    const { reply } = await ask(iframe, 'takes-clicks', {})

    expect(reply).toEqual({ value: false })
  })

  it('answers true for a page with a button', async () => {
    iframe = await bridgedFrame('<button>Go</button>')

    const { reply } = await ask(iframe, 'takes-clicks', {})

    expect(reply).toEqual({ value: true })
  })
})
