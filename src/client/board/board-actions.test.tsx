import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  bindKeys,
  findAction,
  isEnabled,
  useActions,
} from '@/client/actions/registry'
import { Toaster } from '@/client/components/ui/toast'
import { TooltipProvider } from '@/client/components/ui/tooltip'
import { liveStore, receiveBoard } from '@/client/live/store'
import { CommandPalette } from '@/client/palette/commands'
import { openOverlay } from '@/client/palette/overlay'
import { boardOf, frameOf, pageOf } from '@/test/board'

import { useBoardActions } from './board-actions'
import { Toolbar } from './chrome/toolbar'
import { clipboardBackend } from './copy-image'
import type { Box } from './geometry/box'
import { exportStore } from './inspector/export-store'
import { modeStore } from './mode'
import { closeNote, notesUi } from './notes/tool'
import { clear, select, selectionStore } from './selection'
import { attachCanvas } from './view'

const HERO = frameOf('hero', {
  box: { x: 10, y: 20, width: 300, height: 200 },
})
const ABOUT = frameOf('about', {
  box: { x: 400, y: 20, width: 300, height: 200 },
})

/**
 * The wait for a copy toast. The toast sits behind an image fetch no board
 * serves in the test, and a machine running several test processes stretched
 * it past testing-library's 1000 ms default in 5 of 36 measured copies. No
 * ceiling was measured, so 5 s is a fivefold margin.
 */
const TOAST_WAIT_MS = 5_000

/** The test budget for a toast case, set well above `TOAST_WAIT_MS`. */
const TOAST_TEST_TIMEOUT_MS = 15_000

const IDS = [
  'view.pan.left',
  'view.pan.rightFar',
  'view.zoomToSelection',
  'frame.copyPng',
  'frame.copyRef',
  'frame.exportPng',
  'tool.disarm',
] as const

function setup() {
  const pans: [number, number][] = []
  const fits: (readonly Box[])[] = []
  const detach = attachCanvas(
    {
      zoomBy: () => {},
      zoomTo: () => {},
      fit: () => {},
      fitTo: (boxes) => fits.push(boxes),
      panBy: (dx, dy) => pans.push([dx, dy]),
      centerOn: () => {},
      visible: () => ({ x: 0, y: 0, width: 800, height: 600 }),
    },
    'studio/home',
  )
  const { result, unmount } = renderHook(() => {
    useBoardActions()
    return useActions(IDS)
  })
  const action = (id: (typeof IDS)[number]) => {
    const found = result.current[IDS.indexOf(id)]
    if (!found) throw new Error(`no action ${id}`)
    return found
  }
  return {
    pans,
    fits,
    action,
    done: () => {
      unmount()
      detach()
    },
  }
}

