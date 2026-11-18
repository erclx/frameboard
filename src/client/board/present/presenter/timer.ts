import { useEffect, useState } from 'react'

const SECOND = 1000

const pad = (value: number) => String(value).padStart(2, '0')

/** How long presenting has run, as `mm:ss`, or `h:mm:ss` from the first hour. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / SECOND))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`
}

/** The time of day in the reader's own hours and minutes. */
export function formatClock(at: number, locale?: string): string {
  return new Date(at).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * The current time, read again on each whole second so the timer and the
 * clock turn over together.
 */
export function useNow(read: () => number = Date.now): number {
  const [now, setNow] = useState(read)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const at = read()
      setNow(at)
      timer = setTimeout(tick, SECOND - (at % SECOND))
    }
    tick()
    return () => clearTimeout(timer)
  }, [read])
  return now
}
