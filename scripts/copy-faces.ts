// Copies each face every frame imports from its package into dist/faces/, so
// the published package serves them and nothing reaches node_modules at
// runtime.
import { fileURLToPath } from 'node:url'

import { writeFaces } from '../src/server/look/write-faces'
import { FACES } from '../src/shared/faces'

const out = fileURLToPath(new URL('../dist/faces', import.meta.url))

writeFaces(out)
console.log(`Copied ${FACES.length} faces into ${out}`)
