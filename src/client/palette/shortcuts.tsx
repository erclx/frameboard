import { cn } from 'cn'
import { useRoute } from 'wouter'

import {
  setCharacterKeys,
  useCharacterKeysOn,
} from '@/client/actions/character-keys'
import { IS_MAC, isCharacterKey, keyParts } from '@/client/actions/keys'
import { type Action, useActions } from '@/client/actions/registry'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/client/components/ui/dialog'
import { Kbd, KbdGroup } from '@/client/components/ui/kbd'

import { openOverlay, useOverlay } from './overlay'

/**
 * One line of the sheet. A row names the actions whose first key it prints,
 * or a gesture no action carries, such as a click with a modifier.
 * `characterGestures` are gestures typing a character, drawn faint while the
 * Single-key shortcuts switch is off.
 */
interface Row {
  label: string
  actions?: readonly string[]
  gestures?: readonly string[]
  characterGestures?: readonly string[]
}

interface Section {
  title: string
  rows: readonly Row[]
}

const MOD = IS_MAC ? '⌘' : 'Ctrl'
const SHIFT = IS_MAC ? '⇧' : 'Shift'
const CTRL = IS_MAC ? '⌃' : 'Ctrl'

/** Ordered as the reference draws them, three columns reading across. */
const SECTIONS: readonly Section[] = [
  {
    title: 'Tools',
    rows: [
      { label: 'Move', actions: ['tool.move'] },
      { label: 'Hand', actions: ['tool.hand'] },
      { label: 'Frame', actions: ['tool.frame'] },
      { label: 'Text', actions: ['tool.text'] },
      {
        label: 'Rectangle, ellipse, divider',
        actions: ['tool.rectangle', 'tool.ellipse', 'tool.divider'],
      },
      { label: 'Note', actions: ['tool.note'] },
      { label: 'Find', actions: ['find.open'] },
      { label: 'Command palette', actions: ['palette.open'] },
      { label: 'This list', actions: ['help.shortcuts'] },
      { label: 'All projects', actions: ['nav.home'] },
    ],
  },
  {
    title: 'Selection',
    rows: [
      { label: 'Into an element', gestures: [`${MOD} click`] },
      { label: 'One level down', actions: ['element.down'] },
      { label: 'One level up', actions: ['element.up'] },
      { label: 'Next sibling', actions: ['element.next'] },
      { label: 'Add to selection', gestures: [`${SHIFT} click`] },
    ],
  },
  {
    title: 'View',
    rows: [
      { label: 'Zoom to fit', actions: ['view.zoomToFit'] },
      { label: 'Zoom to selection', actions: ['view.zoomToSelection'] },
      { label: 'Zoom to 100%', actions: ['view.zoom100'] },
      { label: 'Hide UI', actions: ['view.hideUi'] },
      { label: 'Undo', actions: ['edit.undo'] },
      { label: 'Redo', actions: ['edit.redo'] },
    ],
  },
  {
    title: 'Frames',
    rows: [
      { label: 'Nudge', gestures: ['Arrows'] },
      { label: 'Bigger nudge', gestures: [`${SHIFT} Arrows`] },
      { label: 'Resize', gestures: [`${MOD} Arrows`] },
      { label: 'Duplicate', actions: ['frame.duplicate'] },
      { label: 'Copy as PNG', actions: ['frame.copyPng'] },
      { label: 'Hide', actions: ['frame.hide'] },
      { label: 'Lock', actions: ['frame.lock'] },
      { label: 'Delete', actions: ['frame.delete'] },
    ],
  },
  {
    title: 'Arrange',
    rows: [
      {
        label: 'Align left, right',
        actions: ['arrange.alignLeft', 'arrange.alignRight'],
      },
      {
        label: 'Align top, bottom',
        actions: ['arrange.alignTop', 'arrange.alignBottom'],
      },
      {
        label: 'Center',
        actions: ['arrange.alignCenter', 'arrange.alignMiddle'],
      },
      {
        label: 'Distribute',
        actions: ['arrange.distributeHorizontal', 'arrange.distributeVertical'],
      },
      { label: 'Snap off while dragging', gestures: [`${CTRL} drag`] },
    ],
  },
  {
    title: 'Agents',
    rows: [
      { label: 'Next change', actions: ['changes.next'] },
      { label: 'Previous change', actions: ['changes.previous'] },
    ],
  },
]

