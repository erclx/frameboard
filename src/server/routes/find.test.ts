import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { findRoutes } from './find'

describe('GET /api/find', () => {
  let board: FixtureBoard
  let routes: ReturnType<typeof findRoutes>

  beforeEach(() => {
    board = copyFixtureBoard('live')
    routes = findRoutes(board.root)
  })

  afterEach(() => {
    board.cleanup()
  })

  function find(query: string) {
    return routes.request(`/api/find?${query}`)
  }

  it('answers a hit on another page than the first', async () => {
    const response = await find('project=studio&q=plans')

    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.data.hits).toContainEqual(
      expect.objectContaining({
        kind: 'frame',
        page: 'pricing',
        name: 'plans',
      }),
    )
  })

  it('answers no hits for an empty query', async () => {
    const response = await find('project=studio&q=')

    expect(await response.json()).toEqual({
      ok: true,
      data: { project: 'studio', query: '', hits: [], truncated: false },
    })
  })

  it.each([
    ['a project the board does not hold', 'project=nowhere&q=a'],
    [
      'a name leaving the board',
      `project=${encodeURIComponent('../live')}&q=a`,
    ],
  ])('answers project-not-found for %s', async (_case, query) => {
    const response = await find(query)

    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'project-not-found' },
    })
  })

  it('refuses a request naming no project as usage', async () => {
    const response = await find('q=a')

    expect(response.status).toBe(400)
  })
})
