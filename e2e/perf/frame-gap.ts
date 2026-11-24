import type { Page } from '@playwright/test'

const SLOW_FRAME_MS = 33

export interface Sample {
  intervals: number[]
  longFrames: number[]
}

export async function startRecording(page: Page): Promise<void> {
  await page.evaluate(() => {
    const sample = { intervals: [] as number[], longFrames: [] as number[] }
    ;(window as unknown as { __sample: typeof sample }).__sample = sample
    let last = performance.now()
    const tick = (time: number) => {
      sample.intervals.push(time - last)
      last = time
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        sample.longFrames.push(entry.duration)
      }
    }).observe({ type: 'long-animation-frame' })
  })
}

export async function takeSample(page: Page): Promise<Sample> {
  return page.evaluate(() => {
    const { __sample } = window as unknown as { __sample: Sample }
    const taken = {
      intervals: [...__sample.intervals],
      longFrames: [...__sample.longFrames],
    }
    __sample.intervals.length = 0
    __sample.longFrames.length = 0
    return taken
  })
}

export function nextFrame(page: Page): Promise<unknown> {
  return page.evaluate(() => new Promise(requestAnimationFrame))
}

export function summarize(name: string, { intervals, longFrames }: Sample) {
  // The first interval spans the gap before the gesture began.
  const sorted = intervals.slice(1).sort((a, b) => a - b)
  const at = (share: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0
  const summary = {
    gesture: name,
    frames: sorted.length,
    p50: Number(at(0.5).toFixed(2)),
    p95: Number(at(0.95).toFixed(2)),
    slowShare: Number(
      (
        sorted.filter((ms) => ms > SLOW_FRAME_MS).length / sorted.length
      ).toFixed(4),
    ),
    longestLongFrame: Math.max(0, ...longFrames),
  }
  console.log(JSON.stringify(summary))
  return summary
}
