import { toast } from '@/client/components/ui/toast'
import { liveStore } from '@/client/live/store'

import { elementAt, renderedHash } from '../frame-dom'
import type { Box } from '../geometry/box'
import { type Corner, resizeBox } from '../geometry/resize'
import { degreesOf, previewStyle } from '../inspector/element/styles'
import { writeElement, writeElements } from '../inspector/element/write'
import type { Margins } from '../place/flow-guess'
import type { ElementKey } from '../selection'
import type { GroupMember, MemberEdit } from './group'

/** An element's size in its frame's CSS pixels. */
export interface ElementSize {
  width: number
  height: number
}

/**
 * What a corner drag writes on an element: width and height on a `box` or
 * `media`, width alone on `text`, whose height follows its words.
 */
export type ResizeKind = 'box' | 'text' | 'media'

/**
 * The kind of corner resize an element's markup takes, or null for one sized
 * by what it holds, being a container, or by its line, being a divider. A box
 * is a `div` holding no element and no text, as a placed Rectangle or Ellipse
 * is, and text holds nothing but words, so a `<p>` holding a `<b>` is a
 * container.
 */
export function resizeKindOf(element: Element | null): ResizeKind | null {
  if (!element) return null
  if (element.localName === 'img' || element.localName === 'video') {
    return 'media'
  }
  if (element.childElementCount > 0) return null
  if ((element.textContent ?? '').trim() !== '') return 'text'
  return element.localName === 'div' ? 'box' : null
}

/** What a live element's corner drag acts from. */
export interface ResizeRead {
  kind: ResizeKind
  /** The size media decodes to, null on anything else and until it decodes. */
  natural: ElementSize | null
  /** Whether a `text` element states no height, so its height follows its words. */
  hugsHeight: boolean
  /**
   * What the drawn box holds beyond a written size, being the padding and
   * border of a `content-box` element. The drag sizes the outline, a border
   * box, so a write takes this off rather than jump by it.
   */
  inset: ElementSize
}

/**
 * How a live element takes a corner resize, or null for one it would not
 * size. A rotated element's outline is its turned bounding box, whose corners
 * are not the element's own, and a width does nothing to inline text.
 */
export function readResize(element: Element): ResizeRead | null {
  const kind = resizeKindOf(element)
  const style = element.ownerDocument.defaultView?.getComputedStyle(element)
  if (!kind || !style || degreesOf(style.rotate) !== 0) return null
  if (kind === 'text' && style.display === 'inline') return null
  return {
    kind,
    natural: naturalSize(element),
    hugsHeight: kind === 'text' && !statesHeight(element),
    inset: contentBoxInset(style),
  }
}

function contentBoxInset(style: CSSStyleDeclaration): ElementSize {
  if (style.boxSizing !== 'content-box') return { width: 0, height: 0 }
  const sum = (...lengths: string[]) =>
    lengths.reduce((total, length) => total + (parseFloat(length) || 0), 0)
  return {
    width: sum(
      style.paddingLeft,
      style.paddingRight,
      style.borderLeftWidth,
      style.borderRightWidth,
    ),
    height: sum(
      style.paddingTop,
      style.paddingBottom,
      style.borderTopWidth,
      style.borderBottomWidth,
    ),
  }
}

function naturalSize(element: Element): ElementSize | null {
  const [width, height] = isImage(element)
    ? [element.naturalWidth, element.naturalHeight]
    : isVideo(element)
      ? [element.videoWidth, element.videoHeight]
      : [0, 0]
  return width > 0 && height > 0 ? { width, height } : null
}

// A node from the frame's realm, where this window's classes do not match it.
function isImage(element: Element): element is HTMLImageElement {
  return element.localName === 'img'
}

function isVideo(element: Element): element is HTMLVideoElement {
  return element.localName === 'video'
}

/** A height stated on the element itself, since a rule's height reads as none. */
function statesHeight(element: Element): boolean {
  const height = 'style' in element ? (element as HTMLElement).style.height : ''
  return height !== '' && height !== 'auto'
}

/**
 * How the element `key` names takes a corner resize, read off a live frame
 * showing the bytes it was read from, or null for one that takes none.
 */
export function shownResize(
  container: ParentNode,
  key: ElementKey,
): ResizeRead | null {
  const shown = container.querySelector<HTMLIFrameElement>(
    `[data-frame="${CSS.escape(key.frame)}"] iframe`,
  )?.contentDocument
  if (!shown || renderedHash(shown) !== key.hash) return null
  const element = elementAt(shown, key.index)
  return element ? readResize(element) : null
}

/**
 * The size dragging `corner` of an element drawn at `start` by a canvas offset
 * makes, at least 1 px a side and never flipped. `keepRatio`, Shift held,
 * scales both sides by whichever moved further to the shape of `ratio`, so an
 * Ellipse stays a circle.
 */
