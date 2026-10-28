import { cn } from 'cn'
import { ChevronDown, ChevronRight, PanelTop } from 'lucide-react'
import type { ReactNode } from 'react'

import { RenameField } from '@/client/components/rename-field'
import type { Structure } from '@/client/live/structure'
import type { SectionRecord } from '@/shared/records/list'

import { SectionRowMenu } from '../menus/layers'
import { modeStore } from '../mode'
import {
  startSectionRename,
  stopSectionRename,
  useRenamingSection,
} from '../sections/actions'
import { selectionStore, selectSection } from '../selection'
import { canvasView } from '../view'
import { reportRefusal } from './page-actions'

interface SectionRowProps {
  section: SectionRecord
  page: string
  open: boolean
  onToggle: () => void
  selected: boolean
  canWrite: boolean
  calls: Structure
  /** Its frames' rows, top of the stack first, shown while open. */
  children: ReactNode
}

/**
 * A section's row in Layers, holding its frames' rows indented under it, as
 * `canon/design/canvas/sections` draws it in Layers: a chevron, the section glyph, the
 * name, and how many frames it holds. A click selects the section and shows
 * its box, and a double-click or F2 renames it in place.
 */
export function SectionRow({
  section,
  page,
  open,
  onToggle,
  selected,
  canWrite,
  calls,
  children,
}: SectionRowProps) {
  const renaming = useRenamingSection() === section.name
  const count = section.frames.length
  const icon = (
    <PanelTop
      aria-hidden
      className="size-[13px] shrink-0 text-muted-foreground"
    />
  )
  return (
    <li aria-label={`Section ${section.name}`} className="flex flex-col">
      <div className="mx-1.5 overflow-hidden rounded-md">
        <SectionRowMenu
          section={section}
          page={page}
          trigger={
            <div
              className={cn(
                'group flex h-[26px] items-center gap-1.5 pr-1 pl-2 text-foreground',
                selected ? 'bg-primary/26' : 'hover:bg-accent',
              )}
            >
              <button
                type="button"
                aria-label={`${open ? 'Hide' : 'Show'} the frames of ${section.name}`}
                aria-expanded={open}
                onClick={onToggle}
                className="-mr-1.5 -ml-[7px] grid size-6 shrink-0 place-items-center text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {open ? (
                  <ChevronDown aria-hidden className="size-2.5" />
                ) : (
                  <ChevronRight aria-hidden className="size-2.5" />
                )}
              </button>
              {renaming ? (
                <>
                  {icon}
                  <span className="flex min-w-0 flex-1">
                    <RenameField
                      hug
                      name={section.name}
                      label={`Rename section ${section.name}`}
                      onCommit={(name) => {
                        stopSectionRename()
                        if (name === section.name) return
                        calls
                          .renameSection(page, section.name, name)
                          .then((renamed) =>
                            selectSection(selectionStore, page, renamed.name),
                          )
                          .catch(
                            reportRefusal(`Couldn't rename ${section.name}`),
                          )
                      }}
                      onCancel={stopSectionRename}
                    />
                  </span>
                </>
              ) : (
                <button
                  type="button"
                  aria-label={`Select section ${section.name}`}
                  onClick={() => {
                    if (modeStore.getState().mode !== 'edit') return
                    selectSection(selectionStore, page, section.name)
                    canvasView.reveal(section.box)
                  }}
                  onDoubleClick={() => {
                    if (canWrite) startSectionRename(section.name)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'F2' || !canWrite) return
                    event.preventDefault()
                    event.stopPropagation()
                    startSectionRename(section.name)
                  }}
                  className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-[5px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
                >
                  {icon}
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {section.name}
                  </span>
                  <span
                    aria-label={`${count} frame${count === 1 ? '' : 's'}`}
                    className="shrink-0 pr-1.5 text-[color-mix(in_srgb,var(--muted-foreground)_70%,var(--foreground))] tabular-nums"
                  >
                    {count}
                  </span>
                </button>
              )}
            </div>
          }
        />
      </div>
      {open && count > 0 ? (
        <ul
          aria-label={`Frames of ${section.name}`}
          className="flex flex-col pl-3.5"
        >
          {children}
        </ul>
      ) : null}
    </li>
  )
}
