import { useEffect, useState } from 'react'

import type { LiveElement, Placement } from '@/shared/frame-bridge/live-element'
import type { FrameStyles, UsedColor } from '@/shared/records/elements'

import { request } from '../../bridge/channel'
import { followFrame, shownHashOf } from '../../bridge/shown'
import { liveIframe } from '../../frame-dom'
import type { FreeSpot } from '../../place/write'
import type { ElementKey } from '../../selection'

/**
 * The spot Free places an element at, where it renders at the size it renders
 * at, its left taken from its words when `hugs` says no length sizes its width.
 */
export function freeSpot(
  { left, top, width, height, wordsLeft }: Placement,
  hugs: boolean,
): FreeSpot {
  return {
    left: hugs && wordsLeft !== null ? wordsLeft : left,
    top,
    ...(width === null ? {} : { width }),
    ...(height === null ? {} : { height }),
  }
}

/**
 * Asks the frame for the named elements each time it shows a page or a
 * restamp at `hash`, handing each answer to `read` until the answer is
 * called. A page at other bytes is left alone, so the last answer holds.
 */
function readShown(
  frame: string,
  hash: string,
  indexes: readonly number[],
  read: (live: LiveElement[]) => void,
): () => void {
  let current = true
  const stop = followFrame(
    document.body,
    frame,
    (iframe) => {
      if (shownHashOf(iframe) !== hash) return null
      void request(iframe, 'live-element', {
        hash,
        indexes: [...indexes],
      }).then((live) => {
        if (current && live) read(live)
      })
      return () => {}
    },
    () => {},
  )
  return () => {
    current = false
    stop()
  }
}

/**
 * The selected element as its live iframe renders it, keeping the last reading
 * while the frame shows bytes older than the key's hash, so the sections hold
 * their place between a hand edit and its reload.
 */
export function useLiveElement(key: ElementKey | null): LiveElement | null {
  const [held, setHeld] = useState<{
    at: string
    live: LiveElement
  } | null>(null)
  const frame = key?.frame
  const index = key?.index
  const hash = key?.hash
  const at = key ? `${frame}:${index}` : null

  useEffect(() => {
    if (frame === undefined || index === undefined || hash === undefined) {
      return
    }
    if (at === null) return
    return readShown(frame, hash, [index], ([live]) => {
      if (live) setHeld({ at, live })
    })
  }, [frame, index, hash, at])

  return held?.at === at ? held.live : null
}

/** One of several selected elements: its key, its live reading, and its static styles once they answer. */
export interface ElementMember {
  key: ElementKey
  live: LiveElement
  styles: FrameStyles | null
}

/**
 * Several elements as their live iframe renders them, with their static
 * styles, held across older bytes as `useLiveElement` holds one.
 */
export function useElementMembers(
  keys: readonly ElementKey[],
): ElementMember[] | null {
  const [first] = keys
  const frame = first?.frame
  const hash = first?.hash
  const at = `${frame}:${keys.map(({ index }) => index).join(',')}`
  const [held, setHeld] = useState<{
    at: string
    members: { key: ElementKey; live: LiveElement }[]
  } | null>(null)
  const [styled, setStyled] = useState<{
    at: string
    styles: (FrameStyles | null)[]
  } | null>(null)

  useEffect(() => {
    if (frame === undefined || hash === undefined) return
    const indexes = at
      .slice(at.lastIndexOf(':') + 1)
      .split(',')
      .map(Number)
    return readShown(frame, hash, indexes, (live) => {
      const members = live.map((reading, order) => ({
        key: { frame, index: indexes[order] ?? 0, hash },
        live: reading,
      }))
      if (members.length === indexes.length) setHeld({ at, members })
    })
  }, [frame, hash, at])

  useEffect(() => {
    if (frame === undefined) return
    const indexes = at
      .slice(at.lastIndexOf(':') + 1)
      .split(',')
      .map(Number)
    let current = true
    void Promise.all(
      indexes.map((index) => fetchStyles(frame, index).catch(() => null)),
    ).then((styles) => {
      if (current) setStyled({ at, styles })
    })
    return () => {
      current = false
    }
  }, [frame, hash, at])

  if (held?.at !== at) return null
  return held.members.map((member, order) => ({
    ...member,
    // The key the selection holds, which a write's rehash leads the reading.
    key: keys[order] ?? member.key,
    styles: styled?.at === at ? (styled.styles[order] ?? null) : null,
  }))
}

