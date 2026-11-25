import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { EXIT_CODES } from '@/shared/errors'
import { RECORDS } from '@/shared/records/index'

import { cli } from '../../../test/support/cli'

describe('docs', () => {
  let cwd: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'frameboard-docs-'))
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  async function docs() {
    const run = await cli(['docs', '--json'], { cwd })
    return run.json().data as {
      verbs: { name: string; options: { flags: string; default?: unknown }[] }[]
      exitCodes: unknown
      records: Record<string, { type?: string }>
      contentFormat: {
        controls: string[]
        kits: string[]
        images: string[]
        models: string[]
        names: { pattern: string }
        frameSizes: Record<string, { width: number; height: number }>
      }
      checks: { rules: { id: string; tier: string; configKey?: string }[] }
    }
  }

  it('runs outside any board', async () => {
    const run = await cli(['docs', '--json'], { cwd })

    expect(run.exitCode).toBe(0)
  })

  it('lists every registered verb', async () => {
    const { verbs } = await docs()

    expect(verbs.map((verb) => verb.name)).toEqual([
      'serve',
      'show',
      'open',
      'preview',
      'selection',
      'list',
      'project add',
      'project rename',
      'project title',
      'project delete',
      'project group',
      'project archive',
      'project tokens',
      'kit list',
      'kit add',
      'kit remove',
      'kit save',
      'image find',
      'image generate',
      'image doctor',
      'image free',
      'model find',
      'model generate',
      'font find',
      'font list',
      'font remove',
      'page add',
      'page duplicate',
      'page rename',
      'page move',
      'page transition',
      'page delete',
      'frame add',
      'frame duplicate',
      'frame move',
      'frame resize',
      'frame fit',
      'frame order',
      'frame rename',
      'frame delete',
      'frame device',
      'frame transition',
      'frame kit',
      'frame speaker-notes',
      'frame hide',
      'frame lock',
      'edit',
      'remove',
      'check',
      'notes',
      'notes reply',
      'notes done',
      'inbox',
      'editing',
      'capture',
      'inspect',
      'references sync',
      'docs',
    ])
  })

  it('lists each option with its default', async () => {
    const { verbs } = await docs()

    expect(verbs.find((verb) => verb.name === 'serve')?.options).toContainEqual(
      expect.objectContaining({ flags: '-p, --port <port>', default: 4173 }),
    )
  })

  it('prints a JSON schema for every registered record', async () => {
    const { records } = await docs()

    expect(Object.keys(records)).toEqual(Object.keys(RECORDS))
    expect(records.layout?.type).toBe('object')
  })

  it('prints the image records and the codes their verbs refuse with', async () => {
    const run = await cli(['docs', '--json'], { cwd })
    const data = run.json().data as {
      records: Record<string, { type?: string; oneOf?: unknown[] }>
      exitCodes: Record<string, number>
    }

    expect(data.records.imageFind?.type).toBe('object')
    expect(data.records.licenseFile?.oneOf).toHaveLength(2)
    expect(data.exitCodes).toMatchObject({
      'result-not-found': 3,
      'no-provider': 3,
      'source-failed': 13,
      'provider-failed': 13,
    })
  })

  it('appends the social and video sizes after every earlier size, unchanged', async () => {
    const { contentFormat } = await docs()

    expect(contentFormat.frameSizes).toMatchObject({
      phone: { width: 390, height: 844 },
      'slide-4-3': { width: 1024, height: 768 },
      'og-card': { width: 1200, height: 630 },
      'linkedin-post': { width: 1200, height: 627 },
      'video-landscape': { width: 1920, height: 1080 },
      'video-portrait': { width: 1080, height: 1920 },
    })
    expect(Object.keys(contentFormat.frameSizes).slice(-4)).toEqual([
      'og-card',
      'linkedin-post',
      'video-landscape',
      'video-portrait',
    ])
  })

  it('states the drawn controls contract by its attribute names', async () => {
    const { contentFormat } = await docs()

    expect(contentFormat.controls[0]).toContain(
      'data-binds="<selector> <--property>" and data-unit="<unit>"',
    )
  })

  it("lists capture's project form, its prune, and the removals its record carries", async () => {
    const run = await cli(['docs', '--json'], { cwd })
    const { verbs, records } = run.json().data as {
      verbs: { name: string; options: { flags: string }[] }[]
      records: { capture?: { properties?: object; required?: string[] } }
    }

    expect(
      verbs
        .find((verb) => verb.name === 'capture')
        ?.options.map((option) => option.flags),
    ).toEqual(expect.arrayContaining(['--all-pages', '--prune']))
    expect(records.capture?.properties).toHaveProperty('removed')
    expect(records.capture?.required).toEqual(['images'])
  })

  it('states the default licenses, the provider order, and the license file', async () => {
    const { contentFormat } = await docs()

    expect(contentFormat.images[0]).toContain('under cc0, pdm alone')
    expect(contentFormat.images[1]).toContain(
      'fal (fal-ai/flux/schnell, FAL_KEY), google (gemini-nano-banana-2.1, GEMINI_API_KEY)',
    )
    expect(contentFormat.images[2]).toContain('<file>.license.json')
  })

  it('states the model element, the script its head loads, and where that file ships', async () => {
    const { contentFormat } = await docs()

    expect(contentFormat.models[0]).toContain(
      '<model-viewer src="../assets/<file>.glb" alt="">',
    )
    expect(contentFormat.models[1]).toContain(
      '<script type="module" src="../assets/model-viewer.min.js"></script>',
    )
    expect(contentFormat.models[1]).toMatch(
      /ships with the tool at \S+model-viewer\.min\.js,/,
    )
  })

  it('states the staging attributes and the reach an orbit needs beside it', async () => {
    const { contentFormat } = await docs()

    expect(contentFormat.models[2]).toContain(
      'camera-orbit="30deg 70deg 6m" max-camera-orbit="auto auto 6m"',
    )
    expect(contentFormat.models[2]).toContain(
      'orientation="<roll>deg <pitch>deg <yaw>deg"',
    )
  })

  it('states that the doctor reports both workflows’ files and the verb each serves', async () => {
    const { contentFormat } = await docs()
    const doctor = contentFormat.images.find((line: string) =>
      line.startsWith('image doctor'),
    )

    expect(doctor).toContain('each bundled workflow')
    expect(doctor).toContain('model generate')
  })

  it('states what model generate reads, where it runs, and what its license records', async () => {
    const { contentFormat } = await docs()
    const generate = contentFormat.models.find((line: string) =>
      line.startsWith('model generate'),
    )

    expect(generate).toContain('FRAMEBOARD_COMFYUI_URL')
    expect(generate).toContain('{{image}}')
    expect(generate).toContain('image free')
  })

  it('states where model find searches, how it ranks, and the size it saves at', async () => {
    const { contentFormat } = await docs()
    const find = contentFormat.models.find((line: string) =>
      line.startsWith('model find'),
    )

    expect(find).toContain('Poly Haven')
    expect(find).toContain('then by download count')
    expect(find).toContain(
      '1k textures unless --size names one of 1k, 2k, 4k, 8k, 16k',
    )
  })

  it('names the kit files, the shipped kits, and where an added kit sits', async () => {
    const { contentFormat } = await docs()

    expect(contentFormat.kits[0]).toContain(
      'The tool ships clean, sketch, wireframe',
    )
    expect(contentFormat.kits[1]).toContain("the project's assets/kits/<kit>/")
  })

  it('names the verbs that set, clear, and remove a kit, and the key a frame names one by', async () => {
    const { contentFormat } = await docs()
    const kits = contentFormat.kits.join('\n')

    expect(kits).toContain('frame kit <frame-ref> <kit>')
    expect(kits).toContain('frame kit <frame-ref> none')
    expect(kits).toContain('kit remove')
    expect(kits).toContain('layout.json entry')
  })

  it('names --replace as taking a newer copy and keeping each frame on it', async () => {
    const { contentFormat } = await docs()

    expect(contentFormat.kits[1]).toMatch(/--replace .*keeps its kit/)
  })

  it('names the legacy folder as loading only where it holds kit.json', async () => {
    const { contentFormat } = await docs()

    expect(contentFormat.kits.join('\n')).toContain('assets/kit/kit.json')
  })

  it('no longer names tokens-exist as a kit add refusal', async () => {
    const { contentFormat } = await docs()

    expect(contentFormat.kits.join('\n')).not.toContain('tokens-exist')
  })

  it('prints the exit table and the name rule from their sources', async () => {
    const { exitCodes, contentFormat } = await docs()

    expect(exitCodes).toEqual(EXIT_CODES)
    expect(contentFormat.names.pattern).toBe('^[A-Za-z0-9][A-Za-z0-9._-]*$')
  })

  it('lists every check rule with its tier and the config key that turns it on', async () => {
    const { checks } = await docs()

    expect(checks.rules).toContainEqual(
      expect.objectContaining({ id: 'theme', tier: 'selector' }),
    )
    expect(checks.rules).toContainEqual(
      expect.objectContaining({ id: 'uppercase', configKey: 'noUppercase' }),
    )
  })

  it('gives every check rule a level', async () => {
    const { checks } = await docs()

    expect(checks.rules).toContainEqual(
      expect.objectContaining({ id: 'missing-file', severity: 'error' }),
    )
    expect(checks.rules).toContainEqual(
      expect.objectContaining({ id: 'generic-font', severity: 'warning' }),
    )
  })

  it('lists the browser rules with their tier', async () => {
    const { checks } = await docs()

    expect(
      checks.rules
        .filter((rule) => rule.tier === 'browser')
        .map((rule) => rule.id),
    ).toEqual([
      'clipped',
      'scrollbar',
      'viewport',
      'min-font-size',
      'min-contrast',
      'dropped-declaration',
      'scroll-effect',
    ])
  })

  it('names the minFontSize key that turns on the font size rule', async () => {
    const { checks } = await docs()

    expect(checks.rules).toContainEqual(
      expect.objectContaining({
        id: 'min-font-size',
        configKey: 'minFontSize',
      }),
    )
  })

  it('names the minContrast key that turns on the contrast rule', async () => {
    const { checks } = await docs()

    expect(checks.rules).toContainEqual(
      expect.objectContaining({
        id: 'min-contrast',
        configKey: 'minContrast',
      }),
    )
  })

  it('prints the check result record', async () => {
    const { records } = await docs()

    expect(records.checkResult?.type).toBe('object')
  })

  describe('without --json', () => {
    it('prints a heading for every section the description names', async () => {
      const { stdout, exitCode } = await cli(['docs'], { cwd })

      expect(exitCode).toBe(0)
      for (const heading of [
        'Verbs',
        'Exit codes',
        'Records',
        'Content format',
        'Check rules',
        'Kits',
      ]) {
        expect(stdout).toMatch(new RegExp(`^${heading}$`, 'm'))
      }
    })

    it('carries an exit code, a record, a content format line, and a rule id', async () => {
      const { stdout } = await cli(['docs'], { cwd })

      expect(stdout).toMatch(/^ {2}server-not-running +3$/m)
      expect(stdout).toContain('checkResult')
      expect(stdout).toContain('A frame is any *.html file directly in a page')
      expect(stdout).toMatch(/^ {2}outside-link {2}error, exact/m)
      expect(stdout).toContain('A kit is a folder of plain files')
      expect(stdout).toContain('frameboard open  ')
      expect(stdout).toContain(
        '--theme <theme>  the theme to capture (one of light, dark, both, default "both")',
      )
    })
  })
})
