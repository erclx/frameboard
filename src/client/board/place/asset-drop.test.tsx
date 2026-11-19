import { draggable } from '@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter'
import { act, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { liveStore } from '@/client/live/store'
import type { AssetFile } from '@/shared/records/assets'
import type { FrameRecord } from '@/shared/records/list'
import type { ImageResult, ModelResult } from '@/shared/records/sourcing'
import { frameOf } from '@/test/board'

import type { DraggedResult, PlaceableFile } from '../assets/drag'
import { ModelTile, ResultTile } from '../assets/find/result-tile'
import { Tile } from '../assets/tile'
import type { BoardPoint } from '../notes/pick'
import { tileDragStore, useAssetDrop } from './asset-drop'

const nextFrame = () =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)))

interface Placed {
  at: BoardPoint
  file: PlaceableFile
}

/** A frame over the hit layer's left half, so a point at x under 100 is over it and one past it is bare canvas. */
const HERO = frameOf('hero', { box: { x: 0, y: 0, width: 100, height: 200 } })
const FRAMES = [HERO]

/** A 200 by 200 hit layer at the page's top left, its board points the client's own. */
function HitLayer({
  placed,
  framed = [],
  frames = FRAMES,
  found = [],
}: {
  placed: Placed[]
  framed?: Placed[]
  frames?: FrameRecord[]
  /** Each found result dropped, which lands as `house.jpg` once saved. */
  found?: DraggedResult[]
}) {
  const hit = useRef<HTMLDivElement>(null)
  const [container] = useState(() => document.createElement('div'))
  useAssetDrop(hit, {
    enabled: true,
    container,
    page: 'studio/home',
    frames: () => frames,
    toBoard: ({ clientX, clientY }) => ({ x: clientX, y: clientY }),
    place: async (_container, _page, _frames, at, file) => {
      placed.push({ at, file })
      return null
    },
    placeFrame: async (_page, _frames, at, file) => {
      framed.push({ at, file })
      return null
    },
    placeFound: async (result, land) => {
      found.push(result)
      await land({ project: 'studio', path: 'house.jpg', kind: 'image' })
    },
    measure: async () => ({ width: 64, height: 36 }),
  })
  return (
    <div
      ref={hit}
      data-testid="hit"
      style={{ position: 'fixed', left: 0, top: 0, width: 200, height: 200 }}
    />
  )
}

