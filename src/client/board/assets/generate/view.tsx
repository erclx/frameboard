import { type ReactNode, useEffect, useState } from 'react'
import { useStore } from 'zustand'

import { Button } from '@/client/components/ui/button'
import { useLive } from '@/client/live/store'

import { assetUrl } from '../describe'
import { Picture } from '../picture'
import { Preview } from '../preview'
import { PendingTile, RESULT_GRID, ResultTile } from '../result-tile'
import { fetchOffer, generateImage, type ImageOffer } from '../sourcing'
import {
  EMPTY_SESSION,
  type GeneratedPicture,
  type GenerateSession,
  runStore,
  startRun,
  updateSession,
} from './run-store'

const CODE = 'font-mono text-label font-normal text-foreground'
const LINE_BOX = 'text-label font-normal leading-[1.45]'
const LINE = `${LINE_BOX} text-muted-foreground`
const ALERT = `${LINE_BOX} text-destructive`
const FOOT = 'mt-2.5 text-caption leading-[1.4] text-muted-foreground'

interface GenerateViewProps {
  project: string
  /** Reads the provider and its price, the board's route in the app. */
  load?: typeof fetchOffer
  /** Runs one generation, the board's route in the app. */
  generate?: typeof generateImage
}

/**
 * Generate in the dialog. The provider and its price show before anything
 * runs, one press is the consent, and the button holds while a run is out, so
 * a run spends at most once. This session's pictures stand beside a preview.
 */
export function GenerateView({
  project,
  load = fetchOffer,
  generate = generateImage,
}: GenerateViewProps) {
  const canWrite = useLive((state) => state.canWrite)
  const offer = useOffer(project, load)
  const { prompt, run, pictures, picked } = useStore(
    runStore,
    (state) => state[project] ?? EMPTY_SESSION,
  )
  const provider = offer?.provider ?? null
  const ready = canWrite && provider !== null && prompt.trim() !== ''
  const running = run.state === 'running'
  const shown = pictures.find((picture) => picture.id === picked)

  return (
    <div
      aria-busy={running}
      className="@container flex min-h-0 flex-1 flex-col"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3">
        <textarea
          aria-label="Describe the image"
          placeholder="Describe the image"
          value={prompt}
          readOnly={running}
          onChange={(event) =>
            updateSession(project, { prompt: event.target.value })
          }
          className="min-h-14 min-w-48 flex-1 resize-none rounded-md bg-input px-2 py-1.5 leading-[1.45] outline-none placeholder:text-muted-foreground focus-visible:ring-[1.5px] focus-visible:ring-primary"
        />
        <div className="flex items-center gap-3 text-label font-normal text-muted-foreground">
          {offer === undefined ? null : (
            <span>
              <b className="block font-medium text-foreground">
                {provider === null
                  ? 'No provider set up'
                  : `${provider.model} on ${provider.name}`}
              </b>
              {provider === null
                ? 'nothing can run yet'
                : `about ${formatPrice(provider.priceUsd)} an image`}
            </span>
          )}
          <Button
            size="sm"
            className="text-xs aria-disabled:bg-muted aria-disabled:text-muted-foreground"
            disabled={!ready || running}
            focusableWhenDisabled
            onClick={() => {
              if (ready) void startRun(project, generate)
            }}
          >
            {running ? 'Generating' : 'Generate'}
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col @min-[640px]:flex-row">
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-3">
          {canWrite ? null : (
            <p className={LINE}>
              This tab is read-only, so nothing can be generated. Run{' '}
              <code className={CODE}>frameboard open</code> for a tab that can.
            </p>
          )}
          <Notice offer={offer} run={run} pictures={pictures} />
          {running || pictures.length > 0 ? (
            <ul
              aria-label={running ? 'Generating' : 'Generated'}
              className={RESULT_GRID}
            >
              {running ? <PendingTile /> : null}
              {pictures.map((picture) => (
                <ResultTile
                  key={picture.id}
                  picture={
                    <GeneratedImage project={project} picture={picture} />
                  }
                  title={picture.saved.path}
                  meta={`${picture.width} × ${picture.height}`}
                  picked={picture.id === picked}
                  onPick={() => updateSession(project, { picked: picture.id })}
                />
              ))}
            </ul>
          ) : null}
          {pictures.length > 0 ? (
            <p className={FOOT}>
              Saved to <code className={CODE}>assets/</code>, each with its
              license file.
            </p>
          ) : null}
        </div>
        {shown ? (
          <Preview
            key={shown.id}
            project={project}
            id={shown.id}
            picture={
              <GeneratedImage project={project} picture={shown} fit="contain" />
            }
            title={shown.saved.path}
            lines={[
              `${shown.width} × ${shown.height} · ${shown.model} on ${shown.provider}`,
              shown.prompt,
            ]}
            file={async () => ({
              project,
              path: shown.saved.path,
              kind: 'image',
            })}
          />
        ) : null}
      </div>
    </div>
  )
}

/** A generated picture from `assets/`, its file type once the file is gone from there. */
function GeneratedImage({
  project,
  picture: { id, saved },
  fit,
}: {
  project: string
  picture: GeneratedPicture
  fit?: 'cover' | 'contain'
}) {
  return (
    <Picture
      links={[`${assetUrl(project, saved.path)}?v=${id}`]}
      type={saved.path.split('.').at(-1)?.toUpperCase() ?? 'Image'}
      source="No longer in assets/"
      fit={fit}
    />
  )
}

/** The line over the pictures, by whether a provider is set up and how the last run went. */
function Notice({
  offer,
  run,
  pictures,
}: Pick<GenerateSession, 'run' | 'pictures'> & {
  /** Undefined while it loads, null when the read failed. */
  offer: ImageOffer | null | undefined
}): ReactNode {
  if (offer === undefined) return null
  if (offer === null) {
    return (
      <p className={LINE}>
        The provider did not load. Reload the board to try again.
      </p>
    )
  }
  const { provider } = offer
  if (provider === null) {
    return (
      <p className={LINE}>
        Set{' '}
        {offer.keys.map((key, index) => (
          <span key={key}>
            {index === 0 ? null : ' or '}
            <code className={CODE}>{key}</code>
          </span>
        ))}{' '}
        where the board was started.{' '}
        <code className={CODE}>frameboard image doctor</code> shows what this
        machine has.
      </p>
    )
  }
  if (run.state === 'failed') {
    return (
      <p role="alert" className={`${ALERT} mb-2.5`}>
        {run.message} Check the account behind{' '}
        <code className={CODE}>{provider.key}</code>, then generate again.
      </p>
    )
  }
  return run.state === 'idle' && pictures.length === 0 ? (
    <p className={LINE}>
      Uses <code className={CODE}>{provider.key}</code> from where the board was
      started. The bill is yours.
    </p>
  ) : null
}

/** Two significant figures, so a fraction of a cent still reads. */
function formatPrice(usd: number): string {
  return `$${Number(usd.toPrecision(2))}`
}

/** The offer, undefined while the first read runs and null when it fails. */
function useOffer(
  project: string,
  load: typeof fetchOffer,
): ImageOffer | null | undefined {
  const [offer, setOffer] = useState<ImageOffer | null | undefined>()
  useEffect(() => {
    let current = true
    void load(project)
      .catch(() => null)
      .then((next) => {
        if (current) setOffer(next)
      })
    return () => {
      current = false
    }
  }, [project, load])
  return offer
}
