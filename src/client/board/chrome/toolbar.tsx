import { ChevronDown } from 'lucide-react'
import { Fragment, type RefObject, useLayoutEffect, useRef } from 'react'

import { type Action, isEnabled, useActions } from '@/client/actions/registry'
import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
import { cn } from '@/client/lib/cn'

import { AssetPicker } from '../place/asset-picker'
import { shapeRow, SHAPES, useShape } from '../place/tool'
import { useBoxTool } from '../sections/actions'
import { ActionTooltip } from './action-tooltip'
import { ChromeMenuContent } from './menu'
import { ImageRow, MoreMenu, ToolRow } from './more-menu'
import { useToolbarStage } from './toolbar-stage'
import {
  BOX_TOOLS,
  EDIT_AND_VIEW,
  HAND_TOOL,
  IMAGE_ROW,
  MODE_TOGGLE,
  MODES,
  NOTE_TOOL,
  POINTER_TOOLS,
  PRESENT,
  PRESENT_NOTHING,
  type Slot,
  TEXT_TOOL,
} from './toolbar-tools'

const IDS = [
  MODE_TOGGLE,
  ...[...POINTER_TOOLS, ...BOX_TOOLS, TEXT_TOOL, NOTE_TOOL, IMAGE_ROW].map(
    (row) => row.id,
  ),
  ...[...EDIT_AND_VIEW.flat(), ...MODES, PRESENT].map((slot) => slot.id),
  ...SHAPES.map((row) => row.id),
]

/** Every tool in the order the bar and More list them, for finding the one on. */
const EVERY_TOOL = [
  ...POINTER_TOOLS,
  ...BOX_TOOLS,
  TEXT_TOOL,
  ...SHAPES,
  IMAGE_ROW,
  NOTE_TOOL,
]

/**
 * Publishes the bar's top edge, plus a 0.5rem gap, on the document root for
 * the toast viewport, which is portaled outside this tree. Measured rather
 * than fixed, so it follows the bar's height at every stage.
 */
function usePublishToastLift(bar: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const element = bar.current
    if (!element) return
    const root = document.documentElement
    const publish = () => {
      root.style.setProperty(
        '--toast-lift',
        `calc(${element.offsetHeight}px + 1.5rem)`,
      )
    }
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(element)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--toast-lift')
    }
  }, [bar])
}

/**
 * The floating toolbar, drawing what its column has room for with More holding
 * the rest, an unregistered action's button showing disabled.
 */
export function Toolbar({ project }: { project?: string }) {
  const registered = useActions(IDS)
  const actions = new Map(IDS.map((id, index) => [id, registered[index]]))
  const bar = useRef<HTMLDivElement>(null)
  usePublishToastLift(bar)
  const stage = useToolbarStage(bar)
  const carets = stage === 'full' || stage === 'folded'
  return (
    <div
      ref={bar}
      role="toolbar"
      aria-label="Tools"
      className="absolute bottom-4 left-1/2 z-10 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-0.5 overflow-hidden rounded-xl border border-border bg-card p-[5px] shadow-[0_6px_24px_rgba(0,0,0,.18),0_1px_3px_rgba(0,0,0,.12)]"
    >
      {stage === 'more' ? null : (
        <>
          {stage === 'active' ? (
            <ActiveTool actions={actions} />
          ) : (
            <>
              <PointerTool actions={actions} carets={carets} />
              <BoxTool actions={actions} carets={carets} />
              <ToolButton
                slot={toolSlot(TEXT_TOOL)}
                action={actions.get(TEXT_TOOL.id)}
              />
              <ShapeTool actions={actions} carets={carets} />
              <ToolButton
                slot={toolSlot(NOTE_TOOL)}
                action={actions.get(NOTE_TOOL.id)}
              />
            </>
          )}
          <Rule />
        </>
      )}
      {stage === 'full' ? (
        <>
          {EDIT_AND_VIEW.map((group, index) => (
            <Fragment key={group[0]?.id}>
              {index > 0 ? <Rule /> : null}
              {group.map((slot) => (
                <ToolButton
                  key={slot.id}
                  slot={slot}
                  action={actions.get(slot.id)}
                />
              ))}
            </Fragment>
          ))}
        </>
      ) : (
        <>
          <MoreMenu key={stage} stage={stage} actions={actions} />
        </>
      )}
      {stage === 'more' ? null : (
        <>
          <Rule />
          <div className="flex shrink-0 rounded-lg bg-muted p-0.5">
            {MODES.map((slot) => (
              <ModeButton
                key={slot.id}
                slot={slot}
                action={actions.get(slot.id)}
                toggleKeys={actions.get(MODE_TOGGLE)?.keys}
                iconOnly={!carets}
              />
            ))}
          </div>
          <Rule />
          <PresentButton action={actions.get(PRESENT.id)} />
        </>
      )}
      {project === undefined ? null : (
        <AssetPicker project={project} anchor={bar} />
      )}
    </div>
  )
}

