import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { unseenStore } from '@/client/live/unseen'
import { pageBox } from '@/shared/frame-device'
import type { FrameChange } from '@/shared/records/changes'
import type { FrameRecord } from '@/shared/records/list'

import { request } from '../bridge/channel'
import { shownHashOf, subscribeShown } from '../bridge/shown'
import type { Box } from '../geometry/box'
import { screen } from '../geometry/draw'
import { OVERLAY_Z } from '../geometry/overlay'
import { useMode } from '../mode'
import { previewedBox, previewOf } from '../preview/store'
import { glowStore, played } from './glow-store'

/** How long a glow shows, its fade taking the last 600 ms where motion is allowed. */
export const GLOW_MS = 2000

interface Lit {
  key: number
  boxes: Box[]
}

let nextPlay = 1

interface ChangeGlowProps {
  /** The page's shown frames, in whose boxes a glow is drawn. */
  frames: readonly FrameRecord[]
  /** The canvas layer holding the frames' iframes. */
  container: HTMLElement | null
}

/**
 * A glow over the elements an agent changed, playing once the iframe shows the
 * change's bytes and again on Show.
 */
export function ChangeGlow({ frames, container }: ChangeGlowProps) {
  const playing = useMode((state) => state.mode === 'play')
  const [lit, setLit] = useState<Readonly<Record<string, Lit>>>({})
  // Read at each scan, since every batch sends a new board and a glow outlives it.
  const framesRef = useRef(frames)
  useLayoutEffect(() => {
    framesRef.current = frames
  }, [frames])

  useEffect(() => {
    if (!container || playing) return
    const timers = new Set<ReturnType<typeof setTimeout>>()
    let stopped = false

    const play = async (
      frame: FrameRecord,
      change: FrameChange,
      iframe: HTMLIFrameElement,
    ) => {
      // The whole frame glows as drawn, at a previewed width included.
      const { width, height } = previewedBox(
        frame,
        frame.box,
        previewOf(frame.ref),
      )
      // An element's box reads in its page, which a phone insets from its box.
      const page = pageBox(
        { x: 0, y: 0, width, height },
        frame.device,
        frame.turn,
      )
      const boxes = change.whole
        ? [{ x: 0, y: 0, width, height }]
        : ((
            await request(iframe, 'element-boxes', {
              hash: change.hash,
              indexes: change.elements,
            })
          )?.map(({ box }) => ({
            ...box,
            x: page.x + box.x,
            y: page.y + box.y,
          })) ?? [])
      if (stopped || boxes.length === 0) return
      const key = nextPlay++
      setLit((current) => ({ ...current, [frame.ref]: { key, boxes } }))
      glowStore.setState((state) => ({
        glowing: { ...state.glowing, [frame.ref]: key },
      }))
      const timer = setTimeout(() => {
        timers.delete(timer)
        setLit((current) => {
          if (current[frame.ref]?.key !== key) return current
          const { [frame.ref]: _, ...rest } = current
          return rest
        })
        glowStore.setState((state) => {
          if (state.glowing[frame.ref] !== key) return state
          const { [frame.ref]: _, ...glowing } = state.glowing
          return { glowing }
        })
      }, GLOW_MS)
      timers.add(timer)
    }

    const scan = () => {
      const { unseen } = unseenStore.getState()
      const { replays } = glowStore.getState()
      const answered: string[] = []
      for (const frame of framesRef.current) {
        const change = unseen[frame.ref]
        if (!change) continue
        const replay = frame.ref in replays
        if (played.has(change.id) && !replay) continue
        const iframe = container.querySelector<HTMLIFrameElement>(
          `[data-frame="${CSS.escape(frame.ref)}"] iframe`,
        )
        if (!iframe || shownHashOf(iframe) !== change.hash) continue
        if (replay) answered.push(frame.ref)
        // Marked before the frame answers, so a second scan meanwhile plays it once.
        played.add(change.id)
        void play(frame, change, iframe)
      }
      if (answered.length > 0) {
        glowStore.setState((state) => ({
          replays: Object.fromEntries(
            Object.entries(state.replays).filter(
              ([ref]) => !answered.includes(ref),
            ),
          ),
        }))
      }
    }

    scan()
    // A frame mounting or reloading is caught as its page announces the bytes it shows.
    const stopShown = subscribeShown(scan)
    const stopUnseen = unseenStore.subscribe((state, previous) => {
      if (state.unseen !== previous.unseen) scan()
    })
    const stopReplays = glowStore.subscribe((state, previous) => {
      if (state.replays !== previous.replays) scan()
    })
    return () => {
      stopped = true
      stopShown()
      stopUnseen()
      stopReplays()
      for (const timer of timers) clearTimeout(timer)
      setLit({})
      glowStore.setState({ glowing: {} })
    }
  }, [container, playing])

  if (playing) return null
  const byRef = new Map(frames.map((frame) => [frame.ref, frame]))
  return Object.entries(lit).flatMap(([ref, { key, boxes }]) => {
    const frame = byRef.get(ref)
    if (!frame) return []
    return boxes.map((box, at) => (
      <span
        key={`${key}-${at}`}
        data-change-glow={ref}
        aria-hidden
        className="pointer-events-none absolute rounded-[calc(8px/var(--zoom,1))] bg-[color-mix(in_srgb,var(--claim)_12%,transparent)] motion-safe:animate-change-glow"
        style={{
          left: `calc(${frame.box.x + box.x}px - ${screen(4)})`,
          top: `calc(${frame.box.y + box.y}px - ${screen(4)})`,
          width: `calc(${box.width}px + ${screen(8)})`,
          height: `calc(${box.height}px + ${screen(8)})`,
          boxShadow: `0 0 0 ${screen(2)} var(--claim), 0 0 ${screen(18)} color-mix(in srgb, var(--claim) 55%, transparent)`,
          zIndex: OVERLAY_Z - 1,
        }}
      />
    ))
  })
}
