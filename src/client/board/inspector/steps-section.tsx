import { type LucideIcon, Play } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { cn } from '@/client/lib/cn'
import { useLive } from '@/client/live/store'
import {
  groupSteps,
  type PressStep,
  reorderSteps,
} from '@/shared/present-steps'
import {
  STEP_EFFECT_LABELS,
  STEP_START_LABELS,
} from '@/shared/present-transition'
import type { TreeElement } from '@/shared/records/elements'

import { followFrame } from '../bridge/shown'
import { DropLine } from '../chrome/drop-line'
import { useReorderMonitor, useReorderRow } from '../chrome/reorder'
import { useShownTree } from '../element/tree'
import { elementGlyph } from '../left-panel/layer-glyphs'
import { HIDDEN_TEXT } from '../left-panel/row-flags'
import { previewStepOn } from '../present/preview'
import { type ElementKey, selectElement, selectionStore } from '../selection'
import { sentence, writeElements } from './element/write'

/** The elements of a frame's tree a press reveals, in document order. */
function stepsIn(elements: readonly TreeElement[]) {
  return elements.flatMap((of) => (of.step ? [{ of, step: of.step }] : []))
}

interface StepsSectionProps {
  page: string
  /** The slide's ref. */
  frame: string
  /** The selected elements' indices in this slide, empty when none is. */
  selected: readonly number[]
  write?: typeof writeElements
  preview?: typeof previewStepOn
}

/**
 * The slide's steps in the order a walk plays them, a line between presses,
 * read from the server's tree so a slide off screen lists them too. A drag
 * renumbers them in one undo step, and the step number moves one by keyboard.
 */
