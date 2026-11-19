import {
  BINDS_ATTRIBUTE,
  isCustomProperty,
  type KeepEdit,
  keepEdits,
  type MovedControl,
  parseBinds,
  UNIT_ATTRIBUTE,
} from '@/shared/bindings'
import type { ControlBox, DrawnBinding } from '@/shared/frame-bridge/controls'
import { elementIndex, renderedHash } from '@/shared/frame-bridge/elements'

import type { Handlers } from './handler'

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

/** An element's inline style, null for one in a namespace with none. */
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

/** Every control in `doc` with the box it and its target draw at. */
export function readBindings(doc: Document): DrawnBinding[] {
  return [...doc.querySelectorAll(`[${BINDS_ATTRIBUTE}]`)].map(
    (control, key) => {
      const value = control.getAttribute(BINDS_ATTRIBUTE) ?? ''
      const binding = parseBinds(value)
      const target =
        binding && isCustomProperty(binding.property)
          ? matchOf(doc, binding.selector)
          : null
      const label = !binding
        ? `${value.trim() || BINDS_ATTRIBUTE}, no property`
        : !isCustomProperty(binding.property)
          ? `${binding.property}, not a custom property`
          : target
            ? `${binding.selector} ${binding.property}`
            : `${binding.selector}, no match`
      return {
        key,
        control: boxOf(control),
        target: target ? boxOf(target) : null,
        label,
      }
    },
  )
}

function matchOf(doc: Document, selector: string): Element | null {
  try {
    return doc.querySelector(selector)
  } catch {
    return null
  }
}

function boxOf(element: Element): ControlBox {
  const rect = element.getBoundingClientRect()
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  }
}

/** Each `controls` subscription's binder, by its request id. */
const binders = new Map<string, Binder>()

/**
 * The page's drawn controls, bound while Play runs and measured while the
 * board draws their links, so the board never reads the page.
 */
export const controlHandlers: Handlers = {
  controls: (_args, { id, push, onClose }) => {
    const binder = bindControls(document, (moved) => push(moved))
    binders.set(id, binder)
    // Every value goes back before the binding goes, so Edit shows the file.
    onClose(() => {
      binder.reset()
      binder.detach()
      binders.delete(id)
    })
    return true
  },
  'controls-act': ({ controls, act }) => {
    const binder = binders.get(controls)
    if (!binder) return false
    if (act === 'reset') binder.reset()
    else binder.settle()
    return true
  },
  // One read, so the hash names the bytes the edits were indexed against.
  'controls-edits': ({ controls }) => {
    const binder = binders.get(controls)
    const hash = renderedHash(document)
    const edits = binder?.edits() ?? []
    return hash === null || edits.length === 0 ? null : { hash, edits }
  },
  bindings: (_args, { push, onClose }) => {
    const read = () => push(readBindings(document))
    const resized = new ResizeObserver(read)
    resized.observe(document.documentElement)
    addEventListener('scroll', read, true)
    onClose(() => {
      resized.disconnect()
      removeEventListener('scroll', read, true)
    })
    return readBindings(document)
  },
}
