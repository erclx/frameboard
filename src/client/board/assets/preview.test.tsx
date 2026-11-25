import '../../styles.css'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clear,
  select,
  selectElement,
  selectionStore,
} from '@/client/board/selection'
import { attachCanvas } from '@/client/board/view'
import { liveStore } from '@/client/live/store'
import { boardOf, frameOf, pageOf } from '@/test/board'

import type { PlaceableFile } from './drag'
import { openSourcing, sourcingDialogStore } from './open-dialog'
import { Preview } from './preview'

const PAGE = 'studio/home'
const SIGNUP = frameOf('signup')
const CHECKOUT = frameOf('checkout', {
  box: { x: 600, y: 0, width: 390, height: 844 },
})
const PHOTO: PlaceableFile = {
  project: 'studio',
  path: 'photo.png',
  kind: 'image',
}
const LANDED = { frame: SIGNUP.ref, index: 3, hash: 'd'.repeat(64) }

let detach = () => {}

/** Mounts a canvas showing this board area of the page. */
function show(visible: {
  x: number
  y: number
  width: number
  height: number
}) {
  detach = attachCanvas(
    {
      zoomBy: () => {},
      zoomTo: () => {},
      fit: () => {},
      fitTo: () => {},
      panBy: () => {},
      centerOn: () => {},
      visible: () => visible,
    },
    PAGE,
  )
}

function pane(extra: Partial<Parameters<typeof Preview>[0]> = {}) {
  return (
    <Preview
      picture={<span />}
      title="Photo"
      lines={['1024 × 768 · CC0 · Openverse']}
      save={{ state: undefined, run: () => {} }}
      file={async () => PHOTO}
      placeFrame={async () => LANDED}
      placeCanvas={async () => SIGNUP}
      {...extra}
    />
  )
}

beforeEach(() => {
  liveStore.setState({
    board: boardOf(pageOf([SIGNUP, CHECKOUT])),
    canWrite: true,
  })
  show({ x: 0, y: 0, width: 1200, height: 900 })
  openSourcing('find')
})

afterEach(() => {
  act(() => {
    detach()
    clear(selectionStore)
    liveStore.setState({ board: null, canWrite: false })
    sourcingDialogStore.setState({
      open: false,
      inserting: false,
      refusal: null,
    })
  })
})

describe('where Insert lands', () => {
  it('names the one selected frame and lands the file in it', async () => {
    select(selectionStore, PAGE, [SIGNUP.ref])
    const placeFrame = vi.fn(async () => LANDED)
    render(pane({ placeFrame }))

    await userEvent.click(
      screen.getByRole('button', { name: 'Insert into signup' }),
    )

    expect(placeFrame).toHaveBeenCalledWith(
      SIGNUP.ref,
      PHOTO,
      expect.anything(),
    )
  })

  it('names the frame an element is selected in', () => {
    selectElement(selectionStore, PAGE, {
      frame: CHECKOUT.ref,
      index: 4,
      hash: 'c'.repeat(64),
    })

    render(pane())

    expect(
      screen.getByRole('button', { name: 'Insert into checkout' }),
    ).toBeVisible()
  })

  it.each([
    ['no frame', []],
    ['two frames', [SIGNUP.ref, CHECKOUT.ref]],
  ])('offers the canvas with %s selected', async (_, frames) => {
    select(selectionStore, PAGE, frames)
    const placeCanvas = vi.fn(async () => SIGNUP)
    render(pane({ placeCanvas }))

    await userEvent.click(
      screen.getByRole('button', { name: 'Insert on canvas' }),
    )

    expect(placeCanvas).toHaveBeenCalledWith(PHOTO, expect.anything())
  })

  it('offers the canvas while the selected frame is out of view', () => {
    detach()
    show({ x: 3000, y: 0, width: 400, height: 400 })
    select(selectionStore, PAGE, [SIGNUP.ref])

    render(pane())

    expect(
      screen.getByRole('button', { name: 'Insert on canvas' }),
    ).toBeVisible()
  })

  it('offers no Insert with no canvas mounted', () => {
    detach()

    render(pane())

    expect(
      screen.queryByRole('button', { name: /Insert/ }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save to assets' })).toBeVisible()
  })
})

describe('while an insert is out', () => {
  it('lands one element however often it is pressed, and closes once it landed', async () => {
    let land = (_: PlaceableFile) => {}
    const placeCanvas = vi.fn(async () => SIGNUP)
    render(
      pane({
        file: () => new Promise((done) => (land = done)),
        placeCanvas,
      }),
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Insert on canvas' }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Inserting…' }))
    const openWhileOut = sourcingDialogStore.getState().open
    await act(async () => land(PHOTO))

    expect(openWhileOut).toBe(true)
    expect(placeCanvas).toHaveBeenCalledTimes(1)
    expect(sourcingDialogStore.getState().open).toBe(false)
  })

  it('keeps the dialog and says why beside the buttons when the save fails', async () => {
    const placeCanvas = vi.fn(async () => SIGNUP)
    render(
      pane({
        file: () => Promise.reject(new Error('The image host answered 500.')),
        placeCanvas,
      }),
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Insert on canvas' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The image host answered 500.',
    )
    expect(sourcingDialogStore.getState().open).toBe(true)
    expect(placeCanvas).not.toHaveBeenCalled()
  })

  it('says who holds the frame when the landing is refused', async () => {
    select(selectionStore, PAGE, [SIGNUP.ref])
    render(
      pane({
        placeFrame: async (_ref, _file, deps) => {
          deps?.notify?.({
            title: 'Nothing placed',
            description: 'claude is editing signup, so nothing was written.',
          })
          return null
        },
      }),
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Insert into signup' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'claude is editing signup, so nothing was written.',
    )
  })

  it('says the frame is not ready when its page takes nothing', async () => {
    select(selectionStore, PAGE, [SIGNUP.ref])
    render(pane({ placeFrame: async () => null }))

    await userEvent.click(
      screen.getByRole('button', { name: 'Insert into signup' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'signup is out of view or still loading, so nothing was inserted.',
    )
  })

  it('lands nothing on a page the canvas moved to since', async () => {
    let land = (_: PlaceableFile) => {}
    const placeCanvas = vi.fn(async () => SIGNUP)
    render(
      pane({ file: () => new Promise((done) => (land = done)), placeCanvas }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Insert on canvas' }),
    )

    detach()
    detach = attachCanvas(
      {
        zoomBy: () => {},
        zoomTo: () => {},
        fit: () => {},
        fitTo: () => {},
        panBy: () => {},
        centerOn: () => {},
        visible: () => ({ x: 0, y: 0, width: 1, height: 1 }),
      },
      'studio/about',
    )
    await act(async () => land(PHOTO))

    expect(placeCanvas).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The canvas moved to another page',
    )
  })
})

describe('saving', () => {
  it('names the file once it is saved', () => {
    render(
      pane({
        save: { state: { state: 'saved', path: 'photo.png' }, run: () => {} },
      }),
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      'Saved as assets/photo.png with its license beside it',
    )
  })

  it('says why a save failed beside its button', () => {
    render(
      pane({
        save: {
          state: { state: 'failed', message: 'Openverse answered 500.' },
          run: () => {},
        },
      }),
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Openverse answered 500.',
    )
    expect(screen.getByRole('button', { name: 'Save to assets' })).toBeEnabled()
  })

  it('says why a read-only tab has no buttons', () => {
    liveStore.setState({ canWrite: false })

    render(pane())

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText(/This tab is read-only/)).toBeVisible()
  })
})
