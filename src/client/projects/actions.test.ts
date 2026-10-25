import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { findAction, isEnabled } from '@/client/actions/registry'
import { liveStore } from '@/client/live/store'
import { createStructure } from '@/client/live/structure'
import { boardOf } from '@/test/board'

import {
  focusedProject,
  focusProject,
  projectStore,
  renameProject,
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

describe('renameProject', () => {
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
