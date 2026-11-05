import { Frame, Hand, MousePointer2, PanelTop } from 'lucide-react'

export const FRAME_SLOT = 'tool.frame'
export const SECTION_TOOL = 'tool.section'
export const MOVE_SLOT = 'tool.move'
export const HAND_TOOL = 'tool.hand'

/** The tools the Move slot's caret lists, Move and Hand both pointing rather than drawing. */
export const POINTER_TOOLS = [
  { id: MOVE_SLOT, label: 'Move', key: 'v', icon: MousePointer2 },
  { id: HAND_TOOL, label: 'Hand', key: 'h', icon: Hand },
] as const

/** The tools the Frame slot's caret lists, Frame and Section both drawing a box on the page. */
export const BOX_TOOLS = [
  { tool: 'frame', id: FRAME_SLOT, label: 'Frame', key: 'f', icon: Frame },
  {
    tool: 'section',
    id: SECTION_TOOL,
    label: 'Section',
    key: 'Shift+KeyS',
    icon: PanelTop,
  },
] as const
