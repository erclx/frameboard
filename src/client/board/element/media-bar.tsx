import { Pause, Play, Volume2, VolumeX } from 'lucide-react'

import { cn } from '@/client/lib/cn'

import { formatLength } from '../assets/describe'
import type { LiveMedia, MediaReading } from './media'

const ICON_BUTTON =
  'grid shrink-0 place-items-center rounded-[5px] text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50'

/** Play or pause on the live page, which writes nothing. */
export function PlayButton({
  media,
  className,
}: {
  media: LiveMedia
  className?: string
}) {
  const { paused } = media.reading
  const Icon = paused ? Play : Pause
  return (
    <button
      type="button"
      aria-label={paused ? 'Play' : 'Pause'}
      onClick={media.togglePlay}
      className={cn(ICON_BUTTON, className)}
    >
      <Icon aria-hidden className="size-3" />
    </button>
  )
}

/** Sound on or off on the live page alone, which writes nothing. */
export function SoundButton({
  media,
  className,
}: {
  media: LiveMedia
  className?: string
}) {
  const { muted } = media.reading
  const Icon = muted ? VolumeX : Volume2
  return (
    <button
      type="button"
      aria-label={muted ? 'Sound on' : 'Sound off'}
      aria-pressed={!muted}
      onClick={media.toggleSound}
      className={cn(ICON_BUTTON, className)}
    >
      <Icon aria-hidden className="size-3" />
    </button>
  )
}

/** The position and length as `0:03 / 0:08`. */
export function MediaTime({ reading }: { reading: MediaReading }) {
  return (
    <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
      {formatLength(reading.time)} / {formatLength(reading.length)}
    </span>
  )
}

/**
 * The scrub track, a native range so the arrow keys step it, moving the live
 * page's position as it is dragged and writing nothing.
 */
export function SeekTrack({
  media,
  className,
}: {
  media: LiveMedia
  className?: string
}) {
  const { time, length } = media.reading
  const known = Number.isFinite(length) && length > 0
  return (
    <input
      type="range"
      aria-label="Position"
      aria-valuetext={`${formatLength(time)} of ${formatLength(length)}`}
      min={0}
      max={known ? length : 0}
      step="any"
      value={known ? time : 0}
      disabled={!known}
      onChange={(event) => media.seek(Number(event.currentTarget.value))}
      className={cn(
        'h-1 min-w-0 flex-1 cursor-pointer accent-primary disabled:cursor-default',
        className,
      )}
    />
  )
}

/** Said in place of the controls when the file does not decode, so no dead track shows. */
export function Unplayable() {
  return (
    <span className="text-[10px] text-muted-foreground">
      Can't play this codec
    </span>
  )
}

/**
 * The slim bar under a selected `<video>` or `<audio>` on the canvas in Edit:
 * play and pause, the scrub track, the time, and the speaker, each acting on
 * the live page alone.
 */
export function MediaBar({ media }: { media: LiveMedia }) {
  return (
    <div
      data-media-bar
      role="group"
      aria-label={media.reading.tag === 'video' ? 'Video' : 'Audio'}
      className="flex h-6 items-center gap-1.5 rounded-md border border-border bg-card px-1.5 text-foreground shadow-sm"
    >
      {media.reading.playable ? (
        <>
          <PlayButton media={media} className="size-[18px]" />
          <SeekTrack media={media} />
          <MediaTime reading={media.reading} />
          <SoundButton media={media} className="size-[18px]" />
        </>
      ) : (
        <Unplayable />
      )}
    </div>
  )
}
