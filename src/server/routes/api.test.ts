import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { apiRoutes } from './api'

describe('apiRoutes', () => {
  let board: FixtureBoard

  beforeEach(() => {
    board = copyFixtureBoard('live')
  })

  afterEach(() => {
    board.cleanup()
  })

  describe('GET /api/board', () => {
    it('answers the scanned board in the envelope', async () => {
      const response = await apiRoutes(board.root).request('/api/board')

      const body = await response.json()
      expect(body).toMatchObject({ ok: true, data: { root: board.root } })
      expect(
        body.data.projects[0].pages.map((page: { name: string }) => page.name),
      ).toEqual(['home', 'pricing'])
    })
  })
})