export function cornerSize(
  start: Box,
  corner: Corner,
  dx: number,
  dy: number,
  keepRatio: boolean,
  ratio: ElementSize = start,
): ElementSize {
  const { width, height } = resizeBox(start, corner, dx, dy)
  // A side drawn at 0 px has no ratio to keep.
  if (!keepRatio || ratio.width <= 0 || ratio.height <= 0) {
    return { width, height }
  }
  const scale = Math.max(width / ratio.width, height / ratio.height)
  return {
    width: Math.max(1, Math.round(ratio.width * scale)),
    height: Math.max(1, Math.round(ratio.height * scale)),
  }
}

/**
 * The size a corner drag of the element `read` describes makes. Text takes the
 * horizontal drag alone, which keeps a vertical drag from reading as a change,
 * and media holds the ratio it decodes to.
 */
export function dragSize(
  read: ResizeRead,
  start: Box,
  corner: Corner,
  dx: number,
  dy: number,
  keepRatio: boolean,
): ElementSize {
  return read.kind === 'text'
    ? cornerSize(start, corner, dx, 0, false)
    : cornerSize(start, corner, dx, dy, keepRatio, read.natural ?? start)
}

/** The declarations a corner drag to a drawn size writes on an element. */
export function resizeDeclarations(
  { kind, inset }: Pick<ResizeRead, 'kind' | 'inset'>,
  { width, height }: ElementSize,
): { property: string; value: string }[] {
  const px = (drawn: number, held: number) =>
    `${Math.max(0, Math.round(drawn - held))}px`
  const wide = { property: 'width', value: px(width, inset.width) }
  return kind === 'text'
    ? [wide]
    : [wide, { property: 'height', value: px(height, inset.height) }]
}

/** A corner drag of one element, previewed on its live node and written once on release. */
export interface ElementResize {
  preview: (size: ElementSize) => void
  /** Writes the size as one edit, putting the preview back when it is refused. */
  commit: (size: ElementSize) => Promise<boolean>
  /** Puts the preview back with nothing written. */
  cancel: () => void
}

/**
 * Starts a resize of the element `key` names, or answers null for a frame
 * another session holds, refused with the claim's toast before anything
 * previews, since the write would be refused once the drag ends.
 */
export function startElementResize(
  page: string,
  key: ElementKey,
  read: Pick<ResizeRead, 'kind' | 'inset'>,
): ElementResize | null {
  const holder = liveStore.getState().claims[key.frame]
  if (holder) {
    toast.add({
      title: 'Nothing resized',
      description: `${holder.tag} is editing ${key.frame.split('/').at(-1)}, so nothing was written.`,
      type: 'warning',
    })
    return null
  }
  const putBack = () => {
    previewStyle(key, 'width', null)
    previewStyle(key, 'height', null)
  }
  return {
    preview: (size) => {
      for (const { property, value } of resizeDeclarations(read, size)) {
        previewStyle(key, property, value)
      }
    },
    commit: async (size) => {
      const written = await writeElement(page, key, {
        kind: 'styles',
        declarations: resizeDeclarations(read, size),
      })
      // A landed write reloads the frame with the size, so only a refusal puts it back.
      if (!written) putBack()
      return written
    },
    cancel: putBack,
  }
}

/** A placed element's `left` and `top` in its frame's CSS pixels. */
export interface PlacedOffsets {
  left: number
  top: number
}

/**
 * The offsets a placed element holds, read off a live frame showing the
 * bytes `key` was read from, or null for one in the flow, whose drag
 * carries it to another gap instead.
 */
export function placedOffsets(
  container: ParentNode,
  key: ElementKey,
): PlacedOffsets | null {
  const shown = container.querySelector<HTMLIFrameElement>(
    `[data-frame="${CSS.escape(key.frame)}"] iframe`,
  )?.contentDocument
  if (!shown || renderedHash(shown) !== key.hash) return null
  const element = elementAt(shown, key.index)
  return element ? placedIn(element, []) : null
}

/** A drag of one placed element, previewed on its live node and written once on release. */
export interface PlacedMove {
  preview: (offsets: PlacedOffsets) => void
  /** Writes the offsets as one edit, putting the preview back when it is refused. */
  commit: (offsets: PlacedOffsets) => Promise<boolean>
  /** Puts the preview back with nothing written. */
  cancel: () => void
}

/**
 * Starts a drag of the placed element `key` names, or answers null for a
 * frame another session holds, refused with the claim's toast before
 * anything previews. It writes `left` and `top` on the element alone, never
 * its parent, since the offsets count from the box that already holds it.
 */
