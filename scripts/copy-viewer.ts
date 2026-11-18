// Copies the pinned model viewer build into dist/viewer/, beside the bundle,
// which copies it into a project's assets with the first model placed there.
import { copyFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { shippedViewerPath } from '../src/server/models/viewer'
import { VIEWER_FILE } from '../src/shared/model-viewer'

const from = shippedViewerPath()
const out = fileURLToPath(new URL('../dist/viewer', import.meta.url))

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
copyFileSync(from, join(out, VIEWER_FILE))
copyFileSync(join(dirname(from), '..', 'LICENSE'), join(out, 'LICENSE'))
console.log(`Copied the model viewer into ${out}`)
