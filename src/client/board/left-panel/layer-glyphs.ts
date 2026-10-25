import { createLucideIcon, Image, type LucideIcon, Type } from 'lucide-react'

import type { TreeElement } from '@/shared/records/elements'

/** Figma's auto-layout bars, as `glyphs-a` on `proposals/left-panel-glyphs` draws them. */
export const LayoutRowGlyph = createLucideIcon('layout-row-glyph', [
  ['rect', { x: '4', y: '5', width: '4', height: '14', rx: '1', key: 'a' }],
  ['rect', { x: '10', y: '5', width: '4', height: '14', rx: '1', key: 'b' }],
  ['rect', { x: '16', y: '5', width: '4', height: '9', rx: '1', key: 'c' }],
])

export const LayoutColumnGlyph = createLucideIcon('layout-column-glyph', [
  ['rect', { x: '5', y: '4', width: '14', height: '4', rx: '1', key: 'a' }],
  ['rect', { x: '5', y: '10', width: '14', height: '4', rx: '1', key: 'b' }],
  ['rect', { x: '5', y: '16', width: '9', height: '4', rx: '1', key: 'c' }],
])

export const GridGlyph = createLucideIcon('grid-glyph', [
  ['rect', { x: '4', y: '4', width: '7', height: '7', rx: '1', key: 'a' }],
  ['rect', { x: '13', y: '4', width: '7', height: '7', rx: '1', key: 'b' }],
  ['rect', { x: '4', y: '13', width: '7', height: '7', rx: '1', key: 'c' }],
  ['rect', { x: '13', y: '13', width: '7', height: '7', rx: '1', key: 'd' }],
])

/** Wider than tall, so a plain box never reads as a checkbox. */
export const BlockGlyph = createLucideIcon('block-glyph', [
  ['rect', { x: '5', y: '7', width: '14', height: '10', rx: '1', key: 'a' }],
])

const LAYOUT_GLYPHS: Record<TreeElement['layout'], LucideIcon> = {
  row: LayoutRowGlyph,
  column: LayoutColumnGlyph,
  grid: GridGlyph,
  block: BlockGlyph,
}

/** The glyph a Layers row draws for an element: text, then media, then its layout. */
export function elementGlyph(element: TreeElement): LucideIcon {
  if (element.textOnly) return Type
  if (element.tag === 'img' || element.tag === 'video') return Image
  return LAYOUT_GLYPHS[element.layout]
}
