import { Slider } from '@base-ui/react/slider'
import { cn } from 'cn'
import { ChevronDown, Pipette } from 'lucide-react'
import { useState } from 'react'

import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
import { Input } from '@/client/components/ui/input'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/client/components/ui/tabs'
import type { TokenRow } from '@/shared/records/tokens'
import type { Theme } from '@/shared/theme'

import { ChromeMenuContent, MENU_ROW } from '../../../chrome/menu'
import { NumberField } from '../../number-field'
import { chipName, SWATCH_RING } from '../values'
import { SaturationArea } from './area'
import {
  hslToRgb,
  type Hsv,
  hsvToRgb,
  parseComputed,
  parseHex,
  rgbToHsl,
  rgbToHsv,
  toHex,
} from './space'

/** The color a picker holds: its hue, saturation, and value, and its opacity in percent. */
export interface PickedColor {
  hsv: Hsv
  percent: number
}

export type PickerTab = 'custom' | 'tokens'

type Mode = 'hex' | 'rgb' | 'hsl'

const MODES: readonly { mode: Mode; label: string }[] = [
  { mode: 'hex', label: 'Hex' },
  { mode: 'rgb', label: 'RGB' },
  { mode: 'hsl', label: 'HSL' },
]

const TAB =
  'h-6 rounded-[5px] border-0 text-xs font-medium text-muted-foreground data-active:bg-card data-active:text-foreground data-active:shadow-none data-active:ring-1 data-active:ring-border dark:data-active:bg-card'

const PERCENT: Intl.NumberFormatOptions = {
  style: 'unit',
  unit: 'percent',
  maximumFractionDigits: 0,
}

/** The browser's eyedropper, which Chromium ships and the DOM typings do not yet carry. */
interface EyeDropperApi {
  open: () => Promise<{ sRGBHex: string }>
}

function eyeDropper(): EyeDropperApi | null {
  const Constructor = (
    window as unknown as { EyeDropper?: new () => EyeDropperApi }
  ).EyeDropper
  return Constructor ? new Constructor() : null
}

interface ColorPickerPanelProps {
  /** Names the paint the picker colors, such as `Fill`. */
  label: string
  color: PickedColor
  /** Reports every change made in the picker, which the row previews. */
  onColor: (color: PickedColor) => void
  /** Enter in the hex field, which writes the color and closes the picker. */
  onSubmit: () => void
  tab: PickerTab
  onTab: (tab: PickerTab) => void
  tokens: readonly TokenRow[]
  theme: Theme
  /** The token the paint names now, ringed among the swatches. */
  token: string | null
  onToken: (name: string) => void
}

/**
 * The picker's body, as the intake's `color-picker-fix` frame draws it:
 * Custom holds the saturation square, hue and opacity bars, an eyedropper
 * where the browser has one, a hex field switchable to RGB or HSL beside
 * the opacity percent, and the project's tokens as swatches, and Tokens
 * lists them by name.
 */
