import { draggable } from '@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter'
import { act, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { liveStore } from '@/client/live/store'
import type { AssetFile } from '@/shared/records/assets'

import type { PlaceableFile } from '../assets/drag'
import { Tile } from '../assets/tile'
import type { BoardPoint } from '../notes/pick'
import { tileDragStore, useAssetDrop } from './asset-drop'

const nextFrame = () =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)))

interface Placed {
  at: BoardPoint
  file: PlaceableFile
}

/** A 200 by 200 hit layer at the page's top left, its board points the client's own. */
function HitLayer({ placed }: { placed: Placed[] }) {
  const hit = useRef<HTMLDivElement>(null)
  const [container] = useState(() => document.createElement('div'))
  useAssetDrop(hit, {
    enabled: true,
    container,
    page: 'studio/home',
    frames: () => [],
    toBoard: ({ clientX, clientY }) => ({ x: clientX, y: clientY }),
    place: async (_container, _page, _frames, at, file) => {
      placed.push({ at, file })
      return null
    },
  })
  return (
    <div
      ref={hit}
      data-testid="hit"
      style={{ position: 'fixed', left: 0, top: 0, width: 200, height: 200 }}
    />
  )
}

function renderBoard(files: AssetFile[], placed: Placed[]) {
  return render(
    <div>
      <HitLayer placed={placed} />
      <ul style={{ position: 'fixed', left: 300, top: 0, width: 200 }}>
        {files.map((file) => (
          <Tile key={file.path} project="studio" file={file} />
        ))}
      </ul>
    </div>,
  )
}

/** Drags `source` to a point on the hit layer through the native events the drag library listens to. */
async function dragTo(
  source: HTMLElement,
  target: HTMLElement,
  at: { clientX: number; clientY: number },
  dataTransfer = new DataTransfer(),
): Promise<void> {
  const from = source.getBoundingClientRect()
  const fire = (element: HTMLElement, type: string, point: object) =>
    element.dispatchEvent(
      new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        ...point,
      }),
    )
  fire(source, 'dragstart', {
    clientX: from.left + 4,
    clientY: from.top + 4,
  })
  await nextFrame()
  fire(target, 'dragenter', at)
  fire(target, 'dragover', at)
  await nextFrame()
  fire(target, 'drop', at)
  await nextFrame()
}

beforeEach(() => {
  act(() => liveStore.setState({ canWrite: true }))
})

afterEach(() => {
  act(() => liveStore.setState({ canWrite: false }))
})

describe('useAssetDrop', () => {
  it('places a dragged image tile at the point it was dropped', async () => {
    const placed: Placed[] = []
    renderBoard([{ path: 'hero.png', kind: 'image', size: 10 }], placed)

    await dragTo(
      screen.getByRole('button', { name: /^Copy path of hero.png,/ }),
      screen.getByTestId('hit'),
      { clientX: 80, clientY: 60 },
    )

    expect(placed).toEqual([
      {
        at: { x: 80, y: 60 },
        file: { project: 'studio', path: 'hero.png', kind: 'image' },
      },
    ])
  })

  it('follows the dragged tile and lets go once it drops', async () => {
    const placed: Placed[] = []
    renderBoard([{ path: 'demo.mp4', kind: 'video', size: 10 }], placed)
    const tile = screen.getByRole('button', { name: /^Copy path of demo.mp4,/ })
    const hit = screen.getByTestId('hit')
    const dataTransfer = new DataTransfer()
    const seen: (BoardPoint | null)[] = []
    const stop = tileDragStore.subscribe(({ at }) => seen.push(at))

    await dragTo(tile, hit, { clientX: 40, clientY: 30 }, dataTransfer)
    stop()

    expect(seen).toContainEqual({ x: 40, y: 30 })
    expect(tileDragStore.getState().at).toBeNull()
  })

  it('takes no drag that is not a tile', async () => {
    const placed: Placed[] = []
    renderBoard([], placed)
    const other = document.createElement('div')
    document.body.append(other)
    const stop = draggable({
      element: other,
      getInitialData: () => ({ list: 'pages', index: 0 }),
    })

    await dragTo(other, screen.getByTestId('hit'), { clientX: 80, clientY: 60 })
    stop()
    other.remove()

    expect(placed).toEqual([])
  })

  it('drags no tile for a font', async () => {
    const placed: Placed[] = []
    renderBoard([{ path: 'Inter.woff2', kind: 'font', size: 10 }], placed)

    await dragTo(
      screen.getByRole('button', { name: /^Copy path of Inter.woff2,/ }),
      screen.getByTestId('hit'),
      { clientX: 80, clientY: 60 },
    )

    expect(placed).toEqual([])
  })

  it('drags no tile on a read-only tab', async () => {
    act(() => liveStore.setState({ canWrite: false }))
    const placed: Placed[] = []
    renderBoard([{ path: 'hero.png', kind: 'image', size: 10 }], placed)

    await dragTo(
      screen.getByRole('button', { name: /^Copy path of hero.png,/ }),
      screen.getByTestId('hit'),
      { clientX: 80, clientY: 60 },
    )

    expect(placed).toEqual([])
  })

  it('takes a system file dropped on the canvas and places nothing', () => {
    const placed: Placed[] = []
    renderBoard([], placed)
    const hit = screen.getByTestId('hit')
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(new File(['x'], 'hero.png', { type: 'image/png' }))
    const over = new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    })
    const drop = new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    })

    hit.dispatchEvent(over)
    hit.dispatchEvent(drop)

    expect(over.defaultPrevented).toBe(true)
    expect(drop.defaultPrevented).toBe(true)
    expect(placed).toEqual([])
  })
})
