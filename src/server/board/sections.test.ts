import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { recordingJournal } from '../../../test/support/recording-journal'
import { moveFrame, setBoxes } from './frames'
import { addSection, deleteSection, renameSection } from './sections'

const BOX = { x: -40, y: -40, width: 2000, height: 1000 }

describe('sections', () => {
  let board: FixtureBoard
  let cwd: string

  beforeEach(() => {
    board = copyFixtureBoard('basic')
    cwd = board.root
  })

  afterEach(() => {
    board.cleanup()
  })

  function layout() {
    return JSON.parse(
      readFileSync(join(board.root, 'webapp/home/layout.json'), 'utf8'),
    )
  }

  describe('addSection', () => {
    it('writes a box on top of the page and answers its members', async () => {
      const section = await addSection(board.root, 'webapp/home', {
        cwd,
        name: 'onboarding',
        box: BOX,
      })

      expect(section).toEqual({
        name: 'onboarding',
        box: BOX,
        order: 0,
        frames: ['hero', 'about'],
      })
      expect(layout().sections).toEqual({ onboarding: { ...BOX, order: 0 } })
    })

    it('leaves every frame entry as it was', async () => {
      const before = layout().frames

      await addSection(board.root, 'webapp/home', { cwd, box: BOX })

      expect(layout().frames).toEqual(before)
    })

    it('takes the next free default name', async () => {
      await addSection(board.root, 'webapp/home', { cwd, box: BOX })

      const second = await addSection(board.root, 'webapp/home', {
        cwd,
        box: BOX,
      })

      expect([second.name, second.order]).toEqual(['section-2', 1])
    })

    it('refuses a name another section holds in any case', async () => {
      await addSection(board.root, 'webapp/home', {
        cwd,
        name: 'flow',
        box: BOX,
      })

      await expect(
        addSection(board.root, 'webapp/home', { cwd, name: 'Flow', box: BOX }),
      ).rejects.toMatchObject({ code: 'name-taken' })
    })

    it('refuses a name off the board name rule', async () => {
      await expect(
        addSection(board.root, 'webapp/home', {
          cwd,
          name: 'Onboarding flow',
          box: BOX,
        }),
      ).rejects.toMatchObject({ code: 'invalid-name' })
    })

    it('reports the new entry to the journal', async () => {
      const { journal, calls } = recordingJournal(board.root)

      await addSection(board.root, 'webapp/home', {
        cwd,
        name: 'flow',
        box: BOX,
        journal,
      })

      expect(calls).toEqual([
        {
          kind: 'section',
          page: 'webapp/home',
          section: 'flow',
          before: undefined,
          after: { ...BOX, order: 0 },
        },
      ])
    })
  })

  describe('renameSection', () => {
    it('moves the entry to the new name', async () => {
      await addSection(board.root, 'webapp/home', {
        cwd,
        name: 'flow',
        box: BOX,
      })

      const renamed = await renameSection(
        board.root,
        'webapp/home',
        'flow',
        'signup',
        { cwd },
      )

      expect(renamed.name).toBe('signup')
      expect(Object.keys(layout().sections)).toEqual(['signup'])
    })

    it('refuses section-not-found', async () => {
      await expect(
        renameSection(board.root, 'webapp/home', 'nope', 'signup', { cwd }),
      ).rejects.toMatchObject({ code: 'section-not-found' })
    })

    it('refuses a name another section holds', async () => {
      await addSection(board.root, 'webapp/home', {
        cwd,
        name: 'flow',
        box: BOX,
      })
      await addSection(board.root, 'webapp/home', {
        cwd,
        name: 'signup',
        box: BOX,
      })

      await expect(
        renameSection(board.root, 'webapp/home', 'flow', 'SIGNUP', { cwd }),
      ).rejects.toMatchObject({ code: 'name-taken' })
    })
  })

  describe('deleteSection', () => {
    it('removes the box and keeps its frames', async () => {
      await addSection(board.root, 'webapp/home', {
        cwd,
        name: 'flow',
        box: BOX,
      })
      const frames = layout().frames

      await deleteSection(board.root, 'webapp/home', 'flow', { cwd })

      expect([layout().sections, layout().frames]).toEqual([{}, frames])
    })

    it('refuses section-not-found', async () => {
      await expect(
        deleteSection(board.root, 'webapp/home', 'nope', { cwd }),
      ).rejects.toMatchObject({ code: 'section-not-found' })
    })
  })

  describe('beside other layout writers', () => {
    it('keeps the sections key through a CLI frame move', async () => {
      await addSection(board.root, 'webapp/home', {
        cwd,
        name: 'flow',
        box: BOX,
      })

      await moveFrame(board.root, 'webapp/home/hero', { cwd, x: 40 })

      expect(layout().sections).toEqual({ flow: { ...BOX, order: 0 } })
    })

    it('keeps a key a newer writer added to a section entry', async () => {
      writeFileSync(
        join(board.root, 'webapp/home/layout.json'),
        JSON.stringify({
          ...layout(),
          sections: { flow: { ...BOX, order: 0, tint: 'blue' } },
        }),
      )

      await renameSection(board.root, 'webapp/home', 'flow', 'signup', { cwd })

      expect(layout().sections.signup.tint).toBe('blue')
    })
  })

  describe('setBoxes with a section', () => {
    const moved = { ...BOX, x: 60, y: 60 }

    beforeEach(async () => {
      await addSection(board.root, 'webapp/home', {
        cwd,
        name: 'flow',
        box: BOX,
      })
    })

    it('moves the box and its members in one write', async () => {
      const { journal, calls } = recordingJournal(board.root)

      await setBoxes(
        board.root,
        'webapp/home',
        { hero: { x: 100, y: 100, width: 1440, height: 900 } },
        { hero: { x: 0, y: 0, width: 1440, height: 900 } },
        {
          cwd,
          journal,
          sections: { flow: moved },
          expectedSections: { flow: BOX },
        },
      )

      expect([layout().sections.flow, layout().frames.hero.x]).toEqual([
        { ...moved, order: 0 },
        100,
      ])
      expect(calls.map((call) => call.kind)).toEqual(['entry', 'section'])
    })

    it('refuses the whole write when the box moved since', async () => {
      await expect(
        setBoxes(
          board.root,
          'webapp/home',
          { hero: { x: 100, y: 100, width: 1440, height: 900 } },
          { hero: { x: 0, y: 0, width: 1440, height: 900 } },
          {
            cwd,
            sections: { flow: moved },
            expectedSections: { flow: { ...BOX, x: 0 } },
          },
        ),
      ).rejects.toMatchObject({ code: 'stale-layout' })
      expect(layout().frames.hero.x).toBe(0)
    })

    it('refuses the whole write when a member is locked', async () => {
      const file = layout()
      file.frames.hero.locked = true
      writeFileSync(
        join(board.root, 'webapp/home/layout.json'),
        JSON.stringify(file),
      )

      await expect(
        setBoxes(
          board.root,
          'webapp/home',
          { hero: { x: 100, y: 100, width: 1440, height: 900 } },
          { hero: { x: 0, y: 0, width: 1440, height: 900 } },
          { cwd, sections: { flow: moved }, expectedSections: { flow: BOX } },
        ),
      ).rejects.toMatchObject({ code: 'frame-locked' })
      expect(layout().sections.flow).toEqual({ ...BOX, order: 0 })
    })

    it('refuses a section the page does not hold', async () => {
      await expect(
        setBoxes(
          board.root,
          'webapp/home',
          {},
          {},
          { cwd, sections: { nope: moved }, expectedSections: { nope: BOX } },
        ),
      ).rejects.toMatchObject({ code: 'section-not-found' })
    })
  })
})
