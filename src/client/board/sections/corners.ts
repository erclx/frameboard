/** The corners a selected section's box resizes from, by the gesture's name for each. */
export const SECTION_CORNERS = ['nw', 'ne', 'sw', 'se'] as const

export type SectionCorner = (typeof SECTION_CORNERS)[number]
