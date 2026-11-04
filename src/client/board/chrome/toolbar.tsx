import {
  ChevronDown,
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
import {
  Fragment,
  type KeyboardEvent,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useStore } from 'zustand'

import { liveKey, useCharacterKeysOn } from '@/client/actions/character-keys'
import { keyLabel } from '@/client/actions/keys'
import { type Action, isEnabled, useActions } from '@/client/actions/registry'
import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
import { cn } from '@/client/lib/cn'

import { AssetPicker } from '../place/asset-picker'
import {
  IMAGE_TOOL,
  placementStore,
  type Placing,
  shapeRow,
  SHAPES,
  useShape,
} from '../place/tool'
import { useBoxTool } from '../sections/actions'
import { ActionTooltip } from './action-tooltip'
import { ActionMenuItem, ChromeMenuContent, MENU_ROW, MenuKey } from './menu'

/**
 * A toolbar place and what it shows before its action registers. A row
 * registering the action supplies its own label and keys, which win.
 */
interface Slot {
  id: string
  label: string
  keys?: readonly string[]
  icon: LucideIcon
  /** Drawn in dark in place of `icon`, as the theme toggle shows the moon. */
  darkIcon?: LucideIcon
}

const SHAPE_SLOT = 'tool.shape'
const FRAME_SLOT = 'tool.frame'
const SECTION_TOOL = 'tool.section'
const MOVE_SLOT = 'tool.move'
const HAND_TOOL = 'tool.hand'
/** Stands for the Place toggle, which holds no action, after the tools. */
const PLACE_SLOT = 'place'

/** The tools the Move slot's caret lists, Move and Hand both pointing rather than drawing. */
const POINTER_TOOLS = [
  { id: MOVE_SLOT, label: 'Move', key: 'v', icon: MousePointer2 },
  { id: HAND_TOOL, label: 'Hand', key: 'h', icon: Hand },
] as const

/** The Place toggle's choices, each named in its tooltip by where a new element lands. */
const PLACINGS: readonly { value: Placing; label: string; tip: string }[] = [
  {
    value: 'auto',
    label: 'Auto',
    tip: 'Place where drawn, or in the flow of a flex or grid',
  },
  { value: 'flow', label: 'Flow', tip: 'Place in the flow' },
  { value: 'free', label: 'Free', tip: 'Place where drawn' },
]

/** The tools the Frame slot's caret lists, Frame and Section both drawing a box on the page. */
const BOX_TOOLS = [
  { tool: 'frame', id: FRAME_SLOT, label: 'Frame', key: 'f', icon: Frame },
  {
    tool: 'section',
    id: SECTION_TOOL,
    label: 'Section',
    key: 'Shift+KeyS',
    icon: PanelTop,
  },
] as const

/** The groups in the order `canon/design/toolbar/floating` draws them, divided by a rule. */
const GROUPS: readonly (readonly Slot[])[] = [
  [
    // Stands in for the Move slot, which `PointerTool` draws from Move or Hand, whichever is on.
    { id: MOVE_SLOT, label: 'Move', keys: ['v'], icon: MousePointer2 },
    // Stands in for the Frame slot, which `BoxTool` draws from Frame or Section, the last chosen.
    { id: FRAME_SLOT, label: 'Frame', keys: ['f'], icon: Frame },
    { id: 'tool.text', label: 'Text', keys: ['t'], icon: Type },
    // Stands in for the Shape slot, which `ShapeTool` draws from the last shape chosen.
    { id: SHAPE_SLOT, label: 'Shape', icon: SHAPES[0].icon },
    { id: 'tool.note', label: 'Note', keys: ['n'], icon: MessageSquare },
  ],
  [{ id: PLACE_SLOT, label: 'Place', icon: MousePointer2 }],
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

const MODES: readonly Slot[] = [
  { id: 'mode.edit', label: 'Edit', icon: Pencil },
  { id: 'mode.play', label: 'Play', icon: Play },
]

/** The one key flipping between the two modes, which both halves of the segment name. */
const MODE_TOGGLE = 'mode.toggle'

const SLOTS = [...GROUPS.flat(), ...MODES]
const IDS = [
  MODE_TOGGLE,
  HAND_TOOL,
  ...SLOTS.map((slot) => slot.id).filter(
    (id) => id !== SHAPE_SLOT && id !== PLACE_SLOT,
  ),
  ...SHAPES.map((row) => row.id),
  IMAGE_TOOL,
  SECTION_TOOL,
]

/**
 * Publishes the bar's top edge, plus a 0.5rem gap, on the document root for
 * the toast viewport, which is portaled outside this tree. Measured rather
 * than fixed, since a horizontal scrollbar under the bar's `max-w` adds height.
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
 * The floating pill centered at the foot of the canvas column. Every button
 * runs its action from the registry, and one whose action no row has
 * registered yet shows disabled with its name and key on hover. Given the
 * project, it opens the Image tool's picker above itself.
 */
export function Toolbar({ project }: { project?: string }) {
  const registered = useActions(IDS)
  const actions = new Map(IDS.map((id, index) => [id, registered[index]]))
  const bar = useRef<HTMLDivElement>(null)
  usePublishToastLift(bar)
  return (
    <div
      ref={bar}
      role="toolbar"
      aria-label="Tools"
      className="absolute bottom-4 left-1/2 z-10 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-xl border border-border bg-card p-[5px] shadow-[0_6px_24px_rgba(0,0,0,.18),0_1px_3px_rgba(0,0,0,.12)]"
    >
      {GROUPS.map((group, index) => (
        <Fragment key={group[0]?.id}>
          {index > 0 ? <Rule /> : null}
          {group.map((slot) =>
            slot.id === SHAPE_SLOT ? (
              <ShapeTool key={slot.id} actions={actions} />
            ) : slot.id === MOVE_SLOT ? (
              <PointerTool key={slot.id} actions={actions} />
            ) : slot.id === PLACE_SLOT ? (
              <PlaceToggle key={slot.id} />
            ) : slot.id === FRAME_SLOT ? (
              <BoxTool key={slot.id} actions={actions} />
            ) : (
              <ToolButton
                key={slot.id}
                slot={slot}
                action={actions.get(slot.id)}
              />
            ),
          )}
        </Fragment>
      ))}
      <Rule />
      <div className="flex shrink-0 rounded-lg bg-muted p-0.5">
        {MODES.map((slot) => (
          <ModeButton
            key={slot.id}
            slot={slot}
            action={actions.get(slot.id)}
            toggleKeys={actions.get(MODE_TOGGLE)?.keys}
          />
        ))}
      </div>
      {project === undefined ? null : (
        <AssetPicker project={project} anchor={bar} />
      )}
    </div>
  )
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
 * marked, each naming its key, and below them the Image or video row.
 */
function ShapeTool({
  actions,
}: {
  actions: ReadonlyMap<string, Action | undefined>
}) {
  const shown = useShape()
  const keysOn = useCharacterKeysOn()
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
            {SHAPES.map((row) => {
              const registered = actions.get(row.id)
              const key = liveKey(registered?.keys ?? [row.key], keysOn)
              const Icon = row.icon
              return (
                <DropdownMenuRadioItem
                  key={row.id}
                  value={row.kind}
                  // A radio row stays open by default, which spends the next canvas click on closing it.
                  closeOnClick
                  disabled={!registered || !isEnabled(registered)}
                  className={cn(
                    MENU_ROW,
                    'gap-2 pr-2 data-checked:bg-primary-fill data-checked:text-primary-foreground [&_[data-slot=dropdown-menu-radio-item-indicator]]:hidden',
                  )}
                >
                  <Icon aria-hidden className="size-[13px]" />
                  {row.label}
                  {key ? <MenuKey>{keyLabel(key)}</MenuKey> : null}
                </DropdownMenuRadioItem>
              )
            })}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          {/* Opens the picker rather than choosing a shape, so the slot keeps the last shape. */}
          <ActionMenuItem
            action={actions.get(IMAGE_TOOL)}
            label="Image or video"
            keys={['$mod+Shift+KeyK']}
          >
            <span className="flex items-center gap-2 whitespace-nowrap">
              <ImageIcon aria-hidden className="size-[13px]" />
              Image or video…
            </span>
          </ActionMenuItem>
        </ChromeMenuContent>
      </DropdownMenu>
    </>
  )
}

/**
 * The Frame slot: a button turning on Frame or Section, whichever was chosen
 * last, pressed while either is on, and a caret opening the menu of both,
 * the one chosen marked, each naming its key.
 */
function BoxTool({
  actions,
}: {
  actions: ReadonlyMap<string, Action | undefined>
}) {
  const chosen = useBoxTool()
  const keysOn = useCharacterKeysOn()
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
              const row = BOX_TOOLS.find((candidate) => candidate.tool === tool)
              const action = row && actions.get(row.id)
              if (action && isEnabled(action)) action.run()
            }}
          >
            {BOX_TOOLS.map((row) => {
              const registered = actions.get(row.id)
              const key = liveKey(registered?.keys ?? [row.key], keysOn)
              const Icon = row.icon
              return (
                <DropdownMenuRadioItem
                  key={row.id}
                  value={row.tool}
                  closeOnClick
                  disabled={!registered || !isEnabled(registered)}
                  className={cn(
                    MENU_ROW,
                    'gap-2 pr-2 data-checked:bg-primary-fill data-checked:text-primary-foreground [&_[data-slot=dropdown-menu-radio-item-indicator]]:hidden',
                  )}
                >
                  <Icon aria-hidden className="size-[13px]" />
                  {row.label}
                  {key ? <MenuKey>{keyLabel(key)}</MenuKey> : null}
                </DropdownMenuRadioItem>
              )
            })}
          </DropdownMenuRadioGroup>
        </ChromeMenuContent>
      </DropdownMenu>
    </>
  )
}

