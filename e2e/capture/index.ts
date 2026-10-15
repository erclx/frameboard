import { BOARD_CASES } from './board'
import type { CaptureCase } from './types'

/** Where flagged cases write the committed baseline that `canon pr evidence` compares. */
export const EVIDENCE_ROOT = 'e2e/evidence'

/** Every surface's cases. A new surface adds its own file here and one spread below. */
export const CAPTURE_CASES: CaptureCase[] = [...BOARD_CASES]
