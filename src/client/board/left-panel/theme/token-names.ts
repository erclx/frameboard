import type { TokenRow } from '@/shared/records/tokens'

/** How the dialog titles each group, and names what a sheet setting none of it lacks. */
export const TOKEN_TITLES: Record<
  TokenRow['group'],
  { title: string; none: string }
> = {
  color: { title: 'Colors', none: 'colors' },
  radius: { title: 'Radius', none: 'radius tokens' },
  font: { title: 'Font tokens', none: 'font tokens' },
  other: { title: 'Other', none: 'other tokens' },
}

/** The last segment of a sheet path, which names the file where the full path would crowd a line. */
export function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}
