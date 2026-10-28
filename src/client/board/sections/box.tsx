import { cn } from 'cn'

import { useSelection } from '@/client/board/selection'
import type { SectionRecord } from '@/shared/records/list'

import { SECTION_CORNERS, type SectionCorner } from './corners'

const CORNER_PLACE: Record<SectionCorner, string> = {
  nw: 'top-0 left-0',
  ne: 'top-0 right-0',
  sw: 'bottom-0 left-0',
  se: 'right-0 bottom-0',
}

/**
 * Each section's box on the canvas, drawn under every frame, as
 * `canon/design/canvas/sections` holds it: a faint plate with its name inside
 * the top left at the labels' constant screen size. The name is the box's one
 * handle, which the gestures find by `data-section-label`, so a press on the
 * empty plate reaches the canvas as a press on bare canvas does.
 */
export function SectionBoxes({
  page,
  sections,
}: {
  page: string
  sections: readonly SectionRecord[]
}) {
  const selected = useSelection((state) =>
    state.page === page ? state.section : undefined,
  )
  return sections.map((section) => (
    <SectionBox
      key={section.name}
      section={section}
      selected={section.name === selected}
    />
  ))
}

function SectionBox({
  section,
  selected,
}: {
  section: SectionRecord
  selected: boolean
}) {
  const { x, y, width, height } = section.box
  return (
    <div
      data-section={section.name}
      data-selected={selected || undefined}
      className={cn(
        'pointer-events-none absolute rounded-[calc(10px/var(--zoom,1))] bg-foreground/5',
        selected &&
          'outline-solid outline-primary [outline-width:calc(1.5px/var(--zoom,1))]',
      )}
      style={{ left: x, top: y, width, height }}
    >
      <div
        data-section-label={section.name}
        className={cn(
          'absolute top-0 left-0 origin-top-left truncate px-3 pt-2 text-body font-medium [transform:scale(calc(1/var(--zoom,1)))]',
          selected ? 'text-foreground' : 'text-muted-foreground',
        )}
        style={{ maxWidth: `calc(${width}px * var(--zoom, 1))` }}
        title={section.name}
      >
        {section.name}
      </div>
      {selected
        ? SECTION_CORNERS.map((corner) => (
            <div
              key={corner}
              data-section-corner={corner}
              className={cn(
                'absolute size-[7px] border-[1.5px] border-primary bg-background [transform:translate(var(--hx),var(--hy))_scale(calc(1/var(--zoom,1)))]',
                CORNER_PLACE[corner],
                corner.startsWith('n') ? '[--hy:-50%]' : '[--hy:50%]',
                corner.endsWith('w') ? '[--hx:-50%]' : '[--hx:50%]',
              )}
            />
          ))
        : null}
    </div>
  )
}