function toolSlot(row: {
  id: string
  label: string
  key: string
  icon: Slot['icon']
}): Slot {
  return { id: row.id, label: row.label, keys: [row.key], icon: row.icon }
}

/** The one tool the narrowest bar keeps, whichever is on, or Move with none on. */
function ActiveTool({ actions }: { actions: ToolActions }) {
  const on =
    EVERY_TOOL.find((row) => actions.get(row.id)?.checked?.()) ??
    POINTER_TOOLS[0]
  return <ToolButton slot={toolSlot(on)} action={actions.get(on.id)} />
}

type ToolActions = ReadonlyMap<string, Action | undefined>

interface ToolProps {
  actions: ToolActions
  /** Draws the slot's caret menu, which the narrower stages leave to More. */
  carets: boolean
}

interface ButtonProps {
  slot: Slot
  action: Action | undefined
  /** Shows the button pressed whatever its action reads, as the Shape tool does for any shape. */
  pressed?: boolean
  /** The tooltip in place of the label, as a disabled button says why. */
  tip?: string
}

function ToolButton({ slot, action, pressed, tip }: ButtonProps) {
  const shown = read(slot, action)
  const { label, keys, enabled, run } = shown
  const on = pressed ?? shown.on
  const Icon = slot.icon
  const DarkIcon = slot.darkIcon
  return (
    <ActionTooltip label={tip ?? label} keys={tip ? undefined : keys}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={action?.checked || pressed !== undefined ? on : undefined}
        aria-disabled={enabled ? undefined : true}
        onClick={run}
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-[7px] text-foreground outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent',
          on &&
            'bg-primary-fill text-primary-foreground hover:bg-primary-fill-hover aria-disabled:hover:bg-primary-fill',
        )}
      >
        <Icon aria-hidden className={cn('size-4', DarkIcon && 'dark:hidden')} />
        {DarkIcon ? (
          <DarkIcon aria-hidden className="hidden size-4 dark:block" />
        ) : null}
      </button>
    </ActionTooltip>
  )
}

/**
 * The Shape tool: a button placing the last shape chosen, pressed while any
 * shape is on, and a caret opening the menu of shapes, the one chosen
 * marked, each naming its key, and below them the Image, video, or audio row.
 */
