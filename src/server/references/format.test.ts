import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { frameFrom } from '@/server/checks/frame-source'

import { toReference } from './format'

const FOLDER = '/nowhere'

function frame(html: string, project = 'design') {
  return frameFrom(
    { root: '/board', project, page: 'home', name: 'grid' },
    html,
  )
}

describe('toReference', () => {
  it('should point element links at the project asset folder', async () => {
    const html =
      '<link href="../assets/kit/kit.css"><script src="../assets/kit/vendor/rough.js"></script>'

    const reference = await toReference(frame(html), 'home/grid', FOLDER)

    expect(reference).toContain('href="../assets/design/kit/kit.css"')
    expect(reference).toContain('src="../assets/design/kit/vendor/rough.js"')
  })

  it('should keep two projects linking one file name apart', async () => {
    const html = '<img src="../assets/icon.svg">'

    expect(
      await toReference(frame(html, 'design'), 'home/a', FOLDER),
    ).toContain('../assets/design/icon.svg')
    expect(
      await toReference(frame(html, 'launch'), 'home/b', FOLDER),
    ).toContain('../assets/launch/icon.svg')
  })

  it('should point a reference one folder deeper one more folder up', async () => {
    const html =
      '<link href="../assets/kit/kit.css"><img src="../assets/icon.svg">'

    const reference = await toReference(frame(html), 'landing/hero/390', FOLDER)

    expect(reference).toContain('href="../../assets/design/kit/kit.css"')
    expect(reference).toContain('src="../../assets/design/icon.svg"')
  })

  it('should point every url in a style block and a style attribute', async () => {
    const html =
      '<style>@font-face { src: url("../assets/a.woff2") } .b { background: url(../assets/b.png), url(../assets/c.png) }</style><div style="background: url(../assets/d.png)">x</div>'

    const reference = await toReference(frame(html), 'home/grid', FOLDER)

    expect(reference).toContain('../assets/design/a.woff2')
    expect(reference).toContain('../assets/design/b.png')
    expect(reference).toContain('../assets/design/c.png')
    expect(reference).toContain('../assets/design/d.png')
  })

  it('should point every candidate of a srcset', async () => {
    const html = '<img srcset="../assets/a.png 1x, ../assets/b.png 2x">'

    const reference = await toReference(frame(html), 'home/grid', FOLDER)

    expect(reference).toContain('../assets/design/a.png 1x')
    expect(reference).toContain('../assets/design/b.png 2x')
  })

  it('should leave asset text that loads nothing as it was', async () => {
    const html =
      '<p><code>../assets/hero.png</code> and <code>../../assets/hero.png</code></p>'

    const reference = await toReference(frame(html), 'home/grid', FOLDER)

    expect(reference).toContain('<code>../assets/hero.png</code>')
    expect(reference).toContain('<code>../../assets/hero.png</code>')
  })

  it('should format the frame, so a second pass changes nothing', async () => {
    const html =
      '<!doctype html><html><head><title>x</title><style>.a{color:red;margin:0}</style></head><body><div><p>one</p><p>two</p></div></body></html>'

    const once = await toReference(frame(html), 'home/grid', FOLDER)

    expect(once).not.toBe(html)
    expect(once.split('\n').length).toBeGreaterThan(5)
    expect(await toReference(frame(once), 'home/grid', FOLDER)).toBe(once)
  })

  it('should refuse a frame the formatter cannot parse, naming it', async () => {
    const html =
      '<div style="font-family:Geist,"DejaVu Sans",sans-serif">x</div>'

    await expect(
      toReference(frame(html), 'home/grid', FOLDER),
    ).rejects.toMatchObject({
      code: 'format-refused',
      message: expect.stringContaining('home/grid'),
    })
  })
})

describe('toReference without oxfmt installed', () => {
  afterEach(() => {
    vi.doUnmock('oxfmt')
    vi.resetModules()
  })

  it('should refuse formatter-not-found, naming the install command', async () => {
    vi.resetModules()
    vi.doMock('oxfmt', () => {
      throw new Error('Cannot find package oxfmt')
    })
    const { toReference: unformatted } = await import('./format')

    await expect(
      unformatted(frame('<p>x</p>'), 'home/grid', '/nowhere'),
    ).rejects.toMatchObject({
      code: 'formatter-not-found',
      message: expect.stringContaining('npm install --save-dev oxfmt@'),
    })
  })

  it('should use the oxfmt a project installed, for a copy outside that project', async () => {
    const project = mkdtempSync(join(tmpdir(), 'frameboard-format-'))
    const installed = join(project, 'node_modules/oxfmt')
    mkdirSync(installed, { recursive: true })
    writeFileSync(
      join(installed, 'package.json'),
      '{ "name": "oxfmt", "type": "module", "exports": "./index.js" }',
    )
    writeFileSync(
      join(installed, 'index.js'),
      "export const format = async () => ({ code: 'from the project', errors: [] })",
    )
    vi.resetModules()
    vi.doMock('oxfmt', () => {
      throw new Error('Cannot find package oxfmt')
    })
    const { toReference: projectFormatted } = await import('./format')

    const reference = await projectFormatted(
      frame('<p>x</p>'),
      'home/grid',
      join(project, 'canon/design'),
    )

    expect(reference).toBe('from the project')
    rmSync(project, { recursive: true, force: true })
  })
})
