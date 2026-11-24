import { existsSync } from 'node:fs'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { FONT_RECORD } from '@/server/fonts/installed'
import { ASSETS_FOLDER } from '@/shared/board-files'
import { FONT_LICENSE_TEXT, FONTS_FOLDER } from '@/shared/fonts'
import type { FontLicenseFile } from '@/shared/records/sourcing'

/** The picked design's own Lora file, tracked beside its reference, so the seed needs no network. */
const LORA_FILE = join(
  import.meta.dirname,
  '../../../canon/design/assets/groundwork-61/fonts/lora.woff2',
)

/**
 * Installs Lora into webapp as `font find --save` leaves a family, so the
 * Theme tab lists it, the family picker offers it, and Remove has a font.
 */
export async function lay(root: string): Promise<'laid' | 'kept'> {
  const folder = join(root, 'webapp', ASSETS_FOLDER, FONTS_FOLDER, 'lora')
  if (existsSync(folder)) return 'kept'
  await mkdir(folder, { recursive: true })
  const record: FontLicenseFile = {
    version: 1,
    origin: 'found',
    source: 'fontsource',
    id: 'lora',
    query: 'lora',
    family: 'Lora',
    category: 'serif',
    license: 'OFL-1.1',
    licenseUrl: 'https://fontsource.org/fonts/lora',
    licenseFile: FONT_LICENSE_TEXT,
    landingUrl: 'https://fontsource.org/fonts/lora',
    url: 'https://www.npmjs.com/package/@fontsource-variable/lora',
    variable: true,
    faces: [
      {
        file: 'lora.woff2',
        style: 'normal',
        weights: { min: 400, max: 700 },
        unicodeRange: null,
      },
    ],
    savedAt: '2026-01-01T00:00:00.000Z',
  }
  await copyFile(LORA_FILE, join(folder, 'lora.woff2'))
  await writeFile(join(folder, FONT_RECORD), `${JSON.stringify(record)}\n`)
  await writeFile(
    join(folder, FONT_LICENSE_TEXT),
    'SIL Open Font License, Version 1.1\n',
  )
  return 'laid'
}
