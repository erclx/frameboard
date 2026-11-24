import type { FontLicenseFile } from '../../src/shared/records/sourcing'

/** The record of an installed variable serif holding one latin file. */
export function installedLicense(
  id: string,
  family: string,
  file = `${id}-latin-wght-normal.woff2`,
): FontLicenseFile {
  return {
    version: 1,
    origin: 'found',
    source: 'fontsource',
    id,
    query: null,
    family,
    category: 'serif',
    license: 'OFL-1.1',
    licenseUrl: 'https://openfontlicense.org/open-font-license-official-text/',
    licenseFile: 'LICENSE.txt',
    landingUrl: `https://fontsource.org/fonts/${id}`,
    url: `https://cdn.jsdelivr.net/npm/@fontsource-variable/${id}@5.3.0/`,
    variable: true,
    faces: [
      {
        file,
        style: 'normal',
        weights: { min: 400, max: 700 },
        unicodeRange: 'U+0000-00FF',
      },
    ],
    savedAt: '2026-11-24T12:00:00.000Z',
  }
}

/** The files of an installed font, by their paths in a board, for `writeBoard`. */
export function installedFontFiles(
  project: string,
  id: string,
  family: string,
): Record<string, string> {
  const folder = `${project}/assets/fonts/${id}`
  const record = installedLicense(id, family)
  return {
    [`${folder}/font.license.json`]: JSON.stringify(record),
    [`${folder}/LICENSE.txt`]: `Copyright The ${family} Project Authors\n`,
    [`${folder}/${record.faces[0]?.file}`]: 'woff2',
  }
}
