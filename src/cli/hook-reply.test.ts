import { rmSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { type TempBoard, writeBoard } from '../../test/support/temp-board'
import { hookReply } from './hook-reply'

let board: TempBoard | undefined

afterEach(() => {
  board?.cleanup()
  board = undefined
})

/** A Write payload, as Claude Code sends it on stdin. */
function payload(filePath: string, cwd = '/'): string {
  return JSON.stringify({
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    cwd,
    tool_input: { file_path: filePath, content: '' },
  })
}

const CLEAN = '<style>body { font-family: Geist }</style><p>Hello</p>'

describe('hookReply', () => {
  it('blocks with every finding as the reason', () => {
    board = writeBoard({
      'site/home/hero.html': '<p>Hello</p>\n<img src="https://x.test/a.png">',
    })

    const reply = JSON.parse(
      hookReply(payload(join(board.root, 'site/home/hero.html'))) ?? 'null',
    )

    expect(reply.decision).toBe('block')
    expect(reply.reason).toContain('site/home/hero')
    expect(reply.reason).toContain('site/home/hero.html:2:6  network  ')
    expect(reply.reason).toContain('default-font')
  })

  it('prints nothing for a clean frame', () => {
    board = writeBoard({ 'site/home/hero.html': CLEAN })

    expect(
      hookReply(payload(join(board.root, 'site/home/hero.html'))),
    ).toBeNull()
  })

  it('resolves a relative path against the payload cwd', () => {
    board = writeBoard({ 'site/home/hero.html': '<p>Hello</p>' })

    expect(
      hookReply(payload('home/hero.html', join(board.root, 'site'))),
    ).toContain('block')
  })

  it('prints nothing for a write that is not a frame', () => {
    board = writeBoard({ 'site/home/styles.css': 'p { color: red }' })

    expect(
      hookReply(payload(join(board.root, 'site/home/styles.css'))),
    ).toBeNull()
  })

  it('prints nothing for an html file outside any board', () => {
    board = writeBoard({ 'site/home/hero.html': '<p>Hello</p>' })
    rmSync(join(board.root, 'board.json'))

    expect(
      hookReply(payload(join(board.root, 'site/home/hero.html'))),
    ).toBeNull()
  })

  it('prints nothing for a page in the assets folder', () => {
    board = writeBoard({ 'site/assets/demo.html': '<p>Hello</p>' })

    expect(
      hookReply(payload(join(board.root, 'site/assets/demo.html'))),
    ).toBeNull()
  })

  it('prints nothing for a frame deleted since the write', () => {
    board = writeBoard({})

    expect(
      hookReply(payload(join(board.root, 'site/home/gone.html'))),
    ).toBeNull()
  })

  it.each([
    ['stdin that is not JSON', 'not json'],
    ['an empty payload', '{}'],
    ['a payload with no file path', '{"tool_input":{}}'],
  ])('prints nothing for %s', (_label, stdin) => {
    expect(hookReply(stdin)).toBeNull()
  })
})
