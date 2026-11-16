/**
 * The names a design kit is laid out by. A kit is a folder of plain files:
 * `kit.json` naming it, `tokens.css` with a light and a dark block, `kit.css`
 * of component and stroke styles, `kit.md` telling an agent what to reach
 * for, and a `kit` page of sample frames. Installed in a project, the tokens
 * become its `tokens.css`, the page its `kit` page, and the rest sits under
 * `assets/kit/`, which the frame route imports after the token sheets.
 */
export const KIT_FILE = 'kit.json'
export const KIT_SHEET = 'kit.css'
export const KIT_NOTE = 'kit.md'
/** The sample page's folder in a kit, and the page it installs as. */
export const KIT_PAGE = 'kit'
/** The folder under a project's `assets/` an installed kit's files sit in. */
export const KIT_ASSETS = 'kit'
/** The dot folder in a board holding the kits saved from its projects, which home never lists as a project. */
export const KITS_FOLDER = '.kits'
