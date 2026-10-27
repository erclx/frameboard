import { render, renderHook, screen } from '@testing-library/react'
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
import { boardOf, frameOf, pageOf } from '@/test/board'

import { useBoardActions } from './board-actions'
import { Toolbar } from './chrome/toolbar'
import type { Box } from './geometry/box'
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

  it('copies a PNG only with exactly one frame selected', () => {
    const board = setup()
    done = board.done

    select(selectionStore, 'studio/home', [HERO.ref])
    const one = isEnabled(board.action('frame.copyPng'))
    select(selectionStore, 'studio/home', [HERO.ref, ABOUT.ref])
    const two = isEnabled(board.action('frame.copyPng'))

    expect([one, two]).toEqual([true, false])
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
  ]
  const UNNAMED = [
    'tool.move',
    'tool.hand',
    'mode.exitPlay',
    'view.pan.left',
    'view.pan.rightFar',
    'view.zoom50',
    'view.zoom100',
    'view.zoom200',
  ]

  it('lists what a person runs by name in the palette and nothing else', () => {
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
