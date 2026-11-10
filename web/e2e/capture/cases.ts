import type { CaptureCase, CaptureSection } from '../capture-types'

/** Where a case flagged `evidence: true` writes its committed frames. */
export const EVIDENCE_ROOT = 'e2e/evidence'

/**
 * The landing page's own beats, top to bottom. Every entry is a section a
 * reviewer reads on its own, so a diff lands on the part that moved rather
 * than on one image of the whole page.
 */
const HOME_SECTIONS: CaptureSection[] = [
  { name: 'hero', selector: '#hero' },
  { name: 'walkthrough', selector: '#walkthrough' },
  { name: 'agent', selector: '#agent' },
  { name: 'close', selector: '#close' },
]

export const CASES: CaptureCase[] = [
  {
    section: 'home',
    theme: 'default',
    route: '/',
    evidence: true,
    sections: HOME_SECTIONS,
  },
  {
    section: 'home',
    theme: 'dark',
    route: '/',
    sections: HOME_SECTIONS,
    setup: (page) => page.emulateMedia({ colorScheme: 'dark' }),
  },
  {
    section: 'dark-hero',
    theme: 'dark',
    route: '/',
    evidence: true,
    excludeViewports: ['320', '768', '1536'],
    sections: HOME_SECTIONS,
    setup: (page) => page.emulateMedia({ colorScheme: 'dark' }),
  },
]
