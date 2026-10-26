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

export interface DeviceSize extends FrameSize {
  name: string
  label: string
  /** The preset heading the device's group in the Frame tool's list. */
  group: FrameSizePreset
}

/**
 * The devices the Frame tool and `--size` offer beside the three presets.
 * The iPad Pro 11 and a 1440 desktop are the tablet and desktop presets, so
 * neither repeats here.
 */
export const DEVICE_SIZES = [
  {
    name: 'small-phone',
    label: 'Small phone',
    group: 'phone',
    width: 375,
    height: 667,
  },
  {
    name: 'iphone-16',
    label: 'iPhone 16',
    group: 'phone',
    width: 393,
    height: 852,
  },
  {
    name: 'android',
    label: 'Android',
    group: 'phone',
    width: 412,
    height: 917,
  },
  {
    name: 'iphone-16-pro-max',
    label: 'iPhone 16 Pro Max',
    group: 'phone',
    width: 440,
    height: 956,
  },
  {
    name: 'ipad-mini',
    label: 'iPad mini',
    group: 'tablet',
    width: 744,
    height: 1133,
  },
  {
    name: 'ipad-pro-12-9',
    label: 'iPad Pro 12.9',
    group: 'tablet',
    width: 1024,
    height: 1366,
  },
  {
    name: 'macbook-air',
    label: 'MacBook Air',
    group: 'desktop',
    width: 1280,
    height: 832,
  },
  {
    name: 'full-hd',
    label: 'Full HD',
    group: 'desktop',
    width: 1920,
    height: 1080,
  },
] as const satisfies readonly DeviceSize[]

/** A size taken by name, being a preset or a device. */
export type FrameSizeName =
  | FrameSizePreset
  | (typeof DEVICE_SIZES)[number]['name']

/** Every size name, the three presets first, then the devices. */
export const FRAME_SIZE_NAMES: readonly [FrameSizeName, ...FrameSizeName[]] = [
  'phone',
  'tablet',
  'desktop',
  ...DEVICE_SIZES.map((device) => device.name),
]

export const DEFAULT_FRAME_SIZE: FrameSizePreset = 'desktop'

/** The gap between a frame and the one placed beside it. */
export const FRAME_GAP = 80

export function isFrameSizePreset(value: string): value is FrameSizePreset {
  return Object.hasOwn(FRAME_SIZES, value)
}

/** The width and height a size name stands for. */
export function frameSizeOf(name: FrameSizeName): FrameSize {
  const { width, height } = isFrameSizePreset(name)
    ? FRAME_SIZES[name]
    : (DEVICE_SIZES.find((device) => device.name === name) ??
      FRAME_SIZES[DEFAULT_FRAME_SIZE])
  return { width, height }
}
