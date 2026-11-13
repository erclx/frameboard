import {
  act,
  cleanup,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  findAction,
  isEnabled,
  registerActions,
} from '@/client/actions/registry'
import { toast, Toaster } from '@/client/components/ui/toast'
import { pinnedProjects } from '@/client/home/pins'
import { liveStore } from '@/client/live/store'
import { createStructure } from '@/client/live/structure'
import { boardOf, frameOf, pageOf } from '@/test/board'

import {
  focusedProject,
  focusProject,
  projectStore,
  renameProject,
  useNewProjectAction,
  useProjectActions,
} from './actions'

interface Sent {
  path: string
  body: unknown
}

/** Answers every write with `data`, recording what was sent. */
function server(data: unknown = {}) {
  const sent: Sent[] = []
  const calls = createStructure(async (path, init) => {
    sent.push({ path: String(path), body: JSON.parse(String(init?.body)) })
    return Response.json({ ok: true, data })
  })
  return { sent, calls }
}

const OPEN = () => 'studio'

beforeEach(() => {
  liveStore.setState({ canWrite: true, board: boardOf() })
})

afterEach(() => {
  localStorage.clear()
  liveStore.setState({ canWrite: false, board: null })
  projectStore.setState({ focused: null, renaming: null })
})

describe('useProjectActions', () => {
  it('acts on the focused card on the home view', async () => {
    const { sent, calls } = server()
    renderHook(() => useProjectActions(focusedProject, { calls }))
    focusProject('studio')

    findAction('project.duplicate')?.run()

    await expect
      .poll(() => sent)
      .toEqual([{ path: '/api/project/duplicate', body: { ref: 'studio' } }])
  })

  it('offers nothing on the home view while no card is focused', () => {
    renderHook(() =>
      useProjectActions(focusedProject, { calls: server().calls }),
    )
    const rename = findAction('project.rename')

    expect(rename ? isEnabled(rename) : true).toBe(false)
  })

  it('acts on the open project on the board', async () => {
    const { sent, calls } = server()
    renderHook(() => useProjectActions(OPEN, { calls }))

    findAction('project.delete')?.run()

    await expect
      .poll(() => sent)
      .toEqual([{ path: '/api/project/delete', body: { ref: 'studio' } }])
  })

  it('names the project it acts on as the palette hint', () => {
    renderHook(() => useProjectActions(OPEN, { calls: server().calls }))

    expect(
      ['project.rename', 'project.duplicate', 'project.delete'].map((id) =>
        findAction(id)?.command?.hint?.(),
      ),
    ).toEqual(['studio', 'studio', 'studio'])
  })

  it('leaves the board once its project is deleted', async () => {
    let left = 0
    const onDeleted = () => {
      left += 1
    }
    renderHook(() =>
      useProjectActions(OPEN, { calls: server().calls, onDeleted }),
    )

    findAction('project.delete')?.run()

    await expect.poll(() => left).toBe(1)
  })
})

describe('useNewProjectAction', () => {
  it('leaves the board before the add, then opens the new name for renaming', async () => {
    const steps: string[] = []
    const { calls } = server({ name: 'untitled' })
    const leave = () => {
      steps.push(`left with ${projectStore.getState().renaming?.project}`)
    }
    renderHook(() => useNewProjectAction(calls, leave))

    findAction('project.new')?.run()

    await expect
      .poll(() => projectStore.getState().renaming?.project)
      .toBe('untitled')
    expect(steps).toEqual(['left with undefined'])
  })
})

describe('project.pin', () => {
  it('pins the focused card, and unpins it on a second run', () => {
    renderHook(() =>
      useProjectActions(focusedProject, { calls: server().calls }),
    )
    focusProject('studio')

    findAction('project.pin')?.run()
    const pinned = [...pinnedProjects()]
    findAction('project.pin')?.run()

    expect([pinned, [...pinnedProjects()]]).toEqual([['studio'], []])
  })

  it('pins in a tab that may not write, since a pin writes no board file', () => {
    liveStore.setState({ canWrite: false })
    renderHook(() =>
      useProjectActions(focusedProject, { calls: server().calls }),
    )
    focusProject('studio')
    const pin = findAction('project.pin')

    expect(pin ? isEnabled(pin) : false).toBe(true)
  })

  it('keeps a pin for the visit when storage refuses the write', () => {
    renderHook(() => useProjectActions(OPEN, { calls: server().calls }))
    const write = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota')
      })

    findAction('project.pin')?.run()
    const pinned = [...pinnedProjects()]
    write.mockRestore()
    findAction('project.pin')?.run()

    expect([pinned, [...pinnedProjects()]]).toEqual([['studio'], []])
  })

  it('drops the pin once its project is deleted', async () => {
    renderHook(() => useProjectActions(OPEN, { calls: server().calls }))
    findAction('project.pin')?.run()

    findAction('project.delete')?.run()

    await expect.poll(() => [...pinnedProjects()]).toEqual([])
  })

  it('leaves a duplicate unpinned', async () => {
    renderHook(() =>
      useProjectActions(OPEN, { calls: server({ name: 'studio 2' }).calls }),
    )
    findAction('project.pin')?.run()

    findAction('project.duplicate')?.run()

    await expect.poll(() => projectStore.getState().focused).toBe('studio 2')
    expect([...pinnedProjects()]).toEqual(['studio'])
  })
})