/** The one value they all hold, or null where they differ, which a field reads as `Mixed`. */
export function sharedValue<T>(values: readonly T[]): T | null {
  const [first] = values
  return first !== undefined && values.every((value) => value === first)
    ? first
    : null
}

/**
 * Colors from several reads as one list, each once, by its token or value and
 * its percent, its `uses` joined ascending. Those index one frame's bytes, so
 * a merge across frames leaves them for no caller to read.
 */
export function mergeColors(
  lists: readonly (readonly UsedColor[])[],
): UsedColor[] {
  const merged = new Map<string, UsedColor>()
  for (const color of lists.flat()) {
    const key = `${color.token ?? color.value.toLowerCase()}:${color.percent}`
    const held = merged.get(key)
    merged.set(
      key,
      held
        ? {
            ...held,
            uses: [
              ...new Set([...(held.uses ?? []), ...(color.uses ?? [])]),
            ].toSorted((one, other) => one - other),
          }
        : color,
    )
  }
  return [...merged.values()]
}

/**
 * A frame's `body` as an element key its live iframe answers, asked again on
 * each page and restamp, so a frame Fill writes through the element edit from
 * the bytes the page shows.
 */
export function useLiveBody(frame: string): ElementKey | null {
  const [held, setHeld] = useState<ElementKey | null>(null)

  useEffect(() => {
    let current = true
    // Watched wherever it lands, since the canvas swaps a distant frame's iframe out.
    const stop = followFrame(
      document.body,
      frame,
      (iframe) => {
        void request(iframe, 'live-body', {}).then((body) => {
          if (current && body) setHeld({ frame, ...body })
        })
        return () => {}
      },
      () => {},
    )
    return () => {
      current = false
      stop()
    }
  }, [frame])

  return held?.frame === frame ? held : null
}

/**
 * A frame's styles from `GET /api/frames/styles`, for the element at `index`
 * when one is given. Fetched again whenever `version` changes, which the
 * caller ties to the bytes it shows, and the last answer is kept meanwhile.
 */
export function useFrameStyles(
  ref: string | null,
  index: number | undefined,
  version: string,
  load: typeof fetchStyles = fetchStyles,
): FrameStyles | null {
  const [held, setHeld] = useState<{
    at: string
    styles: FrameStyles
  } | null>(null)
  const at = ref === null ? null : `${ref}:${index ?? ''}`

  useEffect(() => {
    if (ref === null || at === null) return
    let current = true
    void load(ref, index)
      .catch(() => null)
      .then((styles) => {
        if (current && styles) setHeld({ at, styles })
      })
    return () => {
      current = false
    }
  }, [ref, index, version, at, load])

  return held?.at === at ? held.styles : null
}

export async function fetchStyles(
  ref: string,
  index?: number,
): Promise<FrameStyles | null> {
  const query = new URLSearchParams({ ref })
  if (index !== undefined) query.set('index', String(index))
  const response = await fetch(`/api/frames/styles?${query}`)
  const body = (await response.json()) as
    | { ok: true; data: FrameStyles }
    | { ok: false }
  return body.ok ? body.data : null
}

/**
 * Previews one inline declaration on the live node, or puts the replaced one
 * back on null, the frame holding what each preview replaced. A written step
 * needs no putting back, since the frame reloads with the written bytes.
 */
export function previewStyle(
  key: ElementKey,
  property: string,
  value: string | null,
): void {
  const iframe = liveIframe(key.frame)
  if (iframe) {
    void request(iframe, 'preview-style', { index: key.index, property, value })
  }
}

/**
 * Forgets a frame's previews once a write of exactly what they show landed
 * without a reload, so a later cancel restores the written value.
 */
export function keepPreviews(frame: string): void {
  const iframe = liveIframe(frame)
  if (iframe) void request(iframe, 'keep-previews', {})
}
