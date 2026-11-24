/** One rule for project, page, and frame names, matching v01.3's naming check. */
export const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export const NAME_MAX_LENGTH = 64

/** The longest title a project takes, which its folder name is cut from. */
export const TITLE_MAX_LENGTH = 256

/** Names a page may not take, since the folder means something else in a project. */
export const RESERVED_PAGE_NAMES = ['assets'] as const

export function isValidName(name: string): boolean {
  return name.length <= NAME_MAX_LENGTH && NAME_PATTERN.test(name)
}

export function isReservedPageName(name: string): boolean {
  return RESERVED_PAGE_NAMES.some((reserved) => namesCollide(reserved, name))
}

/** Case-insensitive, since the default macOS volume is. */
export function namesCollide(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/** `base` when free, else the first free `base-2`, `base-3`, and onward. */
export function nextFreeName(base: string, taken: Iterable<string>): string {
  const lowered = new Set([...taken].map((name) => name.toLowerCase()))
  if (!lowered.has(base.toLowerCase())) return base
  for (let suffix = 2; ; suffix++) {
    const candidate = `${base}-${suffix}`
    if (!lowered.has(candidate.toLowerCase())) return candidate
  }
}

/**
 * The folder a retitled project lands in, cut back near the length limit so
 * the folder always stays a valid name.
 */
export function titledFolder(
  current: string,
  title: string,
  taken: Iterable<string>,
): string {
  const folder = folderName(title)
  if (folder === '' || namesCollide(folder, current)) return current
  const others = [...taken].filter((name) => name !== current)
  for (let cut = folder.length; cut > 0; cut--) {
    const base = folder.slice(0, cut).replace(/-+$/, '')
    const free = nextFreeName(base, others)
    if (base !== '' && free.length <= NAME_MAX_LENGTH) return free
  }
  return current
}

/**
 * A typed title as the folder it names, marked letters folded to base ones and
 * each run a name may not hold made one dash, so `Đà Nẵng` becomes `da-nang`.
 * Empty when nothing is left. `đ` is mapped, since no decomposition reaches it.
 */
export function folderName(typed: string): string {
  return typed
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+/, '')
    .slice(0, NAME_MAX_LENGTH)
    .replace(/-+$/, '')
}
