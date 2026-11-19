import { type RefObject, useEffect, useState } from 'react'

import type { FrameMotion } from '@/shared/frame-bridge/motion'

import { request, subscribe, type Subscription } from '../bridge/channel'
import { followFrame, followPage } from '../bridge/shown'
import { liveIframe } from '../frame-dom'
import {
  advanceMotion,
  holdMotion,
  type MotionHold,
  motionHoldOf,
  onMotionHoldChange,
  releaseMotion,
} from './store'

/** Whether two reads name one timeline, so a restamp's read keeps the one held. */
function sameMotion(a: FrameMotion | null, b: FrameMotion | null): boolean {
  return (
    a === b ||
    (a !== null &&
      b !== null &&
      a.span === b.span &&
      a.motion.source === b.motion.source &&
      a.motion.duration === b.motion.duration)
  )
}

/**
 * The selected frame's live timeline, read again on each page or swap,
 * undefined while pending and null with nothing to seek.
 */
export function useFrameMotion(ref: string): FrameMotion | null | undefined {
  const [read, setRead] = useState<{
    ref: string
    motion: FrameMotion | null
  } | null>(null)
  useEffect(() => {
    // Only the newest subscription lands, since a closed one resolves null.
    let current = 0
    const land = (asked: number, motion: FrameMotion | null) => {
      if (asked !== current) return
      setRead((held) =>
        held?.ref === ref && sameMotion(held.motion, motion)
          ? held
          : { ref, motion },
      )
    }
    const stop = followFrame(
      document.body,
      ref,
      (iframe) => {
        const asked = (current += 1)
        const reading = subscribe(iframe, 'motion', {}, (motion) =>
          land(asked, motion),
        )
        void reading.opened.then((started) => {
          if (started === null) land(asked, null)
        })
        return reading.close
      },
      () => land((current += 1), null),
    )
    return () => {
      current += 1
      stop()
    }
  }, [ref])
  if (read === null || read.ref !== ref) return undefined
  return read.motion
}

/**
 * Drives one page from the motion store on the board's own clock, each tick
 * posting one seek the frame keeps only the newest of, and releasing only a
 * page it moved. Answers what stops it.
 */
function drivePage(iframe: HTMLIFrameElement, ref: string): () => void {
  let reading: Subscription<'motion'> | null = null
  let bound: { id: string; found: FrameMotion } | null = null
  let driven = false
  let clock: { from: number; started: number; frame: number } | null = null

  const stopClock = () => {
    if (clock) cancelAnimationFrame(clock.frame)
    clock = null
  }

  const seek = (at: number) => {
    if (bound) void request(iframe, 'motion-seek', { motion: bound.id, at })
  }

  const tick = (now: number) => {
    if (!clock || !bound) return
    const { span, motion } = bound.found
    const elapsed = clock.from + (now - clock.started)
    // Held at its end, since a release replays a finished CSS animation from 0.
    if (motion.duration !== null && elapsed >= span) {
      holdMotion(ref, span)
      return
    }
    advanceMotion(ref, span > 0 ? elapsed % span : elapsed)
    clock.frame = requestAnimationFrame(tick)
  }

  const startClock = (hold: MotionHold) => {
    if (clock || !bound) return
    // Play at the end starts over, as the loop does.
    const from = hold.at >= bound.found.span ? 0 : hold.at
    clock = {
      from,
      started: performance.now(),
      frame: requestAnimationFrame(tick),
    }
  }

  const bind = () => {
    if (reading) return
    const opened = subscribe(iframe, 'motion', {}, (found) => {
      if (!found) return
      bound = { id: opened.id, found }
      apply()
    })
    reading = opened
  }

  const apply = () => {
    const hold = motionHoldOf(ref)
    if (!hold) {
      stopClock()
      if (driven && bound) {
        void request(iframe, 'motion-release', { motion: bound.id })
      }
      driven = false
      return
    }
    if (!bound) {
      bind()
      return
    }
    driven = true
    seek(hold.at)
    if (hold.playing) startClock(hold)
    else stopClock()
  }

  let last = motionHoldOf(ref)
  const stop = onMotionHoldChange(() => {
    const next = motionHoldOf(ref)
    if (next === last) return
    last = next
    apply()
  })
  // A page that loads under a hold lands on the same moment.
  if (last) bind()
  return () => {
    stop()
    stopClock()
    reading?.close()
  }
}

/**
 * Drives a frame's live page from the motion store, holding each page it
 * loads at the moment held. Entering Play and leaving the page end the hold.
 */
export function useMotionDriver(
  iframe: RefObject<HTMLIFrameElement | null>,
  ref: string,
  live: boolean,
  playing: boolean,
): void {
  useEffect(() => {
    if (playing) releaseMotion(ref)
  }, [playing, ref])

  // A frame leaves the canvas on a page switch, so the hold goes with it.
  useEffect(() => () => releaseMotion(ref), [ref])

  useEffect(() => {
    const element = iframe.current
    if (!live || !element) return
    return followPage(element, () => drivePage(element, ref))
  }, [iframe, ref, live])
}

/**
 * Whether an undriven frame's timeline has ended, read by one timer for the
 * time left rather than every frame, and false for a `__hf` page.
 */
export function useMotionEnded(
  ref: string,
  found: FrameMotion,
  held: boolean,
): boolean {
  const [read, setRead] = useState<{
    found: FrameMotion
    ended: boolean
  } | null>(null)
  const timed = found.motion.duration !== null && found.motion.source !== 'hf'
  useEffect(() => {
    if (held || !timed) return
    let timer = 0
    let open = true
    const check = () => {
      void liveMomentOf(ref, found).then((moment) => {
        if (!open) return
        const left = found.span - moment
        setRead({ found, ended: left <= 0 })
        if (left > 0) timer = window.setTimeout(check, left)
      })
    }
    check()
    return () => {
      open = false
      window.clearTimeout(timer)
    }
  }, [ref, found, held, timed])
  return !held && timed && read?.found === found && read.ended
}

/**
 * The moment a free-running frame shows now, so pausing it holds where it
 * stood, 0 while no live page answers.
 */
export async function liveMomentOf(
  ref: string,
  found: FrameMotion,
): Promise<number> {
  const iframe = liveIframe(ref)
  if (!iframe) return 0
  return (await request(iframe, 'motion-moment', found)) ?? 0
}
