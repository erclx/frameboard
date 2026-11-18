import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import {
  BINDS_ATTRIBUTE,
  isCustomProperty,
  type KeepEdit,
  keepEdits,
  type MovedControl,
  parseBinds,
  UNIT_ATTRIBUTE,
} from '@/shared/bindings'
import { elementIndex, renderedHash } from '@/shared/frame-bridge/elements'

import { liveIframe } from '../frame-dom'
import { writeElements } from '../inspector/element/write'
import { enteredStore } from './entered'

/** The entered frame's moved controls, which the Keep values bar reads. */
export const controlsStore = createStore<{ ref: string | null; moved: number }>(
  () => ({ ref: null, moved: 0 }),
)

export function useMovedControls(): { ref: string | null; moved: number } {
  return useStore(controlsStore)
}

/** The live side of a frame's controls, bound to one loaded document. */
export interface Binder {
  /** The batch a keep posts for every control moved since binding or the last keep. */
  edits: () => KeepEdit[]
  /** Puts every moved control and the property it set back to what the file holds. */
  reset: () => void
  /** Takes the moved values as the file's own, once a keep wrote them. */
  settle: () => void
  detach: () => void
}

interface Bound {
  control: HTMLInputElement
  target: Element
  property: string
  unit: string
}

/** An inline declaration as it stood before the first move, or null when the target set none. */
interface Original {
  value: string
  priority: string
}

/**
 * Binds `doc`'s controls, a move setting its property inline on its target and
 * writing nothing. A control matching nothing is left to `binding-target`.
 */
export function bindControls(
  doc: Document,
  onMove: (moved: number) => void,
): Binder {
  const moved = new Map<HTMLInputElement, Bound>()
  const originals = new Map<Element, Map<string, Original>>()

  const resolve = (control: HTMLInputElement): Bound | null => {
    const binding = parseBinds(control.getAttribute(BINDS_ATTRIBUTE) ?? '')
    if (!binding || !isCustomProperty(binding.property)) return null
    let target: Element | null
    try {
      target = doc.querySelector(binding.selector)
    } catch {
      return null
    }
    if (!target) return null
    return {
      control,
      target,
      property: binding.property,
      unit: control.getAttribute(UNIT_ATTRIBUTE) ?? '',
    }
  }

  // An emptied field restores its property, since a bare unit would skip the `var()` fallback.
  const unmove = (control: HTMLInputElement) => {
    const bound = moved.get(control)
    moved.delete(control)
    const style = bound && styleOf(bound.target)
    if (bound && style) {
      const still = [...moved.values()]
        .reverse()
        .find(
          (other) =>
            other.target === bound.target && other.property === bound.property,
        )
      const original = originals.get(bound.target)?.get(bound.property)
      if (still) {
        style.setProperty(bound.property, `${still.control.value}${still.unit}`)
      } else if (!original || original.value === '') {
        style.removeProperty(bound.property)
      } else {
        style.setProperty(bound.property, original.value, original.priority)
      }
    }
    onMove(moved.size)
  }

  const onInput = (event: Event) => {
    const control = event.target
    if (!isControl(control)) return
    if (control.value === '') {
      if (moved.has(control)) unmove(control)
      return
    }
    const bound = resolve(control)
    const style = bound && styleOf(bound.target)
    if (!bound || !style) return
    const kept = originals.get(bound.target) ?? new Map<string, Original>()
    if (!kept.has(bound.property)) {
      kept.set(bound.property, {
        value: style.getPropertyValue(bound.property),
        priority: style.getPropertyPriority(bound.property),
      })
      originals.set(bound.target, kept)
    }
    style.setProperty(bound.property, `${control.value}${bound.unit}`)
    // Last moved goes last, since `keepEdits` keeps the later of two on one property.
    moved.delete(control)
    moved.set(control, bound)
    onMove(moved.size)
  }

  doc.addEventListener('input', onInput, true)

  return {
    edits: () => {
      const entries: MovedControl[] = []
      for (const { control, target, property, unit } of moved.values()) {
        const index = elementIndex(doc, control)
        const at = elementIndex(doc, target)
        if (index === null || at === null || control.value === '') continue
        entries.push({
          index,
          value: control.value,
          unit,
          target: at,
          property,
        })
      }
      return keepEdits(entries)
    },
    reset: () => {
      for (const control of moved.keys()) control.value = control.defaultValue
      for (const [target, properties] of originals) {
        const style = styleOf(target)
        for (const [property, { value, priority }] of properties) {
          if (value === '') style?.removeProperty(property)
          else style?.setProperty(property, value, priority)
        }
      }
      moved.clear()
      originals.clear()
      onMove(0)
    },
    settle: () => {
      // The live page now matches the file, so a later reload or reset keeps these.
      for (const control of moved.keys()) {
        control.setAttribute('value', control.value)
      }
      moved.clear()
      originals.clear()
      onMove(0)
    },
    detach: () => doc.removeEventListener('input', onInput, true),
  }
}