export function startPlacedMove(
  page: string,
  key: ElementKey,
): PlacedMove | null {
  const holder = liveStore.getState().claims[key.frame]
  if (holder) {
    toast.add({
      title: 'Nothing moved',
      description: `${holder.tag} is editing ${key.frame.split('/').at(-1)}, so nothing was written.`,
      type: 'warning',
    })
    return null
  }
  const show = (offsets: PlacedOffsets | null) => {
    previewStyle(key, 'left', offsets ? `${offsets.left}px` : null)
    previewStyle(key, 'top', offsets ? `${offsets.top}px` : null)
  }
  return {
    preview: show,
    commit: async ({ left, top }) => {
      const written = await writeElement(page, key, {
        kind: 'styles',
        declarations: [
          { property: 'left', value: `${left}px` },
          { property: 'top', value: `${top}px` },
        ],
      })
      if (!written) show(null)
      return written
    },
    cancel: () => show(null),
  }
}

/**
 * The `left` and `top` a live element holds when it is placed freely and no
 * other element of `group` holds it, else null. One inside another selected
 * element moves with that one, so a group drag moving it too would carry it
 * twice.
 */
export function placedIn(
  element: Element,
  group: readonly Element[],
): PlacedOffsets | null {
  if (group.some((other) => other !== element && other.contains(element))) {
    return null
  }
  const style = element.ownerDocument.defaultView?.getComputedStyle(element)
  if (!style || (style.position !== 'absolute' && style.position !== 'fixed')) {
    return null
  }
  const left = parseFloat(style.left)
  const top = parseFloat(style.top)
  return Number.isNaN(left) || Number.isNaN(top) ? null : { left, top }
}

/**
 * The selected elements `keys` names as a group drag reads them at the press,
 * each box in its frame's own pixels, off a live frame showing the bytes they
 * were read from, or null while it shows other bytes or misses one.
 */
export function shownGroup(
  container: ParentNode,
  keys: readonly ElementKey[],
): GroupMember[] | null {
  const [first] = keys
  const shown = first
    ? container.querySelector<HTMLIFrameElement>(
        `[data-frame="${CSS.escape(first.frame)}"] iframe`,
      )?.contentDocument
    : undefined
  if (!first || !shown || renderedHash(shown) !== first.hash) return null
  const found = keys.flatMap(({ index }) => {
    const element = elementAt(shown, index)
    return element ? [{ index, element }] : []
  })
  if (found.length !== keys.length) return null
  const elements = found.map(({ element }) => element)
  return found.map(({ index, element }) => {
    const rect = element.getBoundingClientRect()
    return {
      index,
      box: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      placed: placedIn(element, elements),
      read: readResize(element),
      margin: marginsOf(element),
    }
  })
}

/** The margins the frame's own window computed for `element`, 0 where it reads none. */
function marginsOf(element: Element): Margins {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element)
  const px = (value: string | undefined) => Number.parseFloat(value ?? '') || 0
  return {
    top: px(style?.marginTop),
    right: px(style?.marginRight),
    bottom: px(style?.marginBottom),
    left: px(style?.marginLeft),
  }
}

/** A drag of several elements, previewed on their live nodes and written once on release. */
export interface GroupEdit {
  preview: (edits: readonly MemberEdit[]) => void
  /** Writes every member's declarations as one edit and one undo step, putting the preview back when it is refused. */
  commit: (edits: readonly MemberEdit[]) => Promise<boolean>
  /** Puts the preview back with nothing written. */
  cancel: () => void
}

/**
 * Starts a group drag of the elements `keys` names, all of one frame at one
 * hash, or answers null for a frame another session holds, refused with the
 * claim's toast before anything previews.
 */
export function startGroupEdit(
  page: string,
  keys: readonly ElementKey[],
): GroupEdit | null {
  const [first] = keys
  if (!first) return null
  const holder = liveStore.getState().claims[first.frame]
  if (holder) {
    toast.add({
      title: 'Nothing moved',
      description: `${holder.tag} is editing ${first.frame.split('/').at(-1)}, so nothing was written.`,
      type: 'warning',
    })
    return null
  }
  const keyOf = new Map(keys.map((key) => [key.index, key]))
  const shown = new Set<string>()
  const putBack = () => {
    for (const at of shown) {
      const [index, property] = at.split(':')
      const key = keyOf.get(Number(index))
      if (key && property) previewStyle(key, property, null)
    }
    shown.clear()
  }
  return {
    preview: (edits) => {
      for (const { index, declarations } of edits) {
        const key = keyOf.get(index)
        if (!key) continue
        for (const { property, value } of declarations) {
          shown.add(`${index}:${property}`)
          previewStyle(key, property, value)
        }
      }
    },
    commit: async (edits) => {
      const written = await writeElements(
        page,
        edits.flatMap(({ index, declarations }) => {
          const key = keyOf.get(index)
          return key
            ? [{ key, change: { kind: 'styles' as const, declarations } }]
            : []
        }),
      )
      // A landed write reloads the frame with the offsets, so only a refusal puts them back.
      if (!written) putBack()
      return written
    },
    cancel: putBack,
  }
}
