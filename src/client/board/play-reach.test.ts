import { afterEach, describe, expect, it } from 'vitest'

import { LOOK_MARKER } from '@/shared/theme'
import { frameOf } from '@/test/board'

import { pageReach, takesClicks } from './play-reach'

function documentOf(body: string, head = ''): Document {
  const made = document.implementation.createHTMLDocument('frame')
  made.head.innerHTML = head
  made.body.innerHTML = body
  return made
}

/** Mounts a frame's root holding a live iframe of `body`, as the canvas draws one. */
async function mount(ref: string, body: string): Promise<void> {
  const root = document.createElement('div')
  root.dataset.frame = ref
  const iframe = document.createElement('iframe')
  root.append(iframe)
  document.body.append(root)
  await new Promise((resolve) => {
    iframe.addEventListener('load', resolve, { once: true })
    iframe.srcdoc = body
  })
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

describe('pageReach', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('reads a page of static frames as static', async () => {
    const a = frameOf('a')
    const b = frameOf('b')
    await mount(a.ref, '<h1>A</h1>')
    await mount(b.ref, '<p>B</p>')

    expect(pageReach([a, b])).toBe('static')
  })

  it('reads a page with one button as clickable', async () => {
    const a = frameOf('a')
    const b = frameOf('b')
    await mount(a.ref, '<h1>A</h1>')
    await mount(b.ref, '<button>B</button>')

    expect(pageReach([a, b])).toBe('clickable')
  })

  it('cannot tell while a shown frame has no live page', async () => {
    const a = frameOf('a')
    const culled = frameOf('culled')
    await mount(a.ref, '<h1>A</h1>')

    expect(pageReach([a, culled])).toBe('unread')
  })

  it('leaves a hidden frame out', async () => {
    const a = frameOf('a')
    const hidden = frameOf('hidden', { hidden: true })
    await mount(a.ref, '<h1>A</h1>')

    expect(pageReach([a, hidden])).toBe('static')
  })

  it('cannot tell on a page showing no frame', () => {
    expect(pageReach([])).toBe('unread')
  })
})
