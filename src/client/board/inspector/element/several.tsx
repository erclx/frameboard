import { cn } from '@/client/lib/cn'
import { useLive } from '@/client/live/store'
import { useFrameTheme } from '@/client/theme/store'
import type { StyleValue } from '@/shared/records/elements'
import type { FrameRecord } from '@/shared/records/list'
import type { TokenRow } from '@/shared/records/tokens'
import type { Theme } from '@/shared/theme'

import { ActionTooltip } from '../../chrome/action-tooltip'
import { placeFreeAll } from '../../place/write'
import { type ElementKey, useSelection } from '../../selection'
import { useTokenTable } from '../../tokens'
import { type NumberChange, NumberField } from '../number-field'
import { SelectionColors } from '../selection-colors'
import { OpacityIcon, RadiusIcon } from './appearance'
import { ColorRow } from './color-row'
import { faceOf, familyIn, familyOptions, firstFamily } from './families'
import { ColorSection, type ColorSectionProps } from './fill'
import { FREE_TIP } from './position'
import { ShadowSection } from './shadow'
import { sizeDeclarations } from './size-declarations'
import {
  type ElementMember,
  freeSpot,
  mergeColors,
  previewStyle,
  sharedValue,
  useElementMembers,
} from './styles'
import { TypePicker } from './typography'
import { TOKEN_CHIP } from './values'
import { weightLabel, weightsOf } from './weights'
import { type ElementChange, writeElements } from './write'

const WHOLE: Intl.NumberFormatOptions = { maximumFractionDigits: 0 }
const PERCENT: Intl.NumberFormatOptions = {
  style: 'unit',
  unit: 'percent',
  maximumFractionDigits: 0,
}
/** A computed size can carry a fraction, as `styles.ts` reads it to two places. */
const SIZE: Intl.NumberFormatOptions = { maximumFractionDigits: 2 }

/** `Mixed` reads quieter than a value, as `inspector/multi-elements` draws it. */
const MIXED_FIELD = 'placeholder:text-muted-foreground placeholder:italic'

const SECTION = 'border-b border-sidebar-border px-3 pt-2.5 pb-3'

/** Sends a change to each member `change` names one for, as one write. */
type Fan = (
  holders: readonly ElementMember[],
  change: (member: ElementMember) => ElementChange | null,
) => Promise<boolean>

/**
 * `· 1 of 3` beside a section's title, while only some members hold what it
 * edits, which an edit there writes on those alone.
 */
function PartOf({ count, total }: { count: number; total: number }) {
  if (count === total) return null
  return (
    <span className="text-caption font-normal text-muted-foreground">
      {' '}
      · {count} of {total}
    </span>
  )
}

interface SharedNumberProps {
  holders: readonly ElementMember[]
  /** The value each member shows, which a step moves from. */
  read: (member: ElementMember) => number
  /** The change a value writes on one member, and the declaration a preview shows it through. */
  write: (member: ElementMember, value: number) => ElementChange | null
  preview: { property: string; css: (value: number) => string }
  fan: Fan
}

/** A number field's value and handlers over several members: `Mixed` where they differ, a step moving each from its own. */
function sharedNumber({
  holders,
  read,
  write,
  preview,
  fan,
}: SharedNumberProps): {
  value: number | null
  inputClassName: string
  onPreview: (change: NumberChange | null) => void
  onCommit: (change: NumberChange) => Promise<boolean>
} {
  return {
    value: sharedValue(holders.map(read)),
    inputClassName: MIXED_FIELD,
    onPreview: (change) => {
      for (const member of holders) {
        previewStyle(
          member.key,
          preview.property,
          change ? preview.css(change(read(member))) : null,
        )
      }
    },
    onCommit: (change) =>
      fan(holders, (member) => write(member, change(read(member)))),
  }
}

interface SeveralElementsProps {
  page: string
  frame: FrameRecord
  elements: readonly ElementKey[]
}

/**
 * Several selected elements' sections as `inspector/multi-elements` draws
 * them: `<n> elements` over every section any of them has, `Mixed` where their
 * values differ, and `1 of 3` on a section only some hold, whose edit writes
 * those alone. An edit lands as one write and one undo step. Rotation, the
 * flow, gap, padding, and the finer type fields stay on one element at a time,
 * as the picked frame leaves them out.
 */
