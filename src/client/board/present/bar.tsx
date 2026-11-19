import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  type LucideIcon,
  Maximize,
  MonitorSpeaker,
  X,
} from 'lucide-react'

import { RotateLabel } from '../device/poses'

interface PresentBarProps {
  shown: boolean
  /** Whether the overview covers the bar, which then takes no focus or press. */
  covered: boolean
  /** One-based, as the count reads. */
  at: number
  count: number
  /** How many of the frame's steps show, and how many it holds, 0 for a frame with none. */
  step: number
  steps: number
  name: string
  /** Whether this window is full screen, which the Full screen button shows pressed. */
  fullscreen: boolean
  onPrevious: () => void
  onNext: () => void
  onOverview: () => void
  onPresenter: () => void
  onFullscreen: () => void
  onLeave: () => void
  /** Whether a slide in the deck turns, which holds Rotate's width on every slide so nothing moves. */
  rotateSlot?: boolean
  /** Turns the shown slide, absent while it is no phone, tablet, or foldable or the tab cannot write. */
  onRotate?: () => void
  /** Why the shown slide cannot turn, which turns Rotate off and names the reason. */
  rotateOff?: string
}

/**
 * The present bar per `canon/design/present/bar`, its colors its own since it
 * sits over black in either theme.
 */
export function PresentBar({
  shown,
  covered,
  at,
  count,
  step,
  steps,
  name,
  fullscreen,
  onPrevious,
  onNext,
  onOverview,
  onPresenter,
  onFullscreen,
  onLeave,
  rotateSlot = false,
  onRotate,
  rotateOff,
}: PresentBarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Presenting"
      inert={covered}
      data-shown={shown || undefined}
      className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-[10px] bg-[rgba(30,30,30,.82)] p-1 text-body text-[#eee] opacity-0 backdrop-blur-[8px] focus-within:opacity-100 hover:opacity-100 data-shown:opacity-100 motion-safe:transition-opacity motion-safe:duration-200"
    >
      <BarButton
        label="Previous frame"
        icon={ChevronLeft}
        disabled={at <= 1 && step <= 0}
        onClick={onPrevious}
      />
      {/* Wide enough for the deck's last count, so passing 9 to 10 moves nothing. */}
      <span
        style={{ minWidth: `calc(${`${count} / ${count}`.length}ch + 1rem)` }}
        className="px-2 text-center whitespace-nowrap text-[#ddd] tabular-nums select-none"
      >
        {at} / {count}
      </span>
      <BarButton
        label="Next frame"
        icon={ChevronRight}
        disabled={at >= count && step >= steps}
        onClick={onNext}
      />
      <BarButton
        label="Slide overview"
        icon={LayoutGrid}
        onClick={onOverview}
      />
      {onRotate ? (
        <RotateButton off={rotateOff} onClick={onRotate} />
      ) : rotateSlot ? (
        <span aria-hidden className={`${ROTATE_CLASS} invisible`}>
          <RotateLabel />
        </span>
      ) : null}
      <StepSlot step={step} steps={steps} />
      <Separator />
      <span className="w-[150px] truncate px-2 text-[#aaa]">{name}</span>
      <Separator />
      <BarButton
        label="Presenter view"
        icon={MonitorSpeaker}
        onClick={onPresenter}
      />
      <BarButton
        label="Full screen"
        icon={Maximize}
        pressed={fullscreen}
        onClick={onFullscreen}
      />
      <BarButton label="Leave presenting" icon={X} onClick={onLeave} />
    </div>
  )
}

function BarButton({
  label,
  icon: Icon,
  disabled = false,
  pressed,
  onClick,
}: {
  label: string
  icon: LucideIcon
  disabled?: boolean
  /** Set on a toggle alone, which then reads as pressed or not. */
  pressed?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onClick()
      }}
      className="grid size-[30px] place-items-center rounded-[7px] outline-none hover:bg-white/10 aria-pressed:bg-white/15 focus-visible:ring-3 focus-visible:ring-[#4e92f6] aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent"
    >
      <Icon aria-hidden className="size-4" strokeWidth={1.6} />
    </button>
  )
}

/** Past this many, dots stop being countable at their size, so the slot reads as text. */
const MOST_DOTS = 6

/**
 * The steps at one width on every slide, sized for six dots, so Next and Leave
 * never move when a stepped slide arrives.
 */
function StepSlot({ step, steps }: { step: number; steps: number }) {
  const slot =
    'flex w-[57px] shrink-0 items-center justify-center gap-[3px] px-1.5'
  if (steps === 0) return <span aria-hidden className={slot} />
  return (
    <span role="img" aria-label={`Step ${step} of ${steps}`} className={slot}>
      {steps > MOST_DOTS ? (
        <span
          aria-hidden
          className="text-[#ddd] tabular-nums whitespace-nowrap select-none"
        >
          {step}/{steps}
        </span>
      ) : (
        Array.from({ length: steps }, (_, index) => index + 1).map((number) => (
          <span
            key={number}
            aria-hidden
            data-filled={number <= step || undefined}
            className="size-[5px] rounded-full bg-[#5a5a5a] data-filled:bg-[#ddd]"
          />
        ))
      )}
    </span>
  )
}

const ROTATE_CLASS =
  'flex h-[30px] items-center gap-1 rounded-[7px] px-2 whitespace-nowrap'

/** Rotate after the slide count, as `canon/design/present/rotate` draws it, in the bar's own colors. */
function RotateButton({ off, onClick }: { off?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-disabled={off ? true : undefined}
      title={off}
      onClick={() => {
        if (!off) onClick()
      }}
      className={`${ROTATE_CLASS} bg-white/10 text-[#fff] outline-none hover:bg-white/15 focus-visible:ring-3 focus-visible:ring-[#4e92f6] aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-white/10`}
    >
      <RotateLabel />
    </button>
  )
}

function Separator() {
  return <span aria-hidden className="mx-1 h-[18px] w-px bg-[#444]" />
}