describe('renameProject', () => {
  it('moves the pin to the new name', async () => {
    localStorage.setItem('frameboard.home.pins', JSON.stringify(['studio']))

    await renameProject('studio', 'atlas', server().calls)

    expect([...pinnedProjects()]).toEqual(['atlas'])
  })

  it('keeps the pin on the old name when the rename is refused', async () => {
    localStorage.setItem('frameboard.home.pins', JSON.stringify(['studio']))
    const calls = createStructure(async () =>
      Response.json(
        { ok: false, error: { code: 'invalid-name', message: 'Bad name' } },
        { status: 400 },
      ),
    )

    await renameProject('studio', '..', calls)

    expect([...pinnedProjects()]).toEqual(['studio'])
  })

  it('resolves the new name once the rename lands', async () => {
    const { calls } = server()

    expect(await renameProject('studio', 'atlas', calls)).toBe('atlas')
  })

  it('resolves null when the server refuses the name', async () => {
    const calls = createStructure(async () =>
      Response.json(
        { ok: false, error: { code: 'invalid-name', message: 'Bad name' } },
        { status: 400 },
      ),
    )

    expect(await renameProject('studio', '..', calls)).toBeNull()
  })
})

describe('the Deleted toast', () => {
  let undone = 0
  let stopUndo: () => void = () => {}

  beforeEach(() => {
    undone = 0
    // Stands in for the history row, which answers from the server's journal.
    stopUndo = registerActions([
      {
        id: 'edit.undo',
        label: 'Undo',
        group: 'edit',
        palette: false,
        keys: ['$mod+KeyZ'],
        // As the history row's, lit only while the tab may write.
        enabled: () => liveStore.getState().canWrite,
        run: () => {
          undone++
        },
      },
    ])
    liveStore.setState({
      board: boardOf(pageOf([frameOf('hero'), frameOf('about')])),
      history: { undo: 0, redo: 0 },
    })
  })

  afterEach(() => {
    stopUndo()
    act(() => toast.close())
    cleanup()
  })

  const renderDeleting = (calls = server().calls) =>
    renderHook(() => useProjectActions(OPEN, { calls }), {
      wrapper: ({ children }) => createElement(Toaster, null, children),
    })

  const deleteAndLand = async () => {
    act(() => findAction('project.delete')?.run())
    await screen.findByText('Deleted studio')
    // The delete's own step reaches the journal.
    act(() => liveStore.setState({ history: { undo: 1, redo: 0 } }))
  }

  it('names the project and what it held', async () => {
    renderDeleting()

    act(() => findAction('project.delete')?.run())

    expect(await screen.findByText('Deleted studio')).toBeInTheDocument()
    expect(screen.getByText('1 page, 2 frames')).toBeInTheDocument()
  })

  it('runs undo from its Undo and closes', async () => {
    renderDeleting()
    await deleteAndLand()

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))

    expect(undone).toBe(1)
    await waitFor(() => expect(screen.queryByText('Deleted studio')).toBeNull())
  })

  it("waits on the delete's own step when Undo is pressed ahead of it", async () => {
    renderDeleting()
    act(() => findAction('project.delete')?.run())
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))

    act(() => liveStore.setState({ history: { undo: 1, redo: 0 } }))

    expect(undone).toBe(1)
  })

  it('names the undo key on its Undo with no keycap', async () => {
    renderDeleting()
    await deleteAndLand()

    const undo = screen.getByRole('button', { name: 'Undo' })

    expect(undo).toHaveAttribute('aria-keyshortcuts')
    expect(undo.querySelector('kbd')).toBeNull()
  })

  it('puts back a pin the delete dropped', async () => {
    renderDeleting()
    act(() => findAction('project.pin')?.run())
    await deleteAndLand()

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))

    expect([...pinnedProjects()]).toEqual(['studio'])
  })

  it('leaves the pin off when the undo cannot run', async () => {
    renderDeleting()
    act(() => findAction('project.pin')?.run())
    await deleteAndLand()
    act(() => liveStore.setState({ canWrite: false }))

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))

    expect(undone).toBe(0)
    expect([...pinnedProjects()]).toEqual([])
  })

  it("stays through the delete's own step", async () => {
    renderDeleting()

    await deleteAndLand()

    expect(screen.getByText('Deleted studio')).toBeInTheDocument()
  })

  it('closes on the next step after the delete', async () => {
    renderDeleting()
    await deleteAndLand()

    act(() => liveStore.setState({ history: { undo: 2, redo: 0 } }))

    await waitFor(() => expect(screen.queryByText('Deleted studio')).toBeNull())
  })

  it('shows no Deleted toast on a refused delete', async () => {
    renderDeleting(
      createStructure(async () =>
        Response.json(
          { ok: false, error: { code: 'busy', message: 'In use' } },
          { status: 400 },
        ),
      ),
    )

    act(() => findAction('project.delete')?.run())

    expect(
      await screen.findByText("Couldn't delete studio"),
    ).toBeInTheDocument()
    expect(screen.queryByText('Deleted studio')).toBeNull()
  })
})
