export interface FrameSize {
  width: number
  height: number
}

/** The current iPhone, iPad Air portrait, and a common laptop viewport. */
export const FRAME_SIZES = {
  phone: { width: 390, height: 844 },
  tablet: { width: 834, height: 1194 },
  desktop: { width: 1440, height: 900 },
} as const satisfies Record<string, FrameSize>

export type FrameSizePreset = keyof typeof FRAME_SIZES

export const DEFAULT_FRAME_SIZE: FrameSizePreset = 'desktop'

/** The gap between a frame and the one placed beside it. */
export const FRAME_GAP = 80

export function isFrameSizePreset(value: string): value is FrameSizePreset {
  return Object.hasOwn(FRAME_SIZES, value)
}