function ShapeTool({ actions, carets }: ToolProps) {
  const shown = useShape()
  const action = actions.get(shown.id)
  const slot = {
    id: shown.id,
    label: shown.label,
    keys: [shown.key],
    icon: shown.icon,
  }
  const on = SHAPES.some((row) => actions.get(row.id)?.checked?.() ?? false)
  return (
    <>
      <ToolButton slot={slot} action={action} pressed={on} />
      {carets ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Shapes"
            className="-ml-0.5 grid h-8 w-6 shrink-0 place-items-center rounded-[5px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:text-foreground"
          >
            <ChevronDown aria-hidden className="size-[9px]" />
          </DropdownMenuTrigger>
          <ChromeMenuContent
            side="top"
            align="start"
            sideOffset={8}
            className="w-[220px]"
          >
            <DropdownMenuRadioGroup
              value={shown.kind}
              onValueChange={(kind) => {
                const row = actions.get(shapeRow(kind).id)
                if (row && isEnabled(row)) row.run()
              }}
            >
              {SHAPES.map((row) => (
                <ToolRow
                  key={row.id}
                  value={row.kind}
                  row={row}
                  action={actions.get(row.id)}
                />
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <ImageRow action={actions.get(IMAGE_ROW.id)} />
          </ChromeMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  )
}

/**
 * The Frame slot: a button turning on Frame or Section, whichever was chosen
 * last, pressed while either is on, and a caret opening the menu of both,
 * the one chosen marked, each naming its key.
 */
function BoxTool({ actions, carets }: ToolProps) {
  const chosen = useBoxTool()
  const shown = BOX_TOOLS.find((row) => row.tool === chosen) ?? BOX_TOOLS[0]
  const slot = {
    id: shown.id,
    label: shown.label,
    keys: [shown.key],
    icon: shown.icon,
  }
  const on = BOX_TOOLS.some((row) => actions.get(row.id)?.checked?.() ?? false)
  return (
    <>
      <ToolButton slot={slot} action={actions.get(shown.id)} pressed={on} />
      {carets ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Frame tools"
            className="-ml-0.5 grid h-8 w-6 shrink-0 place-items-center rounded-[5px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:text-foreground"
          >
            <ChevronDown aria-hidden className="size-[9px]" />
          </DropdownMenuTrigger>
          <ChromeMenuContent
            side="top"
            align="start"
            sideOffset={8}
            className="w-[196px]"
          >
            <DropdownMenuRadioGroup
              value={chosen}
              onValueChange={(tool) => {
                const row = BOX_TOOLS.find(
                  (candidate) => candidate.tool === tool,
                )
                const action = row && actions.get(row.id)
                if (action && isEnabled(action)) action.run()
              }}
            >
              {BOX_TOOLS.map((row) => (
                <ToolRow
                  key={row.id}
                  value={row.tool}
                  row={row}
                  action={actions.get(row.id)}
                />
              ))}
            </DropdownMenuRadioGroup>
          </ChromeMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  )
}

/**
 * The Move slot: a button turning on Move, or Hand while Hand is on, pressed
 * while either is, and a caret opening the menu of both, the one on marked,
 * each naming its key, so V and H stay the way in.
 */
function PointerTool({ actions, carets }: ToolProps) {
  const handOn = actions.get(HAND_TOOL)?.checked?.() ?? false
  const shown = POINTER_TOOLS[handOn ? 1 : 0]
  const slot = {
    id: shown.id,
    label: shown.label,
    keys: [shown.key],
    icon: shown.icon,
  }
  const on = POINTER_TOOLS.some(
    (row) => actions.get(row.id)?.checked?.() ?? false,
  )
  return (
    <>
      <ToolButton slot={slot} action={actions.get(shown.id)} pressed={on} />
      {carets ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Pointer tools"
            className="-ml-0.5 grid h-8 w-6 shrink-0 place-items-center rounded-[5px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:text-foreground"
          >
            <ChevronDown aria-hidden className="size-[9px]" />
          </DropdownMenuTrigger>
          <ChromeMenuContent
            side="top"
            align="start"
            sideOffset={8}
            className="w-[196px]"
          >
            <DropdownMenuRadioGroup
              value={on ? shown.id : ''}
              onValueChange={(id) => {
                const action = actions.get(id)
                if (action && isEnabled(action)) action.run()
              }}
            >
              {POINTER_TOOLS.map((row) => (
                <ToolRow
                  key={row.id}
                  value={row.id}
                  row={row}
                  action={actions.get(row.id)}
                />
              ))}
            </DropdownMenuRadioGroup>
          </ChromeMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  )
}

/** One half of the Edit and Play segment, where Play shows on in the selection blue. */
function ModeButton({
  slot,
  action,
  toggleKeys,
  iconOnly,
}: ButtonProps & {
  toggleKeys: readonly string[] | undefined
  iconOnly: boolean
}) {
  const { label, keys, on, enabled, run } = read(slot, action)
  const Icon = slot.icon
  return (
    <ActionTooltip label={label} keys={keys ?? toggleKeys}>
      <button
        type="button"
        aria-label={iconOnly ? label : undefined}
        aria-pressed={on}
        aria-disabled={enabled ? undefined : true}
        onClick={run}
        className={cn(
          'flex h-[26px] items-center gap-[5px] rounded-md px-[9px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
          on && slot.id === 'mode.play'
            ? 'bg-primary-fill text-primary-foreground hover:text-primary-foreground'
            : on && 'bg-card text-foreground ring-1 ring-border',
        )}
      >
        <Icon aria-hidden className="size-3.5" />
        {iconOnly ? null : label}
      </button>
    </ActionTooltip>
  )
}

/**
 * Presents the page, from the selected frame when one is. While the page has
 * no frame to show it stays disabled, its tooltip saying why.
 */
function PresentButton({ action }: { action: Action | undefined }) {
  const enabled = action ? isEnabled(action) : false
  return (
    <ToolButton
      slot={PRESENT}
      action={action}
      tip={action && !enabled ? PRESENT_NOTHING : undefined}
    />
  )
}

function Rule() {
  return <span aria-hidden className="mx-[5px] h-5 w-px shrink-0 bg-border" />
}

function read(slot: Slot, action: Action | undefined) {
  const enabled = action ? isEnabled(action) : false
  return {
    label: action?.label ?? slot.label,
    keys: action?.keys ?? slot.keys,
    on: action?.checked?.() ?? false,
    enabled,
    run: () => {
      if (action && enabled) action.run()
    },
  }
}
