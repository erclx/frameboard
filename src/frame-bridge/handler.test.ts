import { afterEach, describe, expect, it } from 'vitest'

import { onceParsed } from './handler'

let iframe: HTMLIFrameElement | undefined

afterEach(() => {
  iframe?.remove()
  iframe = undefined
})

/** A document still parsing, as one is while its head runs a script. */
function parsing(): Document {
  iframe = document.createElement('iframe')
  document.body.append(iframe)
  const doc = iframe.contentDocument
  if (!doc) throw new Error('The iframe holds no document')
  doc.open()
  doc.write('<!doctype html><html><head></head>')
  return doc
}

describe('onceParsed', () => {
  it('waits for a document still parsing to reach its end', () => {
    const doc = parsing()
    const ran: string[] = []

    onceParsed(doc, () => ran.push(doc.body?.innerHTML ?? 'no body'))
    const before = [...ran]
    doc.write('<body><p>Late</p></body></html>')
    doc.close()

    expect(before).toEqual([])
    expect(ran).toEqual(['<p>Late</p>'])
  })

  it('runs at once for a document already parsed', () => {
    const ran: boolean[] = []

    onceParsed(document, () => ran.push(true))

    expect(ran).toEqual([true])
  })
})