describe('useBoardActions', () => {
  let done = () => {}

  beforeEach(() => {
    receiveBoard(liveStore, boardOf(pageOf([HERO, ABOUT])))
  })

  afterEach(() => {
    done()
    clear(selectionStore)
    modeStore.setState({ mode: 'edit', tool: 'move' })
    closeNote()
  })

  describe('Esc with a tool armed', () => {
    it.each(['hand', 'frame', 'note', 'text', 'shape'] as const)(
      'returns %s to Move and keeps the selection',
      (tool) => {
        const board = setup()
        done = board.done
        select(selectionStore, 'studio/home', [HERO.ref])
        modeStore.setState({ tool })

        board.action('tool.disarm').run()

        expect(modeStore.getState().tool).toBe('move')
        expect(selectionStore.getState().frames).toEqual([HERO.ref])
      },
    )

    it('drops focus from the toolbar button that armed the tool', async () => {
      const board = setup()
      done = board.done
      render(
        <TooltipProvider>
          <Toolbar />
        </TooltipProvider>,
      )
      await userEvent.click(screen.getByRole('button', { name: 'Hand' }))

      board.action('tool.disarm').run()

      expect(document.activeElement).toBe(document.body)
    })

    it('stands aside with Move already on', () => {
      const board = setup()
      done = board.done

      expect(isEnabled(board.action('tool.disarm'))).toBe(false)
    })

    it('stands aside while a note card is open, which Esc closes first', () => {
      const board = setup()
      done = board.done
      modeStore.setState({ tool: 'text' })

      notesUi.setState({
        open: { kind: 'thread', page: 'studio/home', id: 'n1' },
      })

      expect(isEnabled(board.action('tool.disarm'))).toBe(false)
    })

    it('stands aside in Play, where Esc exits Play', () => {
      const board = setup()
      done = board.done
      modeStore.setState({ tool: 'text', mode: 'play' })

      expect(isEnabled(board.action('tool.disarm'))).toBe(false)
    })
  })

  it('pans by 40 px on an arrow with nothing selected', () => {
    const board = setup()
    done = board.done

    board.action('view.pan.left').run()

    expect(board.pans).toEqual([[-40, 0]])
  })

  it('pans by 200 px on Shift with an arrow', () => {
    const board = setup()
    done = board.done

    board.action('view.pan.rightFar').run()

    expect(board.pans).toEqual([[200, 0]])
  })

  it('leaves the arrows to the nudge while a frame is selected', () => {
    const board = setup()
    done = board.done

    select(selectionStore, 'studio/home', [HERO.ref])

    expect(isEnabled(board.action('view.pan.left'))).toBe(false)
  })

  it('zooms to the boxes of the selected frames', () => {
    const board = setup()
    done = board.done
    select(selectionStore, 'studio/home', [HERO.ref, ABOUT.ref])

    board.action('view.zoomToSelection').run()

    expect(board.fits).toEqual([[HERO.box, ABOUT.box]])
  })

  it('copies a PNG with one frame or several selected, and not with none', () => {
    const board = setup()
    done = board.done

    select(selectionStore, 'studio/home', [])
    const none = isEnabled(board.action('frame.copyPng'))
    select(selectionStore, 'studio/home', [HERO.ref])
    const one = isEnabled(board.action('frame.copyPng'))
    select(selectionStore, 'studio/home', [HERO.ref, ABOUT.ref])
    const two = isEnabled(board.action('frame.copyPng'))

    expect([none, one, two]).toEqual([false, true, true])
  })

  describe(
    'copying a frame as a PNG',
    { timeout: TOAST_TEST_TIMEOUT_MS },
    () => {
      afterEach(() => {
        vi.restoreAllMocks()
      })

      it('raises a success toast naming the frame and the theme shown', async () => {
        // No board serves the image here, so the pending value refuses unread.
        vi.spyOn(navigator.clipboard, 'write').mockImplementation(
          async (items) => {
            await items[0]?.getType('image/png').catch(() => null)
          },
        )
        render(<Toaster />)
        const board = setup()
        done = board.done
        select(selectionStore, 'studio/home', [HERO.ref])

        board.action('frame.copyPng').run()

        expect(
          await screen.findByText(
            'Copied hero',
            {},
            { timeout: TOAST_WAIT_MS },
          ),
        ).toBeVisible()
        expect(
          screen.getByText('PNG on the clipboard, in the light theme.'),
        ).toBeVisible()
      })

      it('raises an error toast when the clipboard refuses the write', async () => {
        vi.spyOn(navigator.clipboard, 'write').mockImplementation(
          async (items) => {
            await items[0]?.getType('image/png').catch(() => null)
            throw new Error('Write permission denied.')
          },
        )
        render(<Toaster />)
        const board = setup()
        done = board.done
        select(selectionStore, 'studio/home', [HERO.ref])

        board.action('frame.copyPng').run()

        expect(
          await screen.findByText(
            "Couldn't copy hero",
            {},
            { timeout: TOAST_WAIT_MS },
          ),
        ).toBeVisible()
        expect(screen.queryByText('Copied hero')).toBeNull()
      })
    },
  )

  describe(
    'copying several frames as PNG',
    { timeout: TOAST_TEST_TIMEOUT_MS },
    () => {
      afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
        liveStore.setState({ canWrite: false })
      })

      /** Answers health with `clipboard`, records each clipboard route body, and serves no PNG. */
      function stubServer(clipboard: string | null) {
        const posted: unknown[] = []
        vi.stubGlobal(
          'fetch',
          async (input: RequestInfo | URL, init?: RequestInit) => {
            const path = new URL(String(input), location.href).pathname
            if (path === '/api/health') return Response.json({ clipboard })
            if (path === '/api/frames/clipboard') {
              posted.push(JSON.parse(String(init?.body)))
              return Response.json({
                ok: true,
                data: { copied: 2, backend: 'wsl' },
              })
            }
            return new Response(null, { status: 404 })
          },
        )
        const writes = vi
          .spyOn(navigator.clipboard, 'write')
          .mockImplementation(async (items) => {
            await items[0]?.getType('image/png').catch(() => null)
          })
        return { posted, writes }
      }

      async function copyBoth(backend: string | null) {
        render(<Toaster />)
        const board = setup()
        done = board.done
        await vi.waitFor(() => expect(clipboardBackend()).toBe(backend))
        select(selectionStore, 'studio/home', [HERO.ref, ABOUT.ref])
        board.action('frame.copyPng').run()
      }

      it('sends them to the clipboard route where the server holds a backend', async () => {
        const { posted, writes } = stubServer('wsl')
        liveStore.setState({ canWrite: true })

        await copyBoth('wsl')

        expect(
          await screen.findByText(
            'Copied 2 frames',
            {},
            { timeout: TOAST_WAIT_MS },
          ),
        ).toBeVisible()
        expect(posted).toEqual([
          { refs: [HERO.ref, ABOUT.ref], theme: 'light' },
        ])
        expect(writes).not.toHaveBeenCalled()
      })

      it('stitches them into one image where the server holds none', async () => {
        const { posted, writes } = stubServer(null)
        liveStore.setState({ canWrite: true })

        await copyBoth(null)

        expect(writes).toHaveBeenCalledOnce()
        expect(posted).toEqual([])
      })

      it('stitches them in a tab without the board key, which the route refuses', async () => {
        const { posted, writes } = stubServer('wsl')
        liveStore.setState({ canWrite: false })

        await copyBoth('wsl')

        expect(writes).toHaveBeenCalledOnce()
        expect(posted).toEqual([])
      })
    },
  )

  it('zooms to nothing in Play', () => {
    const board = setup()
    done = board.done
    select(selectionStore, 'studio/home', [HERO.ref])

    modeStore.setState({ mode: 'play' })

    expect(isEnabled(board.action('view.zoomToSelection'))).toBe(false)
  })
})

