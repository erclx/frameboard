import type { FileFlag } from '@/shared/frame-bridge/media'

import type { LiveMedia } from '../../element/media'
import {
  MediaTime,
  PlayButton,
  SeekTrack,
  SoundButton,
  Unplayable,
} from '../../element/media-bar'
import { SwitchRow } from './switch-row'
import type { WriteElement } from './write'

interface VideoSectionProps {
  media: LiveMedia
  disabled: boolean
  write: WriteElement
}

/**
 * The Video or Audio section. Playback writes nothing, an audio shows no
 * Controls switch since it would draw nothing to pick, and `write` should
 * skip the reload so a switch keeps the clip playing.
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
    <SwitchRow
      label={label}
      name={name}
      on={on}
      disabled={disabled}
      onTurn={() => void turn()}
    />
  )
}
