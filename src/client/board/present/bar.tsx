import { ChevronLeft, ChevronRight, type LucideIcon, X } from 'lucide-react'
interface PresentBarProps {
  shown: boolean
  /** One-based, as the count reads. */
  at: number
  count: number
  name: string
  onPrevious: () => void
  onNext: () => void
  onLeave: () => void
}

/**
 * The bar at the foot of a presented frame, holding back, the count, the
 * frame's name, next, and leave, as `canon/design/present/bar` draws it. It
 * sits over black in either theme, so its colors are its own. It stays while
 * the pointer rests on it or focus is inside it, and fades with no motion
 * under reduced motion.
 */
export function PresentBar({
  shown,
  at,
  count,
  name,
  onPrevious,
  onNext,
  onLeave,
}: PresentBarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Presenting"
      data-shown={shown || undefined}
      className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-[10px] bg-[rgba(30,30,30,.82)] p-1 text-body text-[#eee] opacity-0 backdrop-blur-[8px] focus-within:opacity-100 hover:opacity-100 data-shown:opacity-100 motion-safe:transition-opacity motion-safe:duration-200"
    >
      <BarButton
        label="Previous frame"
        icon={ChevronLeft}
        disabled={at <= 1}
        onClick={onPrevious}
      />
      <span className="px-2 text-[#ddd] tabular-nums select-none">
        {at} / {count}
      </span>
      <BarButton
        label="Next frame"
        icon={ChevronRight}
        disabled={at >= count}
        onClick={onNext}
      />
      <Separator />
      <span className="w-[150px] truncate px-2 text-[#aaa]">{name}</span>
      <Separator />
      <BarButton label="Leave presenting" icon={X} onClick={onLeave} />
    </div>
  )
}

function BarButton({
  label,
  icon: Icon,
  disabled = false,
  onClick,
}: {
  label: string
  icon: LucideIcon
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onClick()
      }}
      className="grid size-[30px] place-items-center rounded-[7px] outline-none hover:bg-white/10 focus-visible:ring-3 focus-visible:ring-[#4e92f6] aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent"
    >
      <Icon aria-hidden className="size-4" strokeWidth={1.6} />
    </button>
  )
}

function Separator() {
  return <span aria-hidden className="mx-1 h-[18px] w-px bg-[#444]" />
}
