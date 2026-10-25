import { cn } from 'cn'

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
 */
interface Row {
  label: string
  actions?: readonly string[]
  gestures?: readonly string[]
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

const ACTION_IDS = SECTIONS.flatMap((section) =>
  section.rows.flatMap((row) => row.actions ?? []),
)

/**
 * The `?` sheet of every key the board binds. Each action row reads its keys
 * from the registry, so it never drifts from what a press does, and greys
 * out until a row registers the action. A key the Single-key shortcuts
 * switch has turned off stays listed, drawn faint.
 */
export function ShortcutsSheet() {
  const open = useOverlay() === 'shortcuts'
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
        <div className="grid grid-cols-3 gap-x-7 gap-y-[18px] px-5 pt-4 pb-5">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h3 className="pb-1.5 text-label text-muted-foreground">
                {section.title}
              </h3>
              <ul>
                {section.rows.map((row) => (
                  <ShortcutRow key={row.label} row={row} byId={byId} />
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

function ShortcutRow({
  row,
  byId,
}: {
  row: Row
  byId: ReadonlyMap<string, Action | undefined>
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
  ]
  // A row of actions waits on them, while a gesture row has nothing to register.
  const waiting =
    row.actions !== undefined && row.actions.every((id) => !byId.get(id))
  return (
    <li
      aria-disabled={waiting || undefined}
      className="flex h-[26px] items-center justify-between aria-disabled:text-faint"
    >
      <span>{row.label}</span>
      <KbdGroup>
        {chips.map((chip) => (
          <Kbd
            key={chip.text}
            data-off={chip.off || undefined}
            className="px-1.5 text-label font-normal data-off:text-faint"
          >
            {chip.text}
          </Kbd>
        ))}
      </KbdGroup>
    </li>
  )
}