/** The home view's sheet, its project keys beside the keys every screen shares. */
const HOME_SECTIONS: readonly Section[] = [
  {
    title: 'Projects',
    rows: [
      {
        label: 'Move between projects',
        gestures: ['Arrows'],
        characterGestures: ['H J K L'],
      },
      { label: 'First, last', gestures: ['Home', 'End'] },
      { label: 'Open', gestures: ['↵'] },
      { label: 'Rename', gestures: ['F2'] },
      { label: 'Delete', gestures: ['Delete'] },
      { label: 'Menu', gestures: [`${SHIFT} F10`] },
    ],
  },
  {
    title: 'General',
    rows: [
      { label: 'Command palette', actions: ['palette.open'] },
      { label: 'This list', actions: ['help.shortcuts'] },
      { label: 'Undo', actions: ['edit.undo'] },
      { label: 'Redo', actions: ['edit.redo'] },
    ],
  },
]

const ACTION_IDS = [...SECTIONS, ...HOME_SECTIONS].flatMap((section) =>
  section.rows.flatMap((row) => row.actions ?? []),
)

/**
 * The `?` sheet of every key the board binds, or on the home view the keys
 * that move between projects. Each action row reads its keys from the
 * registry, so it never drifts from what a press does, and greys out until
 * a row registers the action. A key the Single-key shortcuts switch has
 * turned off stays listed, drawn faint. It sits outside the routes, so it
 * reads the location itself.
 */
export function ShortcutsSheet() {
  const open = useOverlay() === 'shortcuts'
  const [home] = useRoute('/')
  const sections = home ? HOME_SECTIONS : SECTIONS
  const registered = useActions(ACTION_IDS)
  const byId = new Map<string, Action | undefined>(
    ACTION_IDS.map((id, index) => [id, registered[index]]),
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => openOverlay(next ? 'shortcuts' : null)}
    >
      <DialogContent
        showCloseButton={false}
        className="top-[90px] translate-y-0 gap-0 p-0 sm:max-w-[760px]"
      >
        <div className="flex h-12 items-center gap-4 border-b border-border px-4 text-[14px]">
          <DialogTitle className="text-[14px] leading-none font-semibold">
            Keyboard shortcuts
          </DialogTitle>
          <CharacterKeysSwitch />
          <span className="text-muted-foreground">Esc</span>
        </div>
        <div
          className={cn(
            'grid gap-x-7 gap-y-[18px] px-5 pt-4 pb-5',
            home ? 'grid-cols-[1.3fr_1fr_1fr]' : 'grid-cols-3',
          )}
        >
          {sections.map((section) => (
            <section key={section.title}>
              <h3 className="pb-1.5 text-label text-muted-foreground">
                {section.title}
              </h3>
              <ul>
                {section.rows.map((row) => (
                  <ShortcutRow
                    key={row.label}
                    row={row}
                    byId={byId}
                    spaced={home}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The Single-key shortcuts switch WCAG 2.1.4 asks for, which the palette
 * reaches too, as Turn single-key shortcuts off, while the keys are off.
 */
function CharacterKeysSwitch() {
  const on = useCharacterKeysOn()
  return (
    <label className="ml-auto flex items-center gap-2 text-body text-muted-foreground">
      Single-key shortcuts
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => setCharacterKeys(!on)}
        className="relative h-4 w-7 shrink-0 rounded-full bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring/50 aria-checked:bg-primary"
      >
        <span
          aria-hidden
          className={cn(
            'absolute top-0.5 left-0.5 size-3 rounded-full bg-background shadow-sm transition-transform motion-reduce:transition-none',
            on && 'translate-x-3',
          )}
        />
      </button>
    </label>
  )
}

/** `spaced` sets a gap between the label and its chips, which home draws and the board's tighter rows have no room for. */
function ShortcutRow({
  row,
  byId,
  spaced,
}: {
  row: Row
  byId: ReadonlyMap<string, Action | undefined>
  spaced: boolean
}) {
  const keysOn = useCharacterKeysOn()
  const chips = [
    ...(row.actions ?? []).flatMap((id) => {
      const key = byId.get(id)?.keys?.[0]
      if (!key) return []
      const text = keyParts(key).join(IS_MAC ? ' ' : '+')
      return [{ text, off: !keysOn && isCharacterKey(key) }]
    }),
    ...(row.gestures ?? []).map((text) => ({ text, off: false })),
    ...(row.characterGestures ?? []).map((text) => ({ text, off: !keysOn })),
  ]
  // A row of actions waits on them, while a gesture row has nothing to register.
  const waiting =
    row.actions !== undefined && row.actions.every((id) => !byId.get(id))
  return (
    <li
      aria-disabled={waiting || undefined}
      className={cn(
        'flex h-[26px] items-center justify-between aria-disabled:text-faint',
        spaced && 'gap-3.5',
      )}
    >
      <span className="whitespace-nowrap">{row.label}</span>
      <KbdGroup>
        {chips.map((chip) => (
          <Kbd
            key={chip.text}
            data-off={chip.off || undefined}
            className="px-1.5 text-label font-normal whitespace-nowrap data-off:text-faint"
          >
            {chip.text}
          </Kbd>
        ))}
      </KbdGroup>
    </li>
  )
}
