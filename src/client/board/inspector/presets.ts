import { type LucideIcon, Monitor, Smartphone, Tablet } from 'lucide-react'

import {
  DEVICE_SIZES,
  FRAME_SIZES,
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

/**
 * The Frame tool's list, one group per preset, each holding the preset and
 * the devices in its group, narrowest first.
 */
export const FRAME_TOOL_GROUPS: readonly {
  preset: FrameSizePreset
  label: string
  icon: LucideIcon
  rows: readonly SizeRow[]
}[] = PRESETS.map(({ preset, label, icon }) => ({
  preset,
  label,
  icon,
  rows: [
    { name: preset, label, ...FRAME_SIZES[preset] },
    ...DEVICE_SIZES.filter((device) => device.group === preset),
  ].toSorted((a, b) => a.width - b.width),
}))
