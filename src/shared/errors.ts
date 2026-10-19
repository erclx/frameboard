/**
 * Every error code and the exit it maps to. A later row appends a code and
 * never reuses a number for another meaning.
 */
export const EXIT_CODES = {
  internal: 1,
  usage: 2,
  'invalid-name': 2,
  'project-required': 2,
  'session-required': 2,
  'board-not-found': 3,
  'project-not-found': 3,
  'page-not-found': 3,
  'frame-not-found': 3,
  'server-not-running': 3,
  'tokens-not-found': 3,
  'note-not-found': 3,
  'name-taken': 4,
  'layout-invalid': 5,
  'project-file-invalid': 5,
  'notes-invalid': 5,
  'lock-timeout': 6,
  // `edit` refusals, each leaving the frame file as it was.
  'invalid-edit': 7,
  'invalid-address': 7,
  'address-mismatch': 7,
  'open-quote': 7,
  'not-text-only': 7,
  'verify-failed': 7,
  'invalid-utf8': 7,
  'stale-address': 7,
  // `check` finding anything, with the result in the error's details.
  'check-findings': 8,
  // No capture browser launched, with the install command in the message.
  'browser-not-found': 9,
  // A render that ran and refused what it found, writing nothing.
  'font-missing': 10,
  'fit-unbounded': 10,
  'capture-too-large': 10,
  // A hand move or resize refused, writing nothing.
  'frame-locked': 11,
  'stale-layout': 11,
  // A drop into `assets/` that left a file out, or went over the body limit.
  'asset-type-refused': 2,
  'asset-too-large': 2,
  // An undo or redo refused, writing nothing.
  'undo-overtaken': 12,
  'nothing-to-undo': 12,
} as const

export type ErrorCode = keyof typeof EXIT_CODES

export type ErrorDetails = Record<string, unknown>

export class FrameboardError extends Error {
  readonly code: ErrorCode
  readonly details: ErrorDetails

  constructor(
    code: ErrorCode,
    message: string,
    details: ErrorDetails = {},
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'FrameboardError'
    this.code = code
    this.details = details
  }

  get exitCode(): number {
    return EXIT_CODES[this.code]
  }
}
