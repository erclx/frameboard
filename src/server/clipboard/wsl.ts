import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { ClipboardFile, ClipboardFiles, RunCommand } from './files'

/** The folder under Windows' temp folder each copy writes into. */
const CLIP_FOLDER = 'frameboard-clip'

/** Characters a Windows file name cannot hold. */
const WINDOWS_RESERVED = /[<>:"/\\|?*]/g

/**
 * The Windows clipboard reached from WSL. The images land in Windows' temp
 * folder, since a file drop list names Windows paths and a pasting app reads
 * the files after the copy returns. Each copy clears the last one's folder,
 * the only time a pasted list is known to be done with. Copies run one at a
 * time, since a copy clearing the folder while another is still setting the
 * clipboard deletes the files that copy is about to name.
 */
export function wslClipboard(run: RunCommand): ClipboardFiles {
  // Settles when the last copy does, either way, so it never rejects.
  let previous: Promise<void> = Promise.resolve()
  return {
    backend: 'wsl',
    write: (files) => {
      const copy = previous.then(() => writeCopy(run, files))
      previous = copy.catch(() => undefined)
      return copy
    },
  }
}

/** Writes one copy's images into a fresh folder and sets them on the clipboard. */
async function writeCopy(
  run: RunCommand,
  files: ClipboardFile[],
): Promise<void> {
  const temp = (
    await run('powershell.exe', [
      '-NoProfile',
      '-Command',
      '[IO.Path]::GetTempPath()',
    ])
  ).trim()
  const windowsDir = `${temp.replace(/\\$/, '')}\\${CLIP_FOLDER}\\${randomUUID()}`
  const linuxDir = (await run('wslpath', [windowsDir])).trim()
  await rm(join(linuxDir, '..'), { recursive: true, force: true })
  await mkdir(linuxDir, { recursive: true })

  const names = fileNames(files)
  await Promise.all(
    files.map((file, index) =>
      writeFile(join(linuxDir, names[index] ?? ''), file.bytes),
    ),
  )
  await run('powershell.exe', [
    '-NoProfile',
    '-STA',
    '-Command',
    `Set-Clipboard -Path ${pathList(windowsDir, names)}`,
  ])
}

/** Each file's name made safe for Windows and unique in the folder, as `hero.png`, `hero-2.png`. */
export function fileNames(files: readonly ClipboardFile[]): string[] {
  const taken = new Set<string>()
  return files.map(({ name }) => {
    const base = name.replace(WINDOWS_RESERVED, '-').trim() || 'frame'
    let candidate = `${base}.png`
    for (let n = 2; taken.has(candidate.toLowerCase()); n++) {
      candidate = `${base}-${n}.png`
    }
    taken.add(candidate.toLowerCase())
    return candidate
  })
}

/** The PowerShell argument naming every file, each single-quoted with its quotes doubled. */
export function pathList(windowsDir: string, names: readonly string[]): string {
  return names
    .map((name) => `'${`${windowsDir}\\${name}`.replaceAll("'", "''")}'`)
    .join(',')
}
