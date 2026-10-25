import { type LucideIcon, Monitor, Smartphone, Tablet } from 'lucide-react'

import type { FrameSizePreset } from '@/shared/frame-sizes'

/** The frame sizes by name and icon, which the Frame tool places and a preview shows a frame at. */
export const PRESETS: readonly {
  preset: FrameSizePreset
  label: string
  icon: LucideIcon
}[] = [
  { preset: 'phone', label: 'Phone', icon: Smartphone },
  { preset: 'tablet', label: 'Tablet', icon: Tablet },
  { preset: 'desktop', label: 'Desktop', icon: Monitor },
]
