import {
  type LucideIcon,
  Monitor,
  Presentation,
  Smartphone,
  Tablet,
} from 'lucide-react'

import {
  DEVICE_SIZES,
  FRAME_SIZES,
  type FrameSizeGroup,
  type FrameSizeName,
  type FrameSizePreset,
} from '@/shared/frame-sizes'

/** The frame sizes by name and icon, which a preview shows a frame at and the new-board guide offers. */
export const PRESETS: readonly {
  preset: FrameSizePreset
  label: string
  icon: LucideIcon
}[] = [
  { preset: 'phone', label: 'Phone', icon: Smartphone },
  { preset: 'tablet', label: 'Tablet', icon: Tablet },
  { preset: 'desktop', label: 'Desktop', icon: Monitor },
]

export interface SizeRow {
  name: FrameSizeName
  label: string
  width: number
  height: number
}

export interface SizeGroup {
  group: FrameSizeGroup
  label: string
  icon: LucideIcon
  rows: readonly SizeRow[]
}

/**
 * The Frame tool's list, one group per preset holding the preset and the
 * devices in its group, then the slides, each group narrowest first.
 */
export const FRAME_TOOL_GROUPS: readonly SizeGroup[] = (
  [
    ...PRESETS.map(({ preset, label, icon }) => ({
      group: preset,
      label,
      icon,
      rows: [
        { name: preset, label, ...FRAME_SIZES[preset] },
        ...devicesIn(preset),
      ],
    })),
    {
      group: 'slide',
      label: 'Slide',
      icon: Presentation,
      rows: devicesIn('slide'),
    },
  ] satisfies SizeGroup[]
).map((group) => ({
  ...group,
  rows: group.rows.toSorted((a, b) => a.width - b.width),
}))

function devicesIn(group: FrameSizeGroup): SizeRow[] {
  return DEVICE_SIZES.filter((device) => device.group === group)
}
