import { Square } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { cn } from '@/client/lib/cn'
import { useShownTheme } from '@/client/theme/store'
import { type KitRecord, KITS_URL } from '@/shared/kits'

/** How tall a card's preview draws, the sample frame scaled to fit it. */
const PREVIEW_HEIGHT = 76

/** The card that installs no kit, offered where a project may keep the board's own look. */
export interface BlankCard {
  title: string
  description: string
}

/**
 * The kits as a radio group of cards, per `canon/design/canvas/guide-kit`
 * and `home/new-project-kit`, each a live render of its sample frame in the
 * board's theme. `value` null picks `blank`, which leads the cards when
 * given. Arrow keys move through the group, since each card is a native
 * radio.
 */
export function KitCards({
  kits,
  value,
  onChange,
  group,
  labelledBy,
  blank,
  className,
}: {
  kits: KitRecord[] | null | undefined
  value: string | null
  onChange: (kit: string | null) => void
  group: string
  labelledBy: string
  blank?: BlankCard
  className?: string
}) {
  if (kits === null) {
    return (
      <p role="alert" className="mt-3 text-label font-normal text-destructive">
        Couldn't list the kits. Reload the board to try again.
      </p>
    )
  }
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-busy={kits === undefined}
      className={cn('grid gap-2', className)}
    >
      {blank ? (
        <Card
          group={group}
          id={`${group}-blank`}
          checked={value === null}
          onSelect={() => onChange(null)}
          title={blank.title}
          description={blank.description}
        >
          <span className="grid h-full place-items-center bg-muted text-muted-foreground">
            <Square aria-hidden className="size-4" />
          </span>
        </Card>
      ) : null}
      {kits === undefined
        ? [0, 1, 2].map((slot) => (
            <span
              key={slot}
              aria-hidden
              className="h-[118px] animate-pulse rounded-[10px] bg-muted"
            />
          ))
        : kits.map((kit) => (
            <Card
              key={kit.name}
              group={group}
              id={`${group}-${kit.name}`}
              checked={value === kit.name}
              onSelect={() => onChange(kit.name)}
              title={kit.title}
              description={kit.description}
            >
              <Preview kit={kit} />
            </Card>
          ))}
    </div>
  )
}

function Card({
  group,
  id,
  checked,
  onSelect,
  title,
  description,
  children,
}: {
  group: string
  id: string
  checked: boolean
  onSelect: () => void
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <label className="min-w-0 rounded-[10px] border border-border px-[5px] pt-[5px] pb-2 has-checked:border-primary has-checked:shadow-[0_0_0_1px_var(--primary)] has-[input:focus-visible:not([data-pointer-focus])]:ring-3 has-[input:focus-visible:not([data-pointer-focus])]:ring-ring/50">
      <input
        type="radio"
        name={group}
        checked={checked}
        onChange={onSelect}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        className="sr-only"
      />
      <span
        aria-hidden
        className="block overflow-hidden rounded-md shadow-[0_0_0_1px_var(--border)]"
        style={{ height: PREVIEW_HEIGHT }}
      >
        {children}
      </span>
      <b
        id={`${id}-title`}
        className="mx-[3px] mt-[7px] block truncate font-semibold"
      >
        {title}
      </b>
      <span
        id={`${id}-description`}
        className="mx-[3px] block text-[11px] leading-[1.35] text-muted-foreground"
      >
        {description}
      </span>
    </label>
  )
}

/** The kit's sample frame at its own size, scaled down to the preview's height and centered. */
function Preview({ kit }: { kit: KitRecord }) {
  const theme = useShownTheme()
  const [loaded, setLoaded] = useState<string | null>(null)
  if (!kit.preview) return <span className="block h-full bg-muted" />
  const { frame, width, height } = kit.preview
  const scale = PREVIEW_HEIGHT / height
  const src = `${KITS_URL}/${encodeURIComponent(kit.name)}/kit/${encodeURIComponent(frame)}.html?theme=${theme}`
  return (
    <span
      className={cn(
        'relative block h-full',
        loaded !== src && 'animate-pulse bg-muted',
      )}
    >
      <iframe
        title={`${kit.title} sample`}
        src={src}
        tabIndex={-1}
        loading="lazy"
        onLoad={() => setLoaded(src)}
        data-loaded={loaded === src ? '' : undefined}
        className="pointer-events-none absolute top-0 left-1/2 origin-top border-0 not-data-loaded:opacity-0"
        style={{
          width,
          height,
          transform: `translateX(-50%) scale(${scale})`,
        }}
      />
    </span>
  )
}
