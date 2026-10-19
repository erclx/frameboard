// Copies each face every frame imports from its package into dist/faces/, so
// the published package serves them and nothing reaches node_modules at
// runtime. Each sheet is rewritten to declare the plain family a frame names,
// such as Geist, rather than the package's own, such as Geist Variable.
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { FACES } from '../src/shared/faces'

const require = createRequire(import.meta.url)
const out = fileURLToPath(new URL('../dist/faces', import.meta.url))

rmSync(out, { recursive: true, force: true })
for (const face of FACES) {
  const from = dirname(require.resolve(`${face.package}/package.json`))
  const to = join(out, face.folder)
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
console.log(`Copied ${FACES.length} faces into ${out}`)
