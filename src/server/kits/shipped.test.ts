import { afterEach, describe, expect, it } from 'vitest'

import { checkProject } from '@/server/checks/run'
import { SHIPPED_KITS } from '@/shared/kits'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { installKit } from './install'
import { findKit } from './list'

describe('the shipped kits', () => {
  let board: TempBoard

  afterEach(() => {
    board.cleanup()
  })

  it.each(SHIPPED_KITS)(
    'installs %s with a sample page every check passes',
    async (name) => {
      board = writeBoard({
        'acme/project.json': '{ "version": 1, "pages": [] }\n',
      })

      await installKit(board.root, 'acme', findKit(board.root, name))
      const result = await checkProject(board.root, 'acme')

      expect(result.findings).toEqual([])
      expect(result.checked).toBe(2)
    },
  )
})
