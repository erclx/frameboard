import {
  Frame,
  Hand,
  Image as ImageIcon,
  type LucideIcon,
  Maximize,
  MessageSquare,
  Moon,
  MousePointer2,
  PanelTop,
  Pencil,
  Play,
  Redo2,
  Sun,
  Type,
  Undo2,
} from 'lucide-react'

import { IMAGE_TOOL, type Placing } from '../place/tool'

/**
 * A toolbar place and what it shows before its action registers. A row
 * registering the action supplies its own label and keys, which win.
 */
export interface Slot {
  id: string
  label: string
  keys?: readonly string[]
  icon: LucideIcon
  /** Drawn in dark in place of `icon`, as the theme toggle shows the moon. */
  darkIcon?: LucideIcon
}

export const HAND_TOOL = 'tool.hand'
export const SECTION_TOOL = 'tool.section'

/** The tools the Move slot's caret lists, Move and Hand both pointing rather than drawing. */
export const POINTER_TOOLS = [
  { id: 'tool.move', label: 'Move', key: 'v', icon: MousePointer2 },
  { id: HAND_TOOL, label: 'Hand', key: 'h', icon: Hand },
] as const

/** The tools the Frame slot's caret lists, Frame and Section both drawing a box on the page. */
export const BOX_TOOLS = [
  { tool: 'frame', id: 'tool.frame', label: 'Frame', key: 'f', icon: Frame },
  {
    tool: 'section',
    id: SECTION_TOOL,
    label: 'Section',
    key: 'Shift+KeyS',
    icon: PanelTop,
  },
] as const

export const TEXT_TOOL = {
  id: 'tool.text',
  label: 'Text',
  key: 't',
  icon: Type,
}

export const NOTE_TOOL = {
  id: 'tool.note',
  label: 'Note',
  key: 'n',
  icon: MessageSquare,
}

export const IMAGE_ROW = {
  id: IMAGE_TOOL,
  label: 'Image or video',
  key: '$mod+Shift+KeyK',
  icon: ImageIcon,
}

/** The Place toggle's choices, each named in its tooltip by where a new element lands. */
export const PLACINGS: readonly {
  value: Placing
  label: string
  tip: string
}[] = [
  {
    value: 'auto',
    label: 'Auto',
    tip: 'Place where drawn, or in the flow of a flex or grid',
  },
  { value: 'flow', label: 'Flow', tip: 'Place in the flow' },
  { value: 'free', label: 'Free', tip: 'Place where drawn' },
]

/** The groups More takes first, in the order the full bar draws them. */
export const EDIT_AND_VIEW: readonly (readonly Slot[])[] = [
  [
    { id: 'edit.undo', label: 'Undo', icon: Undo2 },
    { id: 'edit.redo', label: 'Redo', icon: Redo2 },
  ],
  [
    {
      id: 'view.zoomToFit',
      label: 'Zoom to fit',
      keys: ['Shift+Digit1'],
      icon: Maximize,
    },
    { id: 'theme.toggle', label: 'Theme', icon: Sun, darkIcon: Moon },
  ],
]

export const MODES: readonly Slot[] = [
  { id: 'mode.edit', label: 'Edit', icon: Pencil },
  { id: 'mode.play', label: 'Play', icon: Play },
]

/** The one key flipping between the two modes, which both halves of the segment name. */
export const MODE_TOGGLE = 'mode.toggle'
