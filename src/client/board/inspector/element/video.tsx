import { cn } from '@/client/lib/cn'
import type { FileFlag } from '@/shared/frame-bridge/media'

import type { LiveMedia } from '../../element/media'
import {
  MediaTime,
  PlayButton,
  SeekTrack,
  SoundButton,
  Unplayable,
} from '../../element/media-bar'
import type { WriteElement } from './write'

interface VideoSectionProps {
  media: LiveMedia
  disabled: boolean
  write: WriteElement
}

/**
 * The Video or Audio section. Playback acts on the live page and writes
 * nothing, and an audio shows no Controls switch, since one without
 * `controls` draws nothing to pick on the canvas. `write` should skip the
 * reload once the page shows the bytes it answers, so a switch keeps the
 * clip playing.
 */
export function VideoSection({ media, disabled, write }: VideoSectionProps) {
  const { reading } = media
  const title = reading.tag === 'video' ? 'Video' : 'Audio'
  const switchProps = { media, disabled, write }
  return (
    <section
      aria-labelledby="inspector-media"
      className="border-b border-sidebar-border px-3 pt-2.5 pb-3"
    >
      <h2 id="inspector-media" className="mb-2 text-xs font-semibold">
        {title}
      </h2>
      {reading.playable ? (
        <>
          <div className="flex items-center gap-1.5">
            <PlayButton media={media} className="size-6 bg-muted" />
            <MediaTime reading={reading} />
            <SoundButton media={media} className="ml-auto size-6 bg-muted" />
          </div>
          <SeekTrack media={media} className="mt-2 w-full" />
        </>
      ) : (
        <Unplayable />
      )}
      <p className="mt-3 mb-1.5 text-[11px] text-muted-foreground">
        In the file
      </p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {reading.tag === 'video' ? (
          <FileSwitch
            label="Controls"
            attribute="controls"
            on={reading.controls}
            {...switchProps}
          />
        ) : null}
        <FileSwitch
          label="Autoplay"
          attribute="autoplay"
          on={reading.autoplay}
          {...switchProps}
        />
        <FileSwitch
          label="Loop"
          attribute="loop"
          on={reading.loop}
          {...switchProps}
        />
        <FileSwitch
          label="Muted"
          name="Muted in the file"
          attribute="muted"
          on={reading.mutedInFile}
          {...switchProps}
        />
      </div>
    </section>
  )
}

/**
 * A switch that sets a boolean attribute on the element when turned on and
 * drops it when turned off. It sets the live node first and puts it back when
 * the write is refused, so the page shows the file's state either way.
 */
function FileSwitch({
  label,
  name,
  attribute,
  on,
  media,
  disabled,
  write,
}: {
  label: string
  /** The accessible name, when the group label already says what `label` leaves out. */
  name?: string
  attribute: FileFlag
  on: boolean
  media: LiveMedia
  disabled: boolean
  write: WriteElement
}) {
  const turn = async () => {
    media.setFileFlag(attribute, !on)
    const written = await write(
      on
        ? { kind: 'attribute', name: attribute, remove: true }
        : { kind: 'attribute', name: attribute, value: '' },
    )
    if (!written) media.setFileFlag(attribute, on)
  }
  return (
    <label className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={name}
        disabled={disabled}
        onClick={() => void turn()}
        className={cn(
          'relative h-3.5 w-[26px] shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50',
          on ? 'bg-primary' : 'bg-input',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute top-0.5 size-2.5 rounded-full bg-white transition-[left] motion-reduce:transition-none',
            on ? 'left-[14px]' : 'left-0.5',
          )}
        />
      </button>
    </label>
  )
}