/**
 * The Move slot: a button turning on Move, or Hand while Hand is on, pressed
 * while either is, and a caret opening the menu of both, the one on marked,
 * each naming its key, so V and H stay the way in.
 */
function PointerTool({
  actions,
}: {
  actions: ReadonlyMap<string, Action | undefined>
}) {
  const keysOn = useCharacterKeysOn()
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
            {POINTER_TOOLS.map((row) => {
              const registered = actions.get(row.id)
              const key = liveKey(registered?.keys ?? [row.key], keysOn)
              const Icon = row.icon
              return (
                <DropdownMenuRadioItem
                  key={row.id}
                  value={row.id}
                  closeOnClick
                  disabled={!registered || !isEnabled(registered)}
                  className={cn(
                    MENU_ROW,
                    'gap-2 pr-2 data-checked:bg-primary-fill data-checked:text-primary-foreground [&_[data-slot=dropdown-menu-radio-item-indicator]]:hidden',
                  )}
                >
                  <Icon aria-hidden className="size-[13px]" />
                  {row.label}
                  {key ? <MenuKey>{keyLabel(key)}</MenuKey> : null}
                </DropdownMenuRadioItem>
              )
            })}
          </DropdownMenuRadioGroup>
        </ChromeMenuContent>
      </DropdownMenu>
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

/** One half of the Edit and Play segment, where Play shows on in the selection blue. */
function ModeButton({
  slot,
  action,
  toggleKeys,
}: ButtonProps & { toggleKeys: readonly string[] | undefined }) {
  const { label, keys, on, enabled, run } = read(slot, action)
  const Icon = slot.icon
  return (
    <ActionTooltip label={label} keys={keys ?? toggleKeys}>
      <button
        type="button"
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
        {label}
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