/**
 * An element's inline style, read by shape rather than `instanceof`, since
 * the frame's elements come from its own window's classes.
 */
function styleOf(element: Element): CSSStyleDeclaration | null {
  const style = (element as Partial<ElementCSSInlineStyle>).style
  return style && typeof style.setProperty === 'function' ? style : null
}

function isControl(target: EventTarget | null): target is HTMLInputElement {
  return (
    target !== null &&
    'hasAttribute' in target &&
    (target as Element).hasAttribute(BINDS_ATTRIBUTE) &&
    'value' in target &&
    'defaultValue' in target
  )
}

/** The binder of the entered frame's loaded document, with what undoes its wiring. */
let active: { ref: string; binder: Binder | null; unload: () => void } | null =
  null

function report(ref: string, moved: number): void {
  const state = controlsStore.getState()
  if (state.ref !== ref || state.moved !== moved) {
    controlsStore.setState({ ref, moved })
  }
}

function release(): void {
  if (!active) return
  active.binder?.reset()
  active.binder?.detach()
  active.unload()
  active = null
  controlsStore.setState({ ref: null, moved: 0 })
}

function enter(ref: string | null): void {
  if (active?.ref === ref) return
  release()
  if (ref === null) return
  let bound: Document | null = null
  const bind = () => {
    if (!active) return
    const doc = liveIframe(ref)?.contentDocument ?? null
    const loaded = doc && doc.URL !== 'about:blank' ? doc : null
    if (loaded === bound) return
    active.binder?.detach()
    bound = loaded
    active.binder = loaded
      ? bindControls(loaded, (moved) => report(ref, moved))
      : null
    report(ref, 0)
  }
  // Binds again on every load, captured since a load never bubbles, as a reload is a new document.
  const onLoad = (event: Event) => {
    if (event.target === liveIframe(ref)) bind()
  }
  document.addEventListener('load', onLoad, true)
  active = {
    ref,
    binder: null,
    unload: () => document.removeEventListener('load', onLoad, true),
  }
  bind()
}

/**
 * Binds the entered frame's controls while Play runs, putting every unkept
 * value back on leaving, so Edit never shows a value the file does not hold.
 */
export function followEnteredControls(): () => void {
  enter(enteredStore.getState().ref)
  const unsubscribe = enteredStore.subscribe((state) => enter(state.ref))
  return () => {
    unsubscribe()
    release()
  }
}

/** Puts the entered frame's moved controls back to the file's values. */
export function resetControls(): void {
  active?.binder?.reset()
}

/**
 * Writes the moved values as one edit and one undo step, a refusal keeping
 * them moved so Keep values can run again.
 */
export async function keepControls(page: string): Promise<boolean> {
  const held = active
  const binder = held?.binder
  if (!held || !binder) return false
  const doc = liveIframe(held.ref)?.contentDocument
  const hash = doc ? renderedHash(doc) : null
  const edits = binder.edits()
  if (hash === null || edits.length === 0) return false
  const written = await writeElements(
    page,
    edits.map(({ index, change }) => ({
      key: { frame: held.ref, index, hash },
      change,
    })),
    // The live page already shows every value, so it is kept rather than reloaded.
    { previewed: true },
  )
  if (written && active?.binder === binder) binder.settle()
  return written
}
