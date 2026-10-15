import type { CaptureCase } from './types'

/**
 * The board shell at `/`. Theme switching arrives with the chrome look, so the
 * surface captures the light theme alone until then.
 */
export const BOARD_CASES: CaptureCase[] = [
  {
    section: 'board',
    theme: 'light',
    route: '/',
    evidence: true,
  },
]