export function SeveralElements({
  page,
  frame,
  elements,
}: SeveralElementsProps) {
  const canWrite = useLive((state) => state.canWrite)
  const theme = useFrameTheme(frame.ref)
  const members = useElementMembers(elements)
  const using = useSelection((state) => state.using)
  const table = useTokenTable(frame.ref.split('/')[0] ?? '')
  const tokens = table?.tokens ?? []
  const colors = tokens.filter(
    (row) => row.group === 'color' && !row.name.startsWith('--shadow'),
  )
  const disabled = !canWrite
  const hash = sharedValue(members?.map(({ styles }) => styles?.hash) ?? [])
  const fan: Fan = (holders, change) =>
    writeElements(
      page,
      holders.flatMap((member) => {
        const made = change(member)
        return made ? [{ key: member.key, change: made }] : []
      }),
    )
  return (
    <>
      <section
        aria-labelledby="inspector-elements"
        className={cn(SECTION, 'flex items-center gap-1.5')}
      >
        <h2 id="inspector-elements" className="shrink-0 text-xs font-semibold">
          {elements.length} elements
        </h2>
        {using ? (
          <span className="min-w-0 truncate text-muted-foreground">
            · using {using}
          </span>
        ) : null}
        <span className="ml-auto min-w-0 truncate pl-1 text-muted-foreground">
          in {frame.name}
        </span>
      </section>
      {members ? (
        <>
          <PositionPart
            page={page}
            members={members}
            disabled={disabled}
            fan={fan}
          />
          <SizePart members={members} disabled={disabled} fan={fan} />
          <AppearancePart members={members} disabled={disabled} fan={fan} />
          <TypePart
            members={members}
            fonts={tokens.filter((row) => row.group === 'font')}
            disabled={disabled}
            fan={fan}
          />
          <PaintPart
            title="Fill"
            members={members}
            stated={statedFill}
            property={fillProperty}
            addValue={colors[0] ? `var(${colors[0].name})` : null}
            tokens={colors}
            theme={theme}
            disabled={disabled}
            fan={fan}
          />
          {members.some(({ live }) => live.bordered) ? (
            <PaintPart
              title="Stroke"
              members={members}
              stated={statedStroke}
              property={() => 'border-color'}
              addValue={null}
              tokens={colors}
              theme={theme}
              disabled={disabled}
              fan={fan}
            />
          ) : null}
          <ShadowPart
            members={members}
            shadows={tokens.filter(({ name }) => name.startsWith('--shadow'))}
            theme={theme}
            disabled={disabled}
            fan={fan}
          />
          <SelectionColors
            key={elements.map(({ index }) => index).join(':')}
            colors={mergeColors(
              members.map(({ styles }) => styles?.colors ?? []),
            )}
            tokens={colors}
            theme={theme}
            selectIn={hash ? { page, frame: frame.ref, hash } : undefined}
          />
        </>
      ) : (
        <p className="px-3 pt-2.5 pb-3 text-muted-foreground">
          The elements’ details show once their frame is on screen.
        </p>
      )}
    </>
  )
}

interface PartProps {
  members: readonly ElementMember[]
  disabled: boolean
  fan: Fan
}