describe('command', () => {
  const NAMED = [
    'view.zoomToFit',
    'view.zoomToSelection',
    'view.zoomIn',
    'view.zoomOut',
    'view.hideUi',
    'frame.copyPng',
    'mode.play',
    'mode.edit',
    'tool.move',
    'tool.hand',
    'view.zoom50',
    'view.zoom100',
    'view.zoom200',
    'frame.copyRef',
    'frame.exportPng',
  ]
  const UNNAMED = [
    'mode.exitPlay',
    'tool.disarm',
    'view.pan.left',
    'view.pan.rightFar',
  ]

  it('lists every action in the palette bar Esc aliases and pans', () => {
    const { unmount } = renderHook(() => useBoardActions())

    const listed = (ids: string[]) =>
      ids.filter((id) => findAction(id)?.command !== undefined)
    expect([listed(NAMED), listed(UNNAMED)]).toEqual([NAMED, []])
    unmount()
  })

  it('renames the mode switches for the palette', () => {
    const { unmount } = renderHook(() => useBoardActions())

    expect(
      ['mode.play', 'mode.edit'].map((id) => findAction(id)?.command?.label),
    ).toEqual(['Switch to Play', 'Switch to Edit'])
    unmount()
  })
})

describe('the frame rows the palette adds', () => {
  let done = () => {}

  beforeEach(() => {
    receiveBoard(liveStore, boardOf(pageOf([HERO, ABOUT])))
    exportStore.setState({ scale: 3, theme: 'light' })
  })

  afterEach(() => {
    done()
    clear(selectionStore)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('copies the selected frames’ refs, one to a line', async () => {
    const written: string[] = []
    vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(
      async (text) => {
        written.push(text)
      },
    )
    render(<Toaster />)
    const board = setup()
    done = board.done
    select(selectionStore, 'studio/home', [HERO.ref, ABOUT.ref])

    board.action('frame.copyRef').run()

    expect(await screen.findByText('Copied 2 frame refs')).toBeVisible()
    expect(written).toEqual([`${HERO.ref}\n${ABOUT.ref}`])
  })

  it('exports one frame at the scale and theme the Export section holds', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
          headers: { 'Content-Type': 'image/png' },
        }),
    )
    const saved: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download)
    })
    render(<Toaster />)
    const board = setup()
    done = board.done
    select(selectionStore, 'studio/home', [HERO.ref])

    board.action('frame.exportPng').run()

    expect(await screen.findByText('Exported hero')).toBeVisible()
    expect(saved).toEqual(['hero.light@3x.png'])
  })

  it('resizes the selected frames to a size, keeping their place', async () => {
    const sent: unknown[] = []
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)))
      return Response.json({})
    })
    liveStore.setState({ canWrite: true })
    const board = setup()
    done = () => {
      board.done()
      liveStore.setState({ canWrite: false })
    }
    select(selectionStore, 'studio/home', [HERO.ref])

    findAction('frame.resizeTo.phone')?.run()

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({
      boxes: { hero: { x: 10, y: 20, width: 390, height: 844 } },
    })
  })

  it('offers a size only once a query is typed', async () => {
    liveStore.setState({ canWrite: true })
    const board = setup()
    done = () => {
      board.done()
      liveStore.setState({ canWrite: false })
    }
    select(selectionStore, 'studio/home', [HERO.ref])
    render(<CommandPalette />)
    act(() => openOverlay('commands'))
    const input = await screen.findByRole('combobox')
    const before = screen.queryAllByRole('option', { name: /^Resize to/ })

    await userEvent.type(input, 'iphone 16')

    expect([
      before,
      await screen.findByRole('option', { name: /^Resize to iPhone 16\b/ }),
    ]).toEqual([[], expect.anything()])
    act(() => openOverlay(null))
  })

  it.each([
    ['export', 'Export as PNG'],
    ['resize', 'Resize to Phone'],
    ['zoom to 100', 'Zoom to 100%'],
    ['copy ref', 'Copy frame ref'],
  ])('finds a row by %s', async (query, label) => {
    liveStore.setState({ canWrite: true })
    const board = setup()
    done = () => {
      board.done()
      liveStore.setState({ canWrite: false })
    }
    select(selectionStore, 'studio/home', [HERO.ref])
    render(<CommandPalette />)
    act(() => openOverlay('commands'))

    await userEvent.type(await screen.findByRole('combobox'), query)

    expect(
      await screen.findByRole('option', { name: new RegExp(`^${label}`) }),
    ).toBeInTheDocument()
    act(() => openOverlay(null))
  })

  it('exports only with one frame selected', () => {
    const board = setup()
    done = board.done

    select(selectionStore, 'studio/home', [HERO.ref])
    const one = isEnabled(board.action('frame.exportPng'))
    select(selectionStore, 'studio/home', [HERO.ref, ABOUT.ref])
    const two = isEnabled(board.action('frame.exportPng'))

    expect([one, two]).toEqual([true, false])
  })
})

describe('Shift+0', () => {
  it('zooms to 100%', async () => {
    const zooms: number[] = []
    const detach = attachCanvas(
      {
        zoomBy: () => {},
        zoomTo: (scale) => zooms.push(scale),
        fit: () => {},
        fitTo: () => {},
        panBy: () => {},
        centerOn: () => {},
        visible: () => ({ x: 0, y: 0, width: 800, height: 600 }),
      },
      'studio/home',
    )
    const { unmount } = renderHook(() => useBoardActions())
    const unbind = bindKeys(window)

    await userEvent.keyboard('{Shift>}){/Shift}')

    expect(zooms).toEqual([1])
    unbind()
    unmount()
    detach()
  })
})
