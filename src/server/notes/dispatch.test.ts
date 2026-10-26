import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { createDispatcher } from './dispatch'

const NOTE = {
  session: '6f1c2a9e-0000-4000-8000-000000000001',
  id: 'n_0000abcd',
  line: 'frameboard note n_0000abcd on webapp/home/hero: Tighten the header',
}

describe('createDispatcher', () => {
  let board: TempBoard

  beforeEach(() => {
    board = writeBoard({})
  })

  afterEach(() => {
    board.cleanup()
  })

  const dispatcher = (command: string, windowMs = 500) =>
    createDispatcher({
      command,
      cwd: board.root,
      root: board.root,
      env: { PATH: process.env.PATH },
      windowMs,
    })

  const read = (name: string) => readFileSync(join(board.root, name), 'utf8')

  it('hands the command the session, the note line, its id, and the root', async () => {
    const dispatch = dispatcher(
      'printf "%s\\n%s\\n%s\\n%s" "$FRAMEBOARD_SESSION" "$FRAMEBOARD_NOTE" "$FRAMEBOARD_NOTE_ID" "$FRAMEBOARD_ROOT" > seen.txt',
    )

    await dispatch(NOTE)

    expect(read('seen.txt')).toBe(
      [NOTE.session, NOTE.line, NOTE.id, board.root].join('\n'),
    )
  })

  it('passes shell syntax in the note as data, never running it', async () => {
    const dispatch = dispatcher('printf "%s" "$FRAMEBOARD_NOTE" > seen.txt')
    const line = `frameboard note n_1 on a/b/c: $(touch pwned) \`touch pwned\` "quoted" 'single'`

    await dispatch({ ...NOTE, line })

    expect(read('seen.txt')).toBe(line)
    expect(existsSync(join(board.root, 'pwned'))).toBe(false)
  })

  it('runs the command in the folder it was given', async () => {
    const dispatch = dispatcher('pwd > seen.txt')

    await dispatch(NOTE)

    expect(read('seen.txt').trim()).toBe(board.root)
  })

  it("appends the command's output to .run/dispatch.log", async () => {
    const dispatch = dispatcher('echo "started $FRAMEBOARD_NOTE_ID"')

    await dispatch(NOTE)
    await dispatch({ ...NOTE, id: 'n_0000beef' })

    expect(read('.run/dispatch.log')).toBe(
      'started n_0000abcd\nstarted n_0000beef\n',
    )
  })

  it('refuses a command exiting non-zero at once as dispatch-failed', async () => {
    const dispatch = dispatcher('exit 7')

    await expect(dispatch(NOTE)).rejects.toMatchObject({
      code: 'dispatch-failed',
      details: { code: 7 },
    })
  })

  it('refuses a command failing as late as claude --bg refusing a folder', async () => {
    const dispatch = createDispatcher({
      command: 'sleep 0.7; exit 1',
      cwd: board.root,
      root: board.root,
      env: { PATH: process.env.PATH },
    })

    await expect(dispatch(NOTE)).rejects.toMatchObject({
      code: 'dispatch-failed',
    })
  })

  it('counts a command still running past the window as started', async () => {
    const dispatch = dispatcher('sleep 1; exit 7', 50)

    await expect(dispatch(NOTE)).resolves.toBeUndefined()
  })
})
