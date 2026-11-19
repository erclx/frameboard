import { draggable } from '@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter'
import { useEffect, useRef, useState } from 'react'

import { Skeleton } from '@/client/components/ui/skeleton'
import { useLive } from '@/client/live/store'

import { assetUrl } from '../describe'
import { tileDragData } from '../drag'
import {
  fetchOffer,
  generateImage,
  type ImageGenerate,
  type ImageOffer,
} from '../sourcing'

const CODE = 'font-mono text-label font-normal text-foreground'
const LINE_BOX = 'mx-3 my-1.5 text-label font-normal leading-[1.45]'
const LINE = `${LINE_BOX} text-muted-foreground`
const ALERT = `${LINE_BOX} text-destructive`
const FOOT =
  'mx-3 mt-1.5 mb-0.5 text-[10px] leading-[1.4] text-muted-foreground'

type Run =
  | { state: 'idle' }
  | { state: 'running' }
  | { state: 'done'; record: ImageGenerate }
  | { state: 'failed'; message: string }

interface GenerateViewProps {
  project: string
  /** Reads the provider and its price, the board's route in the app. */
  load?: typeof fetchOffer
  /** Runs one generation, the board's route in the app. */
  generate?: typeof generateImage
}

/**
 * Generate in the Assets tab. The provider and its price show before
 * anything runs, one press is the consent, and the button holds while a run
 * is out, so a run spends at most once.
 */
export function GenerateView({
  project,
  load = fetchOffer,
  generate = generateImage,
}: GenerateViewProps) {
  const canWrite = useLive((state) => state.canWrite)
  const offer = useOffer(project, load)
  const [prompt, setPrompt] = useState('')
  const [run, setRun] = useState<Run>({ state: 'idle' })
  const busy = useRef(false)

  if (offer === undefined) return null
  const provider = offer?.provider ?? null
  const ready = canWrite && provider !== null && prompt.trim() !== ''

  async function start() {
    if (!ready || busy.current) return
    busy.current = true
    setRun({ state: 'running' })
    try {
      setRun({ state: 'done', record: await generate(project, prompt.trim()) })
    } catch (error) {
      setRun({
        state: 'failed',
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      busy.current = false
    }
  }

  const running = run.state === 'running'
  return (
    <div
      aria-busy={running}
      className="flex h-full flex-col overflow-y-auto pb-2"
    >
      <textarea
        aria-label="Describe the image"
        placeholder="Describe the image"
        value={prompt}
        readOnly={running}
        onChange={(event) => setPrompt(event.target.value)}
        className="mx-2 mt-1 mb-1.5 min-h-16 resize-none rounded-md bg-muted px-2 py-1.5 text-label leading-[1.45] font-normal outline-none placeholder:text-muted-foreground focus-visible:ring-[1.5px] focus-visible:ring-primary"
      />
      <div className="mt-0.5 mr-2 mb-1.5 ml-3 flex items-center justify-between gap-2 text-label font-normal text-muted-foreground">
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
        <button
          type="button"
          disabled={!ready || running}
          onClick={() => void start()}
          className="inline-flex h-[26px] shrink-0 items-center rounded-[7px] bg-primary px-2.5 font-medium text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:bg-muted disabled:text-muted-foreground"
        >
          {running ? 'Generating' : 'Generate'}
        </button>
      </div>
      <Below project={project} offer={offer} run={run} />
    </div>
  )
}

/** The line or tile under the button, by whether a provider is set up and how the last run went. */
function Below({
  project,
  offer,
  run,
}: {
  project: string
  offer: ImageOffer | null
  run: Run
}) {
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
  switch (run.state) {
    case 'running':
      return (
        <ul
          aria-label="Generating"
          className="grid grid-cols-2 gap-2 px-2 py-1"
        >
          <li className="overflow-hidden rounded-lg bg-muted">
            <span className="block h-[72px]" />
            <span className="block h-[38px] px-[7px] py-[5px]">
              <Skeleton className="my-[3px] h-2 w-[70%] rounded-[3px] bg-foreground/10" />
              <Skeleton className="my-[3px] h-2 w-[45%] rounded-[3px] bg-foreground/10" />
            </span>
          </li>
        </ul>
      )
    case 'failed':
      return (
        <p role="alert" className={ALERT}>
          {run.message} Check the account behind{' '}
          <code className={CODE}>{provider.key}</code>, then generate again.
        </p>
      )
    case 'done':
      return (
        <>
          <ul
            aria-label="Generated"
            className="grid grid-cols-2 gap-2 px-2 py-1"
          >
            <GeneratedTile project={project} record={run.record} />
          </ul>
          <p className={FOOT}>
            Saved to <code className={CODE}>assets/</code> with its license
            file.
          </p>
        </>
      )
    case 'idle':
      return (
        <p className={FOOT}>
          Uses <code className={CODE}>{provider.key}</code> from where the board
          was started. The bill is yours.
        </p>
      )
  }
}

/** The saved image, already in `assets/`, which drags into a frame like any file tile. */
function GeneratedTile({
  project,
  record,
}: {
  project: string
  record: ImageGenerate
}) {
  const tile = useRef<HTMLLIElement>(null)
  const canWrite = useLive((state) => state.canWrite)
  const path = record.saved?.path ?? null
  useEffect(() => {
    const element = tile.current
    if (!element || !canWrite || path === null) return
    return draggable({
      element,
      getInitialData: () => tileDragData({ project, path, kind: 'image' }),
    })
  }, [project, path, canWrite])
  if (path === null) return null
  return (
    <li
      ref={tile}
      className="relative overflow-hidden rounded-lg bg-muted hover:ring-[1.5px] hover:ring-primary"
    >
      <img
        src={assetUrl(project, path)}
        alt=""
        className="h-[72px] w-full object-cover"
      />
      <span className="absolute top-[54px] left-[5px] rounded-[3px] bg-black/65 px-1 font-mono text-[9px] leading-[14px] font-medium text-white">
        new
      </span>
      <span className="block truncate px-[7px] py-[5px] text-label font-normal">
        {path}
        <span className="block text-[10px] text-muted-foreground">
          {record.width} × {record.height} · saved
        </span>
      </span>
    </li>
  )
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
