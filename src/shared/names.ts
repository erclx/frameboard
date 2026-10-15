/** One rule for project, page, and frame names, matching v01.3's naming check. */
export const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export const NAME_MAX_LENGTH = 64

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
