import type { BrowserProviderOption } from 'vitest/node'

// The slice of Playwright's Frame and Page the lookup reads, which theirs
// satisfy as they are.
export interface TesterFrame {
  url(): string
  isDetached(): boolean
  parentFrame(): TesterFrame | null
}

interface IframeHandle {
  getAttribute(name: string): Promise<string | null>
  contentFrame(): Promise<TesterFrame | null>
  dispose(): Promise<void>
}

export interface TesterPage {
  url(): string
  mainFrame(): TesterFrame
  frames(): TesterFrame[]
  locator(selector: string): { elementHandles(): Promise<IframeHandle[]> }
}

const SHARED = '__vitest_all__'

/**
 * The tester frame a command from `testPath` runs in. Vitest names every
 * tester iframe alike, so the iframe id each one's URL carries tells them
 * apart. Playwright's frame list can still hold the previous file's frame, or
 * not yet hold this one, so a frame missing from it is reached through its
 * iframe element, whose `src` keeps the id after a test rewrites its URL.
 */
export async function testerFrame(
  page: TesterPage,
  testPath: unknown,
): Promise<TesterFrame> {
  if (typeof testPath !== 'string') {
    throw new Error('the command context carries no testPath')
  }
  const own = (url: string) => {
    const id = URL.parse(url, page.url())?.searchParams.get('iframeId')
    return id === testPath || id === SHARED
  }
  const listed = page
    .frames()
    .findLast(
      (frame) =>
        !frame.isDetached() &&
        frame.parentFrame() === page.mainFrame() &&
        own(frame.url()),
    )
  if (listed) return listed
  const iframes = await page
    .locator('iframe[data-vitest="true"]')
    .elementHandles()
  try {
    for (const iframe of iframes) {
      if (!own((await iframe.getAttribute('src')) ?? '')) continue
      const frame = await iframe.contentFrame()
      if (frame) return frame
    }
  } finally {
    await Promise.all(iframes.map((iframe) => iframe.dispose()))
  }
  throw new Error(`no tester frame on the page for ${testPath}`)
}

function isTesterPage(value: unknown): value is TesterPage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'frames' in value &&
    typeof value.frames === 'function'
  )
}

/**
 * Wraps a Playwright provider option so each provider it builds answers a
 * command's `frame()` through `testerFrame`. The provider's own `frame()`
 * takes the first frame named `vitest-iframe` from Playwright's frame list,
 * which can be a file's removed predecessor. It throws on the first command
 * once the provider stops handing out a `frame()` and a `page` to replace.
 */
export function ownTesterFrame<Options extends object>(
  option: BrowserProviderOption<Options>,
): BrowserProviderOption<Options> {
  return {
    ...option,
    providerFactory(project) {
      const provider = option.providerFactory(project)
      const commandsContext = provider.getCommandsContext.bind(provider)
      provider.getCommandsContext = (sessionId) => {
        const context = commandsContext(sessionId)
        const { page } = context
        if (typeof context.frame !== 'function' || !isTesterPage(page)) {
          throw new Error(
            'the browser provider no longer hands out frame() and page, so ownTesterFrame cannot replace it',
          )
        }
        context.frame = function (this: { testPath?: unknown }) {
          return testerFrame(page, this.testPath)
        }
        return context
      }
      return provider
    },
  }
}
