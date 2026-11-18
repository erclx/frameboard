import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

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
    'adds %s with sample frames every check passes once they name the kit',
    async (name) => {
      board = writeBoard({
        'acme/project.json': '{ "version": 1, "pages": ["samples"] }\n',
      })
      await installKit(board.root, 'acme', findKit(board.root, name))
      const page = join(board.root, 'acme/samples')
      cpSync(join(board.root, 'acme/assets/kits', name, 'kit'), page, {
        recursive: true,
      })
      const layout = JSON.parse(readFileSync(join(page, 'layout.json'), 'utf8'))
      for (const frame of Object.keys(layout.frames)) {
        layout.frames[frame].kit = name
      }
      writeFileSync(join(page, 'layout.json'), JSON.stringify(layout))

      const result = await checkProject(board.root, 'acme')

      expect(result.findings).toEqual([])
      expect(result.checked).toBe(2)
    },
  )
})
