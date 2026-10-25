import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import { FACES } from '@/shared/faces'

const require = createRequire(import.meta.url)

/**
 * Copies each face every frame imports from its package into `outDir`,
 * replacing what was there. The faces fill a sibling folder first and rename
 * into place, so `outDir` holds every file or does not exist, and an
 * interrupted write leaves no half-filled face behind. Each sheet is
 * rewritten to declare the plain family a frame names, such as Geist, rather
 * than the package's own, such as Geist Variable.
 */
export function writeFaces(outDir: string): void {
  const staging = `${outDir}.${process.pid}.tmp`
  rmSync(staging, { recursive: true, force: true })
  try {
    for (const face of FACES) {
      const from = dirname(require.resolve(`${face.package}/package.json`))
      const to = join(staging, face.folder)
      mkdirSync(join(to, 'files'), { recursive: true })

      const sheet = readFileSync(join(from, 'index.css'), 'utf8')
      writeFileSync(
        join(to, 'index.css'),
        sheet.replaceAll(`'${face.packageFamily}'`, `'${face.family}'`),
      )
      copyFileSync(join(from, 'LICENSE'), join(to, 'LICENSE'))
      for (const file of readdirSync(join(from, 'files'))) {
        if (file.endsWith('.woff2')) {
          copyFileSync(join(from, 'files', file), join(to, 'files', file))
        }
      }
    }
    rmSync(outDir, { recursive: true, force: true })
    mkdirSync(dirname(outDir), { recursive: true })
    renameSync(staging, outDir)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}