function PositionPart({
  page,
  members,
  disabled,
  fan,
}: PartProps & { page: string }) {
  const free = members.filter(({ live }) => live.placement.free)
  const allFree = free.length === members.length
  const choose = (toFree: boolean) => {
    const moving = members.filter(({ live }) => live.placement.free !== toFree)
    void placeFreeAll(
      page,
      moving.map(({ key, live, styles }) => ({
        key,
        inline: live.placement.inline,
        spot: toFree
          ? freeSpot(
              live.placement,
              styles?.element?.flow !== undefined &&
                styles.element.flow.size.width !== 'fixed',
            )
          : null,
      })),
    )
  }
  const options = [
    { label: 'In flow', on: free.length === 0, value: false },
    { label: 'Free', on: allFree, value: true },
  ]
  return (
    <section aria-labelledby="inspector-position" className={SECTION}>
      <h2 id="inspector-position" className="mb-2 text-xs font-semibold">
        Position
        <PartOf count={free.length || members.length} total={members.length} />
      </h2>
      <div
        role="group"
        aria-label="Placement"
        className="flex gap-0.5 rounded-md bg-input p-0.5"
      >
        {options.map(({ label, on, value }) => {
          const button = (
            <button
              key={label}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => {
                if (!on) choose(value)
              }}
              className={cn(
                'flex h-5 flex-1 items-center justify-center rounded-[5px] px-2 text-[11px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
                on && 'bg-sidebar text-foreground shadow-xs',
              )}
            >
              {label}
            </button>
          )
          return value ? (
            <ActionTooltip key={label} label={FREE_TIP} side="bottom">
              {button}
            </ActionTooltip>
          ) : (
            button
          )
        })}
      </div>
      {free.length > 0 ? (
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {(['left', 'top'] as const).map((side) => (
            <NumberField
              key={side}
              prefix={side === 'left' ? 'X' : 'Y'}
              label={`${side === 'left' ? 'X' : 'Y'} position in its parent`}
              format={WHOLE}
              disabled={disabled}
              {...sharedNumber({
                holders: free,
                read: ({ live }) => live.placement[side],
                write: (_member, value) => ({
                  kind: 'style',
                  property: side,
                  value: `${value}px`,
                }),
                preview: { property: side, css: (value) => `${value}px` },
                fan,
              })}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}

function SizePart({ members, disabled, fan }: PartProps) {
  return (
    <section aria-labelledby="inspector-layout" className={SECTION}>
      <h2 id="inspector-layout" className="mb-2 text-xs font-semibold">
        Layout
      </h2>
      <p className="mb-[3px] ml-0.5 text-caption text-muted-foreground">Size</p>
      <div className="grid grid-cols-2 gap-1.5">
        {(['width', 'height'] as const).map((axis) => (
          <NumberField
            key={axis}
            prefix={axis === 'width' ? 'W' : 'H'}
            label={axis === 'width' ? 'Width' : 'Height'}
            min={0}
            format={WHOLE}
            disabled={disabled}
            {...sharedNumber({
              holders: members,
              read: ({ live }) =>
                axis === 'width' ? live.layout.width : live.layout.height,
              write: ({ live, styles }, value) => ({
                kind: 'styles',
                declarations: sizeDeclarations(
                  live.layout,
                  axis,
                  styles?.element?.flow?.size[axis] ?? null,
                  'fixed',
                  Math.max(0, value),
                ),
              }),
              preview: {
                property: axis,
                css: (value) => `${Math.max(0, value)}px`,
              },
              fan,
            })}
          />
        ))}
      </div>
    </section>
  )
}

function AppearancePart({ members, disabled, fan }: PartProps) {
  return (
    <section aria-labelledby="inspector-appearance" className={SECTION}>
      <h2 id="inspector-appearance" className="mb-2 text-xs font-semibold">
        Appearance
      </h2>
      <div className="grid grid-cols-2 gap-1.5">
        <NumberField
          label="Opacity"
          caption="Opacity"
          prefix={<OpacityIcon />}
          inset="pl-[28px]"
          min={0}
          max={100}
          format={PERCENT}
          disabled={disabled}
          {...sharedNumber({
            holders: members,
            read: ({ live }) => Math.round(live.opacity * 100),
            write: (_member, value) => ({
              kind: 'style',
              property: 'opacity',
              value: String(value / 100),
            }),
            preview: {
              property: 'opacity',
              css: (value) => String(value / 100),
            },
            fan,
          })}
        />
        <NumberField
          label="Corner radius"
          caption="Corner radius"
          prefix={<RadiusIcon />}
          inset="pl-[28px]"
          min={0}
          format={WHOLE}
          disabled={disabled}
          {...sharedNumber({
            holders: members,
            read: ({ live }) => live.radius,
            write: (_member, value) => ({
              kind: 'style',
              property: 'border-radius',
              value: `${value}px`,
            }),
            preview: {
              property: 'border-radius',
              css: (value) => `${value}px`,
            },
            fan,
          })}
        />
      </div>
    </section>
  )
}

function TypePart({
  members,
  fonts,
  disabled,
  fan,
}: PartProps & { fonts: readonly TokenRow[] }) {
  const holders = members.filter(({ live }) => live.holdsText)
  const [first] = holders
  if (!first) return null
  const families = familyOptions(fonts)
  const familyOf = ({ live, styles }: ElementMember) =>
    familyIn(
      live.fontFamily,
      styles?.element?.fontFamily?.token ?? null,
      families,
    )
  const shared = sharedValue(
    holders.map((member) => familyOf(member)?.value ?? member.live.fontFamily),
  )
  const family = shared === null ? null : familyOf(first)
  const weight = sharedValue(holders.map(({ live }) => live.fontWeight))
  const weights = weightsOf(faceOf(first.live.fontFamily))
  const styleAll = (property: string, value: string) =>
    void fan(holders, () => ({ kind: 'style', property, value }))
  return (
    <section aria-labelledby="inspector-typography" className={SECTION}>
      <h2 id="inspector-typography" className="mb-2 text-xs font-semibold">
        Typography
        <PartOf count={holders.length} total={members.length} />
      </h2>
      <div className="grid grid-cols-2 gap-1.5">
        <TypePicker
          label="Font family"
          shown={
            shared === null ? (
              <MixedLabel />
            ) : family?.token ? (
              <span className={TOKEN_CHIP}>{family.name}</span>
            ) : (
              (family?.name ?? firstFamily(first.live.fontFamily))
            )
          }
          current={family?.value ?? null}
          options={families.map(({ value, name, stack }) => ({
            value,
            name,
            font: stack,
          }))}
          disabled={disabled}
          onPick={(value) => styleAll('font-family', value)}
          className="col-span-2"
        />
        <TypePicker
          label="Font weight"
          shown={
            weight === null ? <MixedLabel /> : weightLabel(weight, weights)
          }
          current={weight === null ? null : String(weight)}
          options={weights.map(({ value, name }) => ({
            value: String(value),
            name,
          }))}
          disabled={disabled}
          onPick={(value) => styleAll('font-weight', value)}
        />
        <NumberField
          label="Font size"
          prefix="Size"
          inset="pl-[40px]"
          min={1}
          format={SIZE}
          disabled={disabled}
          {...sharedNumber({
            holders,
            read: ({ live }) => live.fontSize,
            write: (_member, value) => ({
              kind: 'style',
              property: 'font-size',
              value: `${value}px`,
            }),
            preview: { property: 'font-size', css: (value) => `${value}px` },
            fan,
          })}
        />
      </div>
    </section>
  )
}

function MixedLabel() {
  return <span className="text-muted-foreground italic">Mixed</span>
}

/** What a member's own fill property is, its text color when it holds text alone. */
function fillProperty({ live }: ElementMember): string {
  return live.textOnly ? 'color' : 'background-color'
}

function statedFill({ live, styles }: ElementMember): StyleValue | null {
  const own = styles?.element
  const stated = live.textOnly ? own?.color : own?.backgroundColor
  return stated && stated.value.trim().toLowerCase() !== 'transparent'
    ? stated
    : null
}

/** A border drawn in the current color states none, which the row shows as that. */
function statedStroke({ live, styles }: ElementMember): StyleValue | null {
  if (!live.bordered) return null
  return (
    styles?.element?.borderColor ?? {
      value: 'currentcolor',
      token: null,
      percent: 100,
    }
  )
}

function paintKey({ token, value, percent }: StyleValue): string {
  return `${token ?? value.toLowerCase()}:${percent}`
}

interface PaintPartProps extends PartProps {
  title: ColorSectionProps['title']
  stated: (member: ElementMember) => StyleValue | null
  property: (member: ElementMember) => string
  /** What `+` writes on the members holding no paint, null where it offers nothing. */
  addValue: string | null
  tokens: readonly TokenRow[]
  theme: Theme
}

/** Fill or Stroke over several members: one row, `Mixed` where their paints differ, writing those holding one. */
function PaintPart({
  title,
  members,
  stated,
  property,
  addValue,
  tokens,
  theme,
  disabled,
  fan,
}: PaintPartProps) {
  const holders = members.filter((member) => stated(member) !== null)
  const lacking = members.filter((member) => stated(member) === null)
  const value = holders[0] ? stated(holders[0]) : null
  const mixed =
    sharedValue(
      holders.map((member) => {
        const paint = stated(member)
        return paint ? paintKey(paint) : ''
      }),
    ) === null
  return (
    <ColorSection
      title={title}
      note={
        holders.length > 0 ? (
          <PartOf count={holders.length} total={members.length} />
        ) : null
      }
      add={{
        label: `Add ${title.toLowerCase()}`,
        disabled: disabled || addValue === null || lacking.length === 0,
        onAdd: () => {
          if (addValue === null) return
          void fan(lacking, (member) => ({
            kind: 'style',
            property: property(member),
            value: addValue,
          }))
        },
      }}
    >
      {value ? (
        <ColorRow
          label={title}
          value={value}
          mixed={mixed}
          tokens={tokens}
          theme={theme}
          disabled={disabled}
          onWrite={(css) =>
            fan(holders, (member) => ({
              kind: 'style',
              property: property(member),
              value: css,
            }))
          }
          onPreview={(css) => {
            for (const member of holders) {
              previewStyle(member.key, property(member), css)
            }
          }}
        />
      ) : null}
    </ColorSection>
  )
}

function ShadowPart({
  members,
  shadows,
  theme,
  disabled,
  fan,
}: PartProps & { shadows: readonly TokenRow[]; theme: Theme }) {
  const shadowOf = ({ styles }: ElementMember) => {
    const shadow = styles?.element?.boxShadow
    return shadow && shadow.value.trim().toLowerCase() !== 'none'
      ? shadow
      : null
  }
  const holders = members.filter((member) => shadowOf(member) !== null)
  const [first] = holders
  if (!first) return null
  const mixed =
    sharedValue(
      holders.map((member) => {
        const shadow = shadowOf(member)
        return shadow ? (shadow.token ?? shadow.value) : ''
      }),
    ) === null
  return (
    <ShadowSection
      boxShadow={shadowOf(first)}
      mixed={mixed}
      note={<PartOf count={holders.length} total={members.length} />}
      shadows={shadows}
      theme={theme}
      disabled={disabled}
      write={(change) => fan(holders, () => change)}
    />
  )
}
