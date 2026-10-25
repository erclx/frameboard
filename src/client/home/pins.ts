import { useSyncExternalStore } from 'react'

import { refreshActions } from '@/client/actions/registry'

const PINS_KEY = 'frameboard.home.pins'

/**
 * The projects this browser pinned, by name, read from `localStorage` so a
 * reload and every mounted view agree. A pin is a viewer's favorite rather
 * than design, so it stays out of the board folder and a second browser
 * starts with none. A name no project holds is ignored where it is read.
 */
export function usePins(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, pinnedProjects, pinnedProjects)
}

export function pinnedProjects(): ReadonlySet<string> {
  const raw = readRaw()
  if (raw !== cache.raw) cache = { raw, pins: parse(raw) }
  return cache.pins
}

export function togglePin(project: string): void {
  const pins = new Set(pinnedProjects())
  if (!pins.delete(project)) pins.add(project)
  write(pins)
}

/** Carries a pin to a project's new name, doing nothing for an unpinned one. */
export function movePin(from: string, to: string): void {
  const pins = new Set(pinnedProjects())
  if (!pins.delete(from)) return
  write(pins.add(to))
}

export function dropPin(project: string): void {
  const pins = new Set(pinnedProjects())
  if (pins.delete(project)) write(pins)
}

let cache: { raw: string | null; pins: ReadonlySet<string> } = {
  raw: null,
  pins: new Set(),
}
/**
 * What a browser refusing a write keeps for this visit alone, read ahead of
 * storage once set, since a full quota can refuse the write and still serve
 * the older value.
 */
let refused: string | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function readRaw(): string | null {
  if (refused !== null) return refused
  try {
    return localStorage.getItem(PINS_KEY)
  } catch {
    return null
  }
}

function write(pins: ReadonlySet<string>): void {
  const raw = JSON.stringify([...pins])
  try {
    localStorage.setItem(PINS_KEY, raw)
    refused = null
  } catch {
    refused = raw
  }
  for (const listener of listeners) listener()
  refreshActions()
}

function parse(raw: string | null): ReadonlySet<string> {
  try {
    const stored: unknown = JSON.parse(raw ?? '[]')
    return new Set(
      Array.isArray(stored)
        ? stored.filter((name): name is string => typeof name === 'string')
        : [],
    )
  } catch {
    return new Set()
  }
}
