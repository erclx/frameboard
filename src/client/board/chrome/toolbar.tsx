import { ChevronDown } from 'lucide-react'
import {
  Fragment,
  type KeyboardEvent,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useStore } from 'zustand'

import { type Action, isEnabled, useActions } from '@/client/actions/registry'
import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
import { cn } from '@/client/lib/cn'

import { AssetPicker } from '../place/asset-picker'
import { placementStore, shapeRow, SHAPES, useShape } from '../place/tool'
import { useBoxTool } from '../sections/actions'
import { ActionTooltip } from './action-tooltip'
import { ChromeMenuContent } from './menu'
import { ImageRow, MoreMenu, PlaceRows, ToolRow } from './more-menu'
import { useToolbarStage } from './toolbar-stage'
import {
  BOX_TOOLS,
  EDIT_AND_VIEW,
  HAND_TOOL,
  IMAGE_ROW,
  MODE_TOGGLE,
  MODES,
  NOTE_TOOL,
  PLACINGS,
  POINTER_TOOLS,
  type Slot,
  TEXT_TOOL,
} from './toolbar-tools'

const IDS = [
  MODE_TOGGLE,
  ...[...POINTER_TOOLS, ...BOX_TOOLS, TEXT_TOOL, NOTE_TOOL, IMAGE_ROW].map(
    (row) => row.id,
  ),
  ...[...EDIT_AND_VIEW.flat(), ...MODES].map((slot) => slot.id),
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
 * The floating pill centered at the foot of the canvas column, drawing what its
 * column has room for, with More holding the rest. Every button runs its action
 * from the registry, and one whose action no row has registered yet shows
 * disabled with its name and key on hover. Given the project, it opens the
 * Image tool's picker above itself.
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
          <PlaceToggle />
          {EDIT_AND_VIEW.map((group) => (
            <Fragment key={group[0]?.id}>
              <Rule />
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
          {stage === 'folded' ? (
            <>
              <PlaceMenu />
              <Rule />
            </>
          ) : null}
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
}

function ToolButton({ slot, action, pressed }: ButtonProps) {
  const shown = read(slot, action)
  const { label, keys, enabled, run } = shown
  const on = pressed ?? shown.on
  const Icon = slot.icon
  const DarkIcon = slot.darkIcon
  return (
    <ActionTooltip label={label} keys={keys}>
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

const PLACE_STEPS: Record<string, (at: number, count: number) => number> = {
  ArrowRight: (at, count) => (at + 1) % count,
  ArrowLeft: (at, count) => (at - 1 + count) % count,
  Home: () => 0,
  End: (_, count) => count - 1,
}

/**
 * The Place toggle: Auto, Flow, and Free, setting how Text, Shape, and Image
 * place what they add, drawn as the Edit and Play segment is. It holds one
 * tab stop, resting on the choice on, and the arrow keys, Home, and End move
 * along it, as the inspector's segmented rows do. It writes nothing, so it
 * stays on whether or not this tab may write.
 */
function PlaceToggle() {
  const placing = useStore(placementStore, (state) => state.placing)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  // The focused button while focus is inside the toggle, null once it leaves.
  const [focused, setFocused] = useState<number | null>(null)
  const lit = PLACINGS.findIndex(({ value }) => value === placing)
  const stop = focused ?? lit
  const onKeyDown = (event: KeyboardEvent, at: number) => {
    const step = PLACE_STEPS[event.key]
    if (!step) return
    event.preventDefault()
    buttons.current[step(at, PLACINGS.length)]?.focus()
  }
  return (
    <div
      role="group"
      aria-label="Place new elements"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(null)
        }
      }}
      className="flex shrink-0 rounded-lg bg-muted p-0.5"
    >
      {PLACINGS.map(({ value, label, tip }, at) => (
        <ActionTooltip key={value} label={tip}>
          <button
            ref={(button) => {
              buttons.current[at] = button
            }}
            type="button"
            aria-pressed={value === placing}
            tabIndex={at === stop ? 0 : -1}
            onFocus={() => setFocused(at)}
            onKeyDown={(event) => onKeyDown(event, at)}
            onClick={() => placementStore.setState({ placing: value })}
            className={cn(
              'flex h-[26px] items-center rounded-md px-[9px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
              value === placing && 'bg-card text-foreground ring-1 ring-border',
            )}
          >
            {label}
          </button>
        </ActionTooltip>
      ))}
    </div>
  )
}

/**
 * The Place choice folded to a button naming it, for the stage with no room
 * for the toggle.
 */
function PlaceMenu() {
  const placing = useStore(placementStore, (state) => state.placing)
  const label = PLACINGS.find(({ value }) => value === placing)?.label
  return (
    <DropdownMenu>
      <ActionTooltip label="Place new elements">
        <DropdownMenuTrigger
          aria-label={`Place new elements, ${label}`}
          className="flex h-[30px] shrink-0 items-center gap-1.5 rounded-lg bg-muted pr-2 pl-[9px] font-medium text-foreground outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-accent"
        >
          {label}
          <ChevronDown
            aria-hidden
            className="size-[9px] text-muted-foreground"
          />
        </DropdownMenuTrigger>
      </ActionTooltip>
      <ChromeMenuContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[196px]"
      >
        <PlaceRows />
      </ChromeMenuContent>
    </DropdownMenu>
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
