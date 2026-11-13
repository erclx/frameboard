import { Pause, Play, Volume2, VolumeX } from 'lucide-react'

import { cn } from '@/client/lib/cn'

import { formatLength } from '../assets/describe'
import type { LiveMedia, MediaReading } from './media'

const ICON_BUTTON =
  'grid shrink-0 place-items-center rounded-[5px] text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50'

/** What play and pause read: whether the page is paused, and the toggle. */
export interface Playable {
  reading: Pick<MediaReading, 'paused'>
  togglePlay: () => void
}

/** What the scrub track reads: the position and length, and the seek. */
export interface Seekable {
  reading: Pick<MediaReading, 'time' | 'length'>
  seek: (position: number) => void
}

/** Play or pause on the live page, which writes nothing. */
export function PlayButton({
  media,
  className,
}: {
  media: Playable
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
export function MediaTime({
  reading,
  className,
}: {
  reading: MediaReading
  className?: string
}) {
  return (
    <span
      data-media-time
      className={cn(
        'shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums',
        className,
      )}
    >
      {formatLength(reading.time)} / {formatLength(reading.length)}
    </span>
  )
}

/**
 * The scrub track, a native range so the arrow keys step it, moving the live
 * page's position as it is dragged and writing nothing. `format` reads a
 * position aloud in the unit the track counts, m:ss of seconds by default.
 * Its focus ring draws on the thumb alone, through `seek-track` in the
 * stylesheet, which fills the track up to `--seek`.
 */
export function SeekTrack({
  media,
  format = formatLength,
  className,
}: {
  media: Seekable
  format?: (position: number) => string
  className?: string
}) {
  const { time, length } = media.reading
  const known = Number.isFinite(length) && length > 0
  return (
    <input
      type="range"
      aria-label="Position"
      aria-valuetext={`${format(time)} of ${format(length)}`}
      min={0}
      max={known ? length : 0}
      step="any"
      value={known ? time : 0}
      disabled={!known}
      onChange={(event) => media.seek(Number(event.currentTarget.value))}
      className={cn(
        'seek-track min-w-0 flex-1 cursor-pointer disabled:cursor-default',
        className,
      )}
      style={{
        ['--seek' as string]: `${known ? (time / length) * 100 : 0}%`,
      }}
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

/** The bar's look over a video's picture: a dark scrim whatever the theme, so it reads on any frame. */
const OVER_VIDEO = {
  bar: 'border-transparent bg-[rgba(20,20,20,0.72)] text-white shadow-none backdrop-blur-[6px]',
  button: 'text-white hover:bg-white/15',
  time: 'text-white/70',
}

/**
 * The slim bar of a selected `<video>` or `<audio>` on the canvas in Edit:
 * play and pause, the scrub track, the time, and the speaker, each acting on
 * the live page alone. A video's sits over its picture, so it takes the dark
 * scrim. As the bar narrows the time gives way first, then the track, then
 * the speaker, each before it would overflow, so no control is left in the
 * tab order with nothing drawn. The inspector's section holds all four at
 * any zoom.
 */
export function MediaBar({ media }: { media: LiveMedia }) {
  const over = media.reading.tag === 'video'
  const button = cn('size-[18px]', over && OVER_VIDEO.button)
  return (
    <div
      data-media-bar
      role="group"
      aria-label={over ? 'Video' : 'Audio'}
      className={cn(
        '@container flex h-6 items-center gap-1.5 overflow-hidden rounded-md border border-border bg-card px-1.5 text-foreground shadow-sm',
        over && OVER_VIDEO.bar,
      )}
    >
      {media.reading.playable ? (
        <>
          <PlayButton media={media} className={button} />
          <SeekTrack media={media} className="hidden @min-[68px]:block" />
          <MediaTime
            reading={media.reading}
            className={cn(
              'hidden @min-[146px]:inline',
              over && OVER_VIDEO.time,
            )}
          />
          <SoundButton
            media={media}
            className={cn(button, 'hidden @min-[42px]:grid')}
          />
        </>
      ) : (
        <Unplayable />
      )}
    </div>
  )
}