export function StepsSection({
  page,
  frame,
  selected,
  write = writeElements,
  preview = previewStepOn,
}: StepsSectionProps) {
  const { tree, refused } = useShownTree(frame)
  const canWrite = useLive((state) => state.canWrite)
  const onScreen = useOnScreen(frame)
  const list = `steps\n${frame}`
  const move = useCallback(
    (from: number, to: number) => {
      if (!tree) return
      const edits = reorderSteps(stepsIn(tree.elements), from, to).map(
        ({ of, name, value }) => ({
          key: { frame, index: of.index, hash: tree.hash },
          change: { kind: 'attribute' as const, name, value },
        }),
      )
      if (edits.length > 0) void write(page, edits)
    },
    [tree, frame, page, write],
  )
  useReorderMonitor(list, move)
  const groups = groupSteps(tree ? stepsIn(tree.elements) : [])
  const firsts = groups.map((_group, at) => groups.slice(0, at).flat().length)
  return (
    <section
      aria-labelledby="inspector-steps"
      className="border-b border-sidebar-border px-3 pt-2.5 pb-3"
    >
      <h2 id="inspector-steps" className="mb-2 text-xs font-semibold">
        Steps
      </h2>
      {refused !== null ? (
        <p className="text-muted-foreground">
          This slide’s steps cannot be listed. {sentence(refused)}
        </p>
      ) : !tree ? (
        <p className="text-muted-foreground">Reading steps</p>
      ) : groups.length === 0 ? (
        <p className="text-muted-foreground">
          No steps yet. Select an element and set the step it appears on.
        </p>
      ) : (
        // Capped so the selected element's own fields below stay in reach, its padding keeping a drop line whole.
        <ol className="-mx-1.5 -my-1 max-h-[248px] overflow-y-auto py-1">
          {groups.map((group, at) => (
            <li
              key={group[0]?.of.index}
              aria-label={`Press ${at + 1}`}
              className={cn(
                at > 0 && 'mt-1 border-t border-sidebar-border pt-1',
              )}
            >
              <ul>
                {group.map((step, place) => (
                  <StepRow
                    key={step.of.index}
                    step={step}
                    press={place === 0 ? at + 1 : null}
                    list={list}
                    index={(firsts[at] ?? 0) + place}
                    selected={selected.includes(step.of.index)}
                    canWrite={canWrite}
                    onSelect={() =>
                      selectElement(selectionStore, page, {
                        frame,
                        index: step.of.index,
                        hash: tree.hash,
                      })
                    }
                    onPreview={
                      onScreen
                        ? () =>
                            preview(
                              { frame, index: step.of.index, hash: tree.hash },
                              step.step.effect,
                              step.step.durationMs,
                            )
                        : undefined
                    }
                  />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
      {groups.length > 0 && !onScreen ? (
        <p className="mt-2 text-muted-foreground">
          Previews play once the slide is on screen.
        </p>
      ) : null}
    </section>
  )
}

/** Whether the canvas draws a frame's live page now, since a preview plays in it. */
function useOnScreen(frame: ElementKey['frame']): boolean {
  const [shown, setShown] = useState<string | null>(null)
  useEffect(
    () =>
      followFrame(
        document.body,
        frame,
        () => {
          setShown(frame)
          return () => {}
        },
        () => setShown(null),
      ),
    [frame],
  )
  return shown === frame
}

interface StepRowProps {
  step: PressStep<TreeElement>
  /** The press it opens, null for a row joining the one before it. */
  press: number | null
  list: string
  /** Its place among the slide's steps, which a drop counts in. */
  index: number
  selected: boolean
  canWrite: boolean
  onSelect: () => void
  /** Absent while nothing on screen can play it. */
  onPreview?: () => void
}

function StepRow({
  step: { of: element, step, start },
  press,
  list,
  index,
  selected,
  canWrite,
  onSelect,
  onPreview,
}: StepRowProps) {
  const row = useRef<HTMLLIElement>(null)
  const edge = useReorderRow(row, { list, index, enabled: canWrite })
  const effect = STEP_EFFECT_LABELS[step.effect]
  const starts = STEP_START_LABELS[start].toLowerCase()
  // Both row fills drop muted text below 4.5:1.
  const quiet = selected
    ? 'text-accent-foreground'
    : 'text-muted-foreground group-hover:text-accent-foreground'
  return (
    <li
      ref={row}
      className={cn(
        'group relative flex h-[26px] items-center gap-1 rounded-md pr-0.5 pl-1.5',
        selected ? 'bg-primary/26' : 'hover:bg-accent',
      )}
    >
      <DropLine edge={edge} />
      <span
        aria-hidden
        className={cn('w-4 shrink-0 text-center tabular-nums', quiet)}
      >
        {press}
      </span>
      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        aria-label={[
          element.name,
          ...(element.hidden ? ['hidden'] : []),
          effect,
          starts,
        ].join(', ')}
        title={element.name}
        onClick={onSelect}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-1.5 self-stretch rounded-[5px] text-left outline-none focus-visible:ring-2 focus-visible:ring-inset',
          // The focus blue sits below 3:1 on the selected tint.
          selected
            ? 'focus-visible:ring-foreground'
            : 'focus-visible:ring-ring',
        )}
      >
        <StepGlyph icon={elementGlyph(element)} selected={selected} />
        <span
          className={cn(
            'min-w-0 flex-1 truncate',
            element.hidden && HIDDEN_TEXT,
          )}
        >
          {element.name}
        </span>
        {/* A row opening a press shows that by its number, so only a joining one spells its start. */}
        <span className={cn('shrink-0 text-caption', quiet)}>
          {start === 'click' ? effect : `${effect}, ${starts}`}
        </span>
      </button>
      <button
        type="button"
        aria-label={`Preview ${element.name}`}
        disabled={!onPreview}
        onClick={onPreview}
        className="group/target grid size-6 shrink-0 place-items-center text-muted-foreground outline-none hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <span
          className={cn(
            'grid size-5 place-items-center rounded-[5px] group-hover/target:bg-accent group-focus-visible/target:ring-2',
            selected
              ? 'group-focus-visible/target:ring-foreground'
              : 'group-focus-visible/target:ring-ring',
          )}
        >
          <Play aria-hidden className="size-[11px]" />
        </span>
      </button>
    </li>
  )
}

function StepGlyph({
  icon: Icon,
  selected,
}: {
  icon: LucideIcon
  selected: boolean
}) {
  return (
    <Icon
      aria-hidden
      className={cn(
        'size-[13px] shrink-0',
        selected ? 'text-primary' : 'text-muted-foreground',
      )}
    />
  )
}
