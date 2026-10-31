import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { FrameboardError } from '@/shared/errors'

import {
  clipboardFiles,
  type ClipboardHost,
  writeClipboardFiles,
} from './files'

const WSL_RELEASE = '6.6.87.2-microsoft-standard-WSL2'

function host(overrides: Partial<ClipboardHost> = {}): ClipboardHost {
  return {
    platform: 'linux',
    release: '6.8.0-45-generic',
    env: {},
    run: async () => '',
    onPath: () => true,
    ...overrides,
  }
}

describe('clipboardFiles', () => {
  it('picks the WSL backend from a Microsoft kernel release', () => {
    expect(clipboardFiles(host({ release: WSL_RELEASE }))?.backend).toBe('wsl')
  })

  it('picks the WSL backend from the distro name a WSL shell sets', () => {
    const clipboard = clipboardFiles(
      host({ env: { WSL_DISTRO_NAME: 'Ubuntu' } }),
    )

    expect(clipboard?.backend).toBe('wsl')
  })

  it('has no backend under WSL without powershell.exe on the PATH', () => {
    const clipboard = clipboardFiles(
      host({ release: WSL_RELEASE, onPath: () => false }),
    )

    expect(clipboard).toBeNull()
  })

  it.each([
    ['plain Linux', host()],
    ['macOS', host({ platform: 'darwin', release: '24.0.0' })],
  ])('has no backend on %s', (_name, given) => {
    expect(clipboardFiles(given)).toBeNull()
  })
})

describe('writeClipboardFiles', () => {
  it('refuses clipboard-unsupported with no backend', async () => {
    const written = writeClipboardFiles(null, [
      { name: 'hero', bytes: Buffer.from('png') },
    ])

    await expect(written).rejects.toMatchObject({
      code: 'clipboard-unsupported',
    })
    await expect(written).rejects.toBeInstanceOf(FrameboardError)
  })
})

describe('the WSL backend', () => {
  let linuxTemp: string

  afterEach(() => {
    rmSync(linuxTemp, { recursive: true, force: true })
  })

  // Stands in for Windows: the temp folder, `wslpath` onto a real folder, and `Set-Clipboard`.
  function windows() {
    linuxTemp = mkdtempSync(join(tmpdir(), 'frameboard-wsl-'))
    const commands: string[] = []
    const run = async (command: string, args: string[]) => {
      const last = args.at(-1) ?? ''
      commands.push(`${command} ${last}`)
      if (last === '[IO.Path]::GetTempPath()') return 'C:\\Temp\\\r\n'
      if (command === 'wslpath') {
        return `${linuxTemp}/${last.slice('C:\\Temp\\'.length).replaceAll('\\', '/')}\n`
      }
      return ''
    }
    return { commands, run }
  }

  it('writes every image and sets them as one quoted file list', async () => {
    const { commands, run } = windows()
    const clipboard = clipboardFiles(host({ release: WSL_RELEASE, run }))

    await writeClipboardFiles(clipboard, [
      { name: 'hero', bytes: Buffer.from('one') },
      { name: "Bob's card", bytes: Buffer.from('two') },
      { name: 'hero', bytes: Buffer.from('three') },
    ])

    const [copy] = readdirSync(join(linuxTemp, 'frameboard-clip'))
    const folder = join(linuxTemp, 'frameboard-clip', copy ?? '')
    expect(readdirSync(folder).sort()).toEqual([
      "Bob's card.png",
      'hero-2.png',
      'hero.png',
    ])
    expect(readFileSync(join(folder, 'hero-2.png'), 'utf8')).toBe('three')
    const dir = `C:\\Temp\\frameboard-clip\\${copy}`
    expect(commands.at(-1)).toBe(
      `powershell.exe Set-Clipboard -Path '${dir}\\hero.png','${dir}\\Bob''s card.png','${dir}\\hero-2.png'`,
    )
  })

  it("clears the last copy's images when it writes the next", async () => {
    const { run } = windows()
    const clipboard = clipboardFiles(host({ release: WSL_RELEASE, run }))
    await writeClipboardFiles(clipboard, [
      { name: 'a', bytes: Buffer.from('') },
    ])

    await writeClipboardFiles(clipboard, [
      { name: 'b', bytes: Buffer.from('') },
    ])

    expect(readdirSync(join(linuxTemp, 'frameboard-clip'))).toHaveLength(1)
  })
})
