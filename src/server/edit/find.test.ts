import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { contentHash } from './address'
import { findInProject, MAX_HITS } from './find'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'frameboard-find-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function frame(ref: string, html: string): string {
  const [project = '', page = '', name = ''] = ref.split('/')
  mkdirSync(join(root, project, page), { recursive: true })
  writeFileSync(join(root, project, page, `${name}.html`), html)
  return contentHash(html)
}

function hide(project: string, page: string, name: string): void {
  writeFileSync(
    join(root, project, page, 'layout.json'),
    JSON.stringify({
      version: 1,
      frames: {
        [name]: { x: 0, y: 0, width: 100, height: 100, order: 0, hidden: true },
      },
    }),
  )
}

describe('findInProject', () => {
  it('hits a frame by its name, ignoring case, with no element address', async () => {
    frame('app/home/Getting started', '<body></body>')

    const result = await findInProject(root, 'app', 'STARTED')

    expect(result).toEqual({
      project: 'app',
      query: 'STARTED',
      hits: [
        {
          kind: 'frame',
          page: 'home',
          frame: 'Getting started',
          ref: 'app/home/Getting started',
          index: null,
          hash: null,
          name: 'Getting started',
          snippet: null,
        },
      ],
      truncated: false,
    })
  })

  it('hits an element by its data-name with its index and the file hash', async () => {
    const hash = frame(
      'app/home/hero',
      '<body><button data-name="Primary action"><svg></svg></button></body>',
    )

    const { hits } = await findInProject(root, 'app', 'primary')

    expect(hits).toEqual([
      expect.objectContaining({
        kind: 'element',
        ref: 'app/home/hero',
        index: 3,
        hash,
        name: 'Primary action',
      }),
    ])
  })

  it('hits copy as text once, with the element holding it', async () => {
    frame('app/home/hero', '<body><p>Get started in minutes</p></body>')

    const { hits } = await findInProject(root, 'app', 'started')

    expect(hits).toEqual([
      expect.objectContaining({
        kind: 'text',
        index: 3,
        snippet: 'Get started in minutes',
      }),
    ])
  })

  it('finds text in an element beside an inline child, leaving the child its own', async () => {
    frame('app/home/hero', '<body><p>Before you <b>start</b>, pick</p></body>')

    const { hits } = await findInProject(root, 'app', 'pick')

    expect(hits.map((hit) => [hit.kind, hit.index])).toEqual([['text', 3]])
  })

  it('cuts a long text hit around the match', async () => {
    frame(
      'app/home/hero',
      `<body><p>${'a'.repeat(50)} needle ${'b'.repeat(100)}</p></body>`,
    )

    const { hits } = await findInProject(root, 'app', 'needle')

    expect(hits[0]?.snippet).toBe(
      `…${'a'.repeat(19)} needle ${'b'.repeat(53)}…`,
    )
  })

  it("skips a template's contents and a script's code", async () => {
    frame(
      'app/home/hero',
      '<body><template><p>needle</p></template><script>needle()</script></body>',
    )

    const { hits } = await findInProject(root, 'app', 'needle')

    expect(hits).toEqual([])
  })

  it('leaves a hidden frame out', async () => {
    frame('app/home/secret', '<body><p>needle</p></body>')
    hide('app', 'home', 'secret')

    const { hits } = await findInProject(root, 'app', 'needle')

    expect(hits).toEqual([])
  })

  it('hits a frame elementTree refuses by its name alone', async () => {
    frame(
      'app/home/needle table',
      '<body><table><tr><td>needle</td></tr></table></body>',
    )

    const { hits } = await findInProject(root, 'app', 'needle')

    expect(hits.map((hit) => hit.kind)).toEqual(['frame'])
  })

  it('searches every page of the project', async () => {
    frame('app/home/hero', '<body><p>needle</p></body>')
    frame('app/onboarding/welcome', '<body><p>needle</p></body>')

    const { hits } = await findInProject(root, 'app', 'needle')

    expect(hits.map((hit) => hit.page)).toEqual(['home', 'onboarding'])
  })

  it('answers nothing for a blank query', async () => {
    frame('app/home/hero', '<body><p>needle</p></body>')

    const result = await findInProject(root, 'app', '  ')

    expect(result).toEqual({
      project: 'app',
      query: '  ',
      hits: [],
      truncated: false,
    })
  })

  it('caps the hits and says the list was cut', async () => {
    frame(
      'app/home/hero',
      `<body>${'<p>needle</p>'.repeat(MAX_HITS + 1)}</body>`,
    )

    const result = await findInProject(root, 'app', 'needle')

    expect(result.hits).toHaveLength(200)
    expect(result.truncated).toBe(true)
  })
})
