import { assert, describe, expect, it, vi } from 'vitest'
import type { BrowserProviderOption, TestProject } from 'vitest/node'

import {
  ownTesterFrame,
  type TesterFrame,
  testerFrame,
  type TesterPage,
} from './tester-frame.ts'

const ORIGIN = 'http://localhost:63315'
const FILE = '/repo/src/client/board/device/poses.test.tsx'
const EARLIER = '/repo/src/client/board/geometry/overlay.test.tsx'

function src(iframeId: string): string {
  return `/?sessionId=s1&iframeId=${encodeURIComponent(iframeId)}`
}

function frame(url: string, parent: TesterFrame | null): TesterFrame {
  return {
    url: () => url,
    isDetached: () => false,
    parentFrame: () => parent,
  }
}

const main = frame(`${ORIGIN}/__vitest_test__/?sessionId=s1`, null)

interface Iframe {
  src: string
  frame: TesterFrame | null
}

function page(listed: TesterFrame[], iframes: Iframe[] = []) {
  const disposed: string[] = []
  const tester: TesterPage = {
    url: () => main.url(),
    mainFrame: () => main,
    frames: () => [main, ...listed],
    locator: () => ({
      elementHandles: async () =>
        iframes.map((iframe) => ({
          getAttribute: async () => iframe.src,
          contentFrame: async () => iframe.frame,
          dispose: async () => {
            disposed.push(iframe.src)
          },
        })),
    }),
  }
  return { tester, disposed }
}

describe('testerFrame', () => {
  it('skips an earlier file’s frame still listed ahead of this file’s', async () => {
    const stale = frame(`${ORIGIN}${src(EARLIER)}`, main)
    const own = frame(`${ORIGIN}${src(FILE)}`, main)

    const found = await testerFrame(page([stale, own]).tester, FILE)

    expect(found).toBe(own)
  })

  it('finds this file’s frame through its iframe when the list lacks it', async () => {
    const own = frame(`${ORIGIN}${src(FILE)}`, main)
    const stale = frame(`${ORIGIN}${src(EARLIER)}`, main)
    const { tester } = page([stale], [{ src: src(FILE), frame: own }])

    const found = await testerFrame(tester, FILE)

    expect(found).toBe(own)
  })

  it('finds the frame by its iframe once a test drops the id from its URL', async () => {
    const own = frame(`${ORIGIN}/board`, main)
    const { tester } = page([own], [{ src: src(FILE), frame: own }])

    const found = await testerFrame(tester, FILE)

    expect(found).toBe(own)
  })

  it('takes the shared frame of a run that does not isolate files', async () => {
    const shared = frame(`${ORIGIN}${src('__vitest_all__')}`, main)

    const found = await testerFrame(page([shared]).tester, FILE)

    expect(found).toBe(shared)
  })

  it('skips a frame Playwright already marked detached', async () => {
    const gone = {
      ...frame(`${ORIGIN}${src(FILE)}`, main),
      isDetached: () => true,
    }
    const own = frame(`${ORIGIN}${src(FILE)}`, main)
    const { tester } = page([gone], [{ src: src(FILE), frame: own }])

    const found = await testerFrame(tester, FILE)

    expect(found).toBe(own)
  })

  it('disposes every iframe handle it read', async () => {
    const own = frame(`${ORIGIN}${src(FILE)}`, main)
    const { tester, disposed } = page(
      [],
      [
        { src: src(EARLIER), frame: null },
        { src: src(FILE), frame: own },
      ],
    )

    await testerFrame(tester, FILE)

    expect(disposed).toEqual([src(EARLIER), src(FILE)])
  })

  it('refuses, naming the file, when no frame or iframe is this file’s', async () => {
    const stale = frame(`${ORIGIN}${src(EARLIER)}`, main)
    const { tester } = page([stale], [{ src: src(EARLIER), frame: stale }])

    await expect(testerFrame(tester, FILE)).rejects.toThrow(FILE)
  })

  it('refuses a command that names no test file', async () => {
    const own = frame(`${ORIGIN}${src(FILE)}`, main)

    await expect(testerFrame(page([own]).tester, undefined)).rejects.toThrow(
      'testPath',
    )
  })
})

function answersFrame(
  context: object,
): context is { frame(): Promise<TesterFrame> } {
  return 'frame' in context && typeof context.frame === 'function'
}

describe('ownTesterFrame', () => {
  const project = {} as TestProject

  function option(context: Record<string, unknown>): BrowserProviderOption {
    return {
      name: 'playwright',
      options: {},
      serverFactory: vi.fn(),
      providerFactory: () => ({
        name: 'playwright',
        supportsParallelism: true,
        getCommandsContext: () => context,
        openPage: vi.fn(),
        close: vi.fn(),
      }),
    }
  }

  it('answers a command’s frame() with this file’s frame', async () => {
    const stale = frame(`${ORIGIN}${src(EARLIER)}`, main)
    const own = frame(`${ORIGIN}${src(FILE)}`, main)
    const byName = vi.fn(async () => stale)
    const provider = ownTesterFrame(
      option({ page: page([stale, own]).tester, frame: byName }),
    ).providerFactory(project)
    const context = Object.assign(
      { testPath: FILE },
      provider.getCommandsContext('s1'),
    )
    assert(answersFrame(context))

    const found = await context.frame()

    expect(found).toBe(own)
    expect(byName).not.toHaveBeenCalled()
  })

  it('refuses a commands context with no frame() to replace', () => {
    const provider = ownTesterFrame(
      option({ page: page([]).tester }),
    ).providerFactory(project)

    expect(() => provider.getCommandsContext('s1')).toThrow('frame()')
  })
})
