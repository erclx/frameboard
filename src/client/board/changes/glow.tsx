import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { unseenStore } from '@/client/live/unseen'
import type { FrameChange } from '@/shared/records/changes'
import type { FrameRecord } from '@/shared/records/list'

import { elementAt, renderedHash } from '../frame-dom'
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
 * A brief glow over the elements an agent changed, per agents/claim-full's
 * `.flash`, or over the whole frame for a change too wide to name by
 * element. It plays once the frame's iframe shows the bytes the change left,
 * and again on Show, and Play hides it.
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

    const play = (frame: FrameRecord, change: FrameChange, doc: Document) => {
      const key = nextPlay++
      // The whole frame glows as drawn, at a previewed width included.
      const { width, height } = previewedBox(
        frame,
        frame.box,
        previewOf(frame.ref),
      )
      const boxes = change.whole
        ? [{ x: 0, y: 0, width, height }]
        : change.elements.flatMap((index) => {
            const element = elementAt(doc, index)
            if (!element) return []
            const rect = element.getBoundingClientRect()
            return [
              {
                x: rect.left,
                y: rect.top,
                width: rect.width,
                height: rect.height,
              },
            ]
          })
      played.add(change.id)
      if (boxes.length === 0) return
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
        const doc = container.querySelector<HTMLIFrameElement>(
          `[data-frame="${CSS.escape(frame.ref)}"] iframe`,
        )?.contentDocument
        if (!doc || renderedHash(doc) !== change.hash) continue
        if (replay) answered.push(frame.ref)
        play(frame, change, doc)
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
    // A load does not bubble, so a frame mounting or reloading is caught on the way down.
    container.addEventListener('load', scan, true)
    const stopUnseen = unseenStore.subscribe((state, previous) => {
      if (state.unseen !== previous.unseen) scan()
    })
    const stopReplays = glowStore.subscribe((state, previous) => {
      if (state.replays !== previous.replays) scan()
    })
    return () => {
      container.removeEventListener('load', scan, true)
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
