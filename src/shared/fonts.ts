/** The folder under a project's `assets/` holding each font it installed, one folder per family. */
export const FONTS_FOLDER = 'fonts'

/** The sheet the server builds of a project's installed fonts, beside its token sheet's address. */
export const FONT_SHEET = 'fonts.css'

/** The source's own license text in an installed font's folder. */
export const FONT_LICENSE_TEXT = 'LICENSE.txt'

/** The licenses a font installs under, as Fontsource names them. */
export const FONT_LICENSES = ['OFL-1.1', 'Apache-2.0', 'UFL-1.0'] as const

export type FontLicense = (typeof FONT_LICENSES)[number]

/** The categories a search filters by, Fontsource's own less its icon sets and uncategorized fonts. */
export const FONT_CATEGORIES = [
  'serif',
  'sans-serif',
  'monospace',
  'display',
  'handwriting',
] as const

export type FontCategory = (typeof FONT_CATEGORIES)[number]