export function ColorPickerPanel({
  label,
  color,
  onColor,
  onSubmit,
  tab,
  onTab,
  tokens,
  theme,
  token,
  onToken,
}: ColorPickerPanelProps) {
  const [mode, setMode] = useState<Mode>('hex')
  const rgb = hsvToRgb(color.hsv)
  const hex = toHex(rgb)
  const dropper = typeof window !== 'undefined' && 'EyeDropper' in window
  const setHsv = (hsv: Hsv) => onColor({ ...color, hsv })
  // A grey carries no hue, so the bar keeps the one the developer chose.
  const setRgb = (next: { r: number; g: number; b: number }) => {
    const hsv = rgbToHsv({ ...next, a: 1 })
    setHsv(hsv.s === 0 ? { ...hsv, h: color.hsv.h } : hsv)
  }

  return (
    <Tabs
      value={tab}
      onValueChange={(next: PickerTab) => onTab(next)}
      className="gap-0"
    >
      <TabsList className="mb-2.5 h-7 w-full shrink-0 rounded-[7px] p-0.5">
        <TabsTrigger value="custom" className={TAB}>
          Custom
        </TabsTrigger>
        <TabsTrigger value="tokens" className={TAB}>
          Tokens
        </TabsTrigger>
      </TabsList>
      <TabsContent value="custom" className="text-xs">
        <SaturationArea hsv={color.hsv} onChange={setHsv} />
        <div className="mt-2.5 flex items-center gap-2">
          {dropper ? (
            <button
              type="button"
              aria-label="Pick a color from the screen"
              onClick={() => {
                void eyeDropper()
                  ?.open()
                  .then(({ sRGBHex }) => {
                    const picked = parseComputed(sRGBHex)
                    if (picked) setRgb(picked)
                  })
                  .catch(() => {})
              }}
              className="grid size-5 shrink-0 place-items-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <Pipette aria-hidden className="size-3.5" />
            </button>
          ) : null}
          <div className="flex flex-1 flex-col gap-1.5">
            <Bar
              label="Hue"
              value={color.hsv.h}
              max={360}
              onChange={(h) => setHsv({ ...color.hsv, h })}
              background="linear-gradient(to right, red, #ff0, lime, cyan, blue, #f0f, red)"
            />
            <Bar
              label="Opacity"
              value={color.percent}
              max={100}
              onChange={(percent) => onColor({ ...color, percent })}
              background={`linear-gradient(to right, transparent, #${hex}), repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0 / 8px 8px`}
            />
          </div>
        </div>
        <div className="mt-2.5 flex gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Color format"
              className="flex h-[26px] shrink-0 items-center gap-1 rounded-md bg-input px-2 text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {MODES.find((entry) => entry.mode === mode)?.label}
              <ChevronDown aria-hidden className="size-2.5" />
            </DropdownMenuTrigger>
            <ChromeMenuContent align="start" sideOffset={6} className="w-28">
              {MODES.map((entry) => (
                <DropdownMenuItem
                  key={entry.mode}
                  className={MENU_ROW}
                  onClick={() => setMode(entry.mode)}
                >
                  {entry.label}
                </DropdownMenuItem>
              ))}
            </ChromeMenuContent>
          </DropdownMenu>
          {mode === 'hex' ? (
            <HexField hex={hex} onHex={setRgb} onSubmit={onSubmit} />
          ) : mode === 'rgb' ? (
            <Channels
              values={[rgb.r, rgb.g, rgb.b].map(Math.round)}
              names={['Red', 'Green', 'Blue']}
              maxes={[255, 255, 255]}
              onChange={([r = 0, g = 0, b = 0]) => setRgb({ r, g, b })}
            />
          ) : (
            <HslChannels hsv={color.hsv} onChange={setRgb} />
          )}
          <NumberField
            label={`${label} opacity`}
            className="w-14 shrink-0"
            inputClassName="text-right"
            value={color.percent}
            min={0}
            max={100}
            format={PERCENT}
            disabled={false}
            onCommit={(change) =>
              onColor({ ...color, percent: change(color.percent) })
            }
          />
        </div>
        {tokens.length > 0 ? (
          <div className="mt-2.5 border-t border-border pt-2">
            <p className="mb-1.5 text-label font-semibold text-muted-foreground">
              Tokens
            </p>
            <div className="grid grid-cols-7 gap-1.5">
              {tokens.map((row) => (
                <button
                  key={row.name}
                  type="button"
                  aria-label={chipName(row.name)}
                  aria-pressed={row.name === token}
                  title={chipName(row.name)}
                  onClick={() => onToken(row.name)}
                  className={cn(
                    'aspect-square rounded-[5px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50 aria-pressed:shadow-[0_0_0_2px_var(--primary)]',
                    SWATCH_RING,
                  )}
                  style={{ background: row[theme] ?? undefined }}
                />
              ))}
            </div>
          </div>
        ) : null}
      </TabsContent>
      <TabsContent value="tokens" className="text-xs">
        {tokens.length === 0 ? (
          <p className="text-muted-foreground">
            This project names no color tokens.
          </p>
        ) : (
          <ul
            aria-label={`${label} tokens`}
            className="-mx-1 flex max-h-56 flex-col overflow-y-auto"
          >
            {tokens.map((row) => (
              <li key={row.name}>
                <button
                  type="button"
                  aria-pressed={row.name === token}
                  onClick={() => onToken(row.name)}
                  className="flex h-7 w-full items-center gap-2 rounded-md px-1.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 aria-pressed:bg-accent"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'size-3.5 shrink-0 rounded-[3px]',
                      SWATCH_RING,
                    )}
                    style={{ background: row[theme] ?? undefined }}
                  />
                  {chipName(row.name)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>
    </Tabs>
  )
}

interface BarProps {
  label: string
  value: number
  max: number
  onChange: (value: number) => void
  background: string
}

/** A hue or opacity bar on base-ui's `Slider`, its track painted with what it picks. */
function Bar({ label, value, max, onChange, background }: BarProps) {
  return (
    <Slider.Root
      value={value}
      max={max}
      onValueChange={(next) =>
        onChange(Array.isArray(next) ? (next[0] ?? 0) : next)
      }
    >
      <Slider.Control className="flex h-3.5 touch-none items-center select-none">
        <Slider.Track
          className="h-2.5 w-full rounded-full select-none"
          style={{ background }}
        >
          <Slider.Thumb
            aria-label={label}
            className="size-3.5 rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,.35)] select-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50"
          />
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  )
}

interface HexFieldProps {
  hex: string
  onHex: (rgb: { r: number; g: number; b: number }) => void
  onSubmit: () => void
}

/** Six hex digits, applied as soon as they read as a color, and Enter writes it. */
function HexField({ hex, onHex, onSubmit }: HexFieldProps) {
  const [draft, setDraft] = useState(hex)
  // A color picked elsewhere in the picker replaces the digits, unless they already spell it.
  const [shown, setShown] = useState(hex)
  if (shown !== hex) {
    setShown(hex)
    const typed = parseHex(draft)
    if (!typed || toHex(typed) !== hex) setDraft(hex)
  }
  return (
    <Input
      aria-label="Hex"
      className="flex-1"
      value={draft}
      spellCheck={false}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => {
        const typed = event.currentTarget.value
        setDraft(typed)
        const parsed = /^#?[0-9a-f]{6}$/i.test(typed.trim())
          ? parseHex(typed)
          : null
        if (parsed) onHex(parsed)
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        onSubmit()
      }}
    />
  )
}

interface ChannelsProps {
  values: readonly number[]
  names: readonly string[]
  maxes: readonly number[]
  onChange: (values: number[]) => void
}

/** One number field per channel, each stepping and scrubbing from its letter. */
function Channels({ values, names, maxes, onChange }: ChannelsProps) {
  return (
    <div className="grid flex-1 grid-cols-3 gap-1">
      {names.map((name, at) => (
        <NumberField
          key={name}
          label={name}
          prefix={name[0]}
          inset="pl-[26px]"
          inputClassName="pr-1"
          value={values[at] ?? 0}
          min={0}
          max={maxes[at]}
          format={{ maximumFractionDigits: 0 }}
          disabled={false}
          onCommit={(change) =>
            onChange(
              values.map((value, index) =>
                index === at ? change(value) : value,
              ),
            )
          }
        />
      ))}
    </div>
  )
}

function HslChannels({
  hsv,
  onChange,
}: {
  hsv: Hsv
  onChange: (rgb: { r: number; g: number; b: number }) => void
}) {
  const hsl = rgbToHsl(hsvToRgb(hsv))
  return (
    <Channels
      values={[hsv.h, hsl.s, hsl.l].map(Math.round)}
      names={['Hue', 'Saturation', 'Lightness']}
      maxes={[360, 100, 100]}
      onChange={([h = 0, s = 0, l = 0]) => onChange(hslToRgb({ h, s, l }))}
    />
  )
}
