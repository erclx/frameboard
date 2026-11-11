import { cn } from '@/client/lib/cn'

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
 * The Video section, or Audio for an `<audio>`: play and pause, the time,
 * and the speaker over the scrub track, each acting on the live page and
 * writing nothing, then the Muted in the file switch, the one control here
 * that writes, setting or dropping the element's `muted` attribute. A file
 * the browser cannot decode shows the codec line in place of the controls.
 */
export function VideoSection({ media, disabled, write }: VideoSectionProps) {
  const { reading } = media
  const title = reading.tag === 'video' ? 'Video' : 'Audio'
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
      <MutedSwitch
        on={reading.mutedInFile}
        disabled={disabled}
        onChange={(on) =>
          void write(
            on
              ? { kind: 'attribute', name: 'muted', value: '' }
              : { kind: 'attribute', name: 'muted', remove: true },
          )
        }
      />
    </section>
  )
}

function MutedSwitch({
  on,
  disabled,
  onChange,
}: {
  on: boolean
  disabled: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <label className="mt-2.5 flex items-center justify-between gap-2">
      <span>Muted in the file</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={() => onChange(!on)}
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
