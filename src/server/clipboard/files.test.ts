import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { clipboardFiles, type ClipboardHost } from './files'

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

describe('the WSL backend', () => {
  let linuxTemp: string

  afterEach(() => {
    rmSync(linuxTemp, { recursive: true, force: true })
  })

  // Stands in for Windows: the temp folder, `wslpath` onto a real folder, and `Set-Clipboard`.
  function windows() {
    linuxTemp = mkdtempSync(join(tmpdir(), 'frameboard-wsl-'))
    const commands: string[] = []
    // Which command each call was, in the order they ran.
    const steps: string[] = []
    // Whether every file each `Set-Clipboard` names exists as it runs.
    const filesFound: boolean[] = []
    const toLinux = (windowsPath: string) =>
      `${linuxTemp}/${windowsPath.slice('C:\\Temp\\'.length).replaceAll('\\', '/')}`
    const run = async (command: string, args: string[]) => {
      const last = args.at(-1) ?? ''
      commands.push(`${command} ${last}`)
      if (last === '[IO.Path]::GetTempPath()') {
        steps.push('temp path')
        return 'C:\\Temp\\\r\n'
      }
      if (command === 'wslpath') {
        steps.push('wslpath')
        return `${toLinux(last)}\n`
      }
      if (last.startsWith('Set-Clipboard')) {
        steps.push('Set-Clipboard')
        const paths = [...last.matchAll(/'([^']+)'/g)].map(([, path]) => path)
        filesFound.push(paths.every((path) => existsSync(toLinux(path ?? ''))))
      }
      return ''
    }
    return { commands, filesFound, run, steps }
  }

  it('writes every image and sets them as one quoted file list', async () => {
    const { commands, run } = windows()
    const clipboard = clipboardFiles(host({ release: WSL_RELEASE, run }))

    await clipboard?.write([
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
    await clipboard?.write([{ name: 'a', bytes: Buffer.from('') }])

    await clipboard?.write([{ name: 'b', bytes: Buffer.from('') }])

    expect(readdirSync(join(linuxTemp, 'frameboard-clip'))).toHaveLength(1)
  })

  it('runs a copy started mid-copy only after the first sets the clipboard', async () => {
    const { filesFound, run, steps } = windows()
    const clipboard = clipboardFiles(host({ release: WSL_RELEASE, run }))

    await Promise.all([
      clipboard?.write([
        { name: 'a1', bytes: Buffer.from('') },
        { name: 'a2', bytes: Buffer.from('') },
      ]),
      clipboard?.write([
        { name: 'b1', bytes: Buffer.from('') },
        { name: 'b2', bytes: Buffer.from('') },
      ]),
    ])

    expect(filesFound).toEqual([true, true])
    expect(steps).toEqual([
      'temp path',
      'wslpath',
      'Set-Clipboard',
      'temp path',
      'wslpath',
      'Set-Clipboard',
    ])
  })

  it('still runs a copy queued behind one that failed', async () => {
    const { run, steps } = windows()
    let calls = 0
    const failingFirst = async (command: string, args: string[]) => {
      calls += 1
      if (calls === 1) throw new Error('powershell.exe exited 1')
      return run(command, args)
    }
    const clipboard = clipboardFiles(
      host({ release: WSL_RELEASE, run: failingFirst }),
    )

    const first = clipboard?.write([{ name: 'a', bytes: Buffer.from('') }])
    const second = clipboard?.write([{ name: 'b', bytes: Buffer.from('') }])

    await expect(first).rejects.toThrow('powershell.exe exited 1')
    await expect(second).resolves.toBeUndefined()
    expect(steps).toEqual(['temp path', 'wslpath', 'Set-Clipboard'])
  })
})