function renderBoard(
  files: AssetFile[],
  placed: Placed[],
  framed: Placed[] = [],
  frames?: FrameRecord[],
) {
  return render(
    <div>
      <HitLayer placed={placed} framed={framed} frames={frames} />
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

  it('adds a frame for a tile dropped on bare canvas and places nothing', async () => {
    const placed: Placed[] = []
    const framed: Placed[] = []
    renderBoard([{ path: 'demo.mp4', kind: 'video', size: 10 }], placed, framed)

    await dragTo(
      screen.getByRole('button', { name: /^Copy path of demo.mp4,/ }),
      screen.getByTestId('hit'),
      { clientX: 150, clientY: 60 },
    )

    expect(framed).toEqual([
      {
        at: { x: 150, y: 60 },
        file: { project: 'studio', path: 'demo.mp4', kind: 'video' },
      },
    ])
    expect(placed).toEqual([])
  })

  it('holds the ghost of the frame a drop on bare canvas would make', async () => {
    renderBoard([{ path: 'hero.png', kind: 'image', size: 10 }], [])
    const ghosts: unknown[] = []
    const stop = tileDragStore.subscribe(({ ghost }) => ghosts.push(ghost))

    await dragTo(
      screen.getByRole('button', { name: /^Copy path of hero.png,/ }),
      screen.getByTestId('hit'),
      { clientX: 150, clientY: 60 },
    )
    stop()

    // The page holds a frame named hero, so the new one takes the next name.
    expect(ghosts).toContainEqual({
      box: { x: 118, y: 42, width: 64, height: 36 },
      name: 'hero-2',
      hugsHeight: false,
    })
    expect(tileDragStore.getState().ghost).toBeNull()
  })

  it('holds no ghost while the tile is over a frame', async () => {
    renderBoard([{ path: 'hero.png', kind: 'image', size: 10 }], [])
    const ghosts: unknown[] = []
    const stop = tileDragStore.subscribe(({ ghost }) => ghosts.push(ghost))

    await dragTo(
      screen.getByRole('button', { name: /^Copy path of hero.png,/ }),
      screen.getByTestId('hit'),
      { clientX: 40, clientY: 60 },
    )
    stop()

    expect(ghosts.filter((ghost) => ghost !== null)).toEqual([])
  })

  it('makes no frame and holds no ghost over a hidden frame', async () => {
    const hidden = frameOf('clip', {
      box: { x: 100, y: 0, width: 100, height: 200 },
      hidden: true,
    })
    const placed: Placed[] = []
    const framed: Placed[] = []
    renderBoard(
      [{ path: 'clip.webm', kind: 'video', size: 10 }],
      placed,
      framed,
      [HERO, hidden],
    )
    const ghosts: unknown[] = []
    const stop = tileDragStore.subscribe(({ ghost }) => ghosts.push(ghost))

    await dragTo(
      screen.getByRole('button', { name: /^Copy path of clip.webm,/ }),
      screen.getByTestId('hit'),
      { clientX: 150, clientY: 60 },
    )
    stop()

    expect(framed).toEqual([])
    expect(placed).toHaveLength(1)
    expect(ghosts.filter((ghost) => ghost !== null)).toEqual([])
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

describe('useAssetDrop with a found result', () => {
  const HOUSE: ImageResult = {
    number: 1,
    id: 'a1',
    title: 'Glass house',
    creator: null,
    creatorUrl: null,
    license: 'cc0',
    licenseVersion: null,
    licenseUrl: null,
    attribution: null,
    landingUrl: null,
    url: 'https://images.example.org/a1.jpg',
    thumbnail: null,
    width: 64,
    height: 48,
  }

  function renderFinds(
    placed: Placed[],
    framed: Placed[],
    found: DraggedResult[],
  ) {
    return render(
      <div>
        <HitLayer placed={placed} framed={framed} found={found} />
        <ul style={{ position: 'fixed', left: 300, top: 0, width: 200 }}>
          <ResultTile
            project="studio"
            result={HOUSE}
            query="Glass House"
            credited={false}
            onSave={() => {}}
          />
        </ul>
      </div>,
    )
  }

  it('saves a result dropped on a frame, then places the saved file there', async () => {
    const placed: Placed[] = []
    const found: DraggedResult[] = []
    renderFinds(placed, [], found)

    await dragTo(screen.getByRole('listitem'), screen.getByTestId('hit'), {
      clientX: 80,
      clientY: 60,
    })

    expect(found).toEqual([
      {
        request: {
          project: 'studio',
          result: { id: 'a1' },
          query: 'Glass House',
          credited: false,
        },
        name: 'glass-house',
        natural: { width: 64, height: 48 },
      },
    ])
    expect(placed).toEqual([
      {
        at: { x: 80, y: 60 },
        file: { project: 'studio', path: 'house.jpg', kind: 'image' },
      },
    ])
  })

  it('makes a frame for a result dropped on bare canvas', async () => {
    const placed: Placed[] = []
    const framed: Placed[] = []
    renderFinds(placed, framed, [])

    await dragTo(screen.getByRole('listitem'), screen.getByTestId('hit'), {
      clientX: 150,
      clientY: 60,
    })

    expect(framed).toEqual([
      {
        at: { x: 150, y: 60 },
        file: { project: 'studio', path: 'house.jpg', kind: 'image' },
      },
    ])
    expect(placed).toEqual([])
  })

  it('draws the ghost at the size the source reports before anything is saved', async () => {
    const found: DraggedResult[] = []
    renderFinds([], [], found)
    const ghosts: unknown[] = []
    const stop = tileDragStore.subscribe(({ ghost }) => ghosts.push(ghost))

    await dragTo(screen.getByRole('listitem'), screen.getByTestId('hit'), {
      clientX: 150,
      clientY: 60,
    })
    stop()

    expect(ghosts).toContainEqual({
      box: { x: 118, y: 36, width: 64, height: 48 },
      name: 'glass-house',
      hugsHeight: false,
    })
  })

  it('saves nothing for a result let go away from the canvas', async () => {
    const found: DraggedResult[] = []
    renderFinds([], [], found)
    const tile = screen.getByRole('listitem')
    const from = tile.getBoundingClientRect()

    tile.dispatchEvent(
      new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer: new DataTransfer(),
        clientX: from.left + 4,
        clientY: from.top + 4,
      }),
    )
    await nextFrame()
    tile.dispatchEvent(new DragEvent('dragend', { bubbles: true }))
    await nextFrame()

    expect(found).toEqual([])
  })

  it('drags no result on a read-only tab', async () => {
    act(() => liveStore.setState({ canWrite: false }))
    const found: DraggedResult[] = []
    renderFinds([], [], found)

    await dragTo(screen.getByRole('listitem'), screen.getByTestId('hit'), {
      clientX: 80,
      clientY: 60,
    })

    expect(found).toEqual([])
  })
})

describe('useAssetDrop with a found model', () => {
  const STOOL: ModelResult = {
    number: 1,
    id: 'wooden_stool_01',
    name: 'Wooden Stool 01',
    authors: [],
    categories: [],
    tags: [],
    license: 'cc0',
    landingUrl: 'https://polyhaven.com/a/wooden_stool_01',
    thumbnail: null,
    polycount: 10946,
    dimensionsMm: null,
    sizes: ['1k'],
    downloadCount: null,
  }

  it('saves a dropped model as a model, sizing nothing from pixels it has none of', async () => {
    const found: DraggedResult[] = []
    render(
      <div>
        <HitLayer placed={[]} found={found} />
        <ul style={{ position: 'fixed', left: 300, top: 0, width: 200 }}>
          <ModelTile
            project="studio"
            result={STOOL}
            query="Wooden Stool"
            onSave={() => {}}
          />
        </ul>
      </div>,
    )

    await dragTo(screen.getByRole('listitem'), screen.getByTestId('hit'), {
      clientX: 80,
      clientY: 60,
    })

    expect(found).toEqual([
      {
        request: {
          project: 'studio',
          result: { id: 'wooden_stool_01' },
          query: 'Wooden Stool',
          credited: false,
          kind: 'model',
        },
        name: 'wooden-stool',
        natural: null,
      },
    ])
  })
})
