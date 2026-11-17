import type { Page } from 'playwright-core'

/** A `<video>` a capture shot with no picture in it. */
export interface UnloadedVideo {
  /** The element's address index, skipping Frameboard's own injected elements. */
  index: number
  /** The `src` as the frame wrote it, or its first `<source>` child's. */
  src: string
  /** `error` for a file that failed to load or decode, `pending` for one still loading. */
  state: 'error' | 'pending'
}

/**
 * Holds every `<video>` still on its poster or first frame, so two captures
 * match, returning rather than refusing the ones with no picture, since an
 * undecodable clip is no fault of the frame.
 */
export async function settleVideos(
  page: Page,
  timeoutMs: number,
): Promise<UnloadedVideo[]> {
  return page.evaluate(waitForVideos, Math.max(0, timeoutMs))
}

// Runs in the page, so it carries everything it reads.
async function waitForVideos(timeoutMs: number): Promise<UnloadedVideo[]> {
  const videos: { index: number; video: HTMLVideoElement; src: string }[] = []
  let index = 0
  for (const element of document.querySelectorAll('*')) {
    if (element.closest('[data-frameboard]')) continue
    const own = index
    index += 1
    if (!(element instanceof HTMLVideoElement)) continue
    const src =
      element.getAttribute('src') ||
      element.querySelector('source[src]')?.getAttribute('src') ||
      ''
    // No file and no poster requests nothing to wait on.
    if (!src && !element.getAttribute('poster')) continue
    videos.push({ index: own, video: element, src })
  }
  if (videos.length === 0) return []

  const posterLoads = (video: HTMLVideoElement): Promise<boolean> => {
    if (!video.poster) return Promise.resolve(false)
    const poster = new Image()
    poster.src = video.poster
    return poster.decode().then(
      () => true,
      () => false,
    )
  }

  // `error` captures, since a failed `<source>` fires on itself, never the video.
  const firstFrame = (video: HTMLVideoElement): Promise<'ok' | 'error'> =>
    new Promise((done) => {
      const events = ['loadeddata', 'seeked', 'canplay'] as const
      const finish = (state: 'ok' | 'error') => {
        for (const event of events) video.removeEventListener(event, read)
        video.removeEventListener('error', read, true)
        done(state)
      }
      const read = () => {
        if (
          video.error !== null ||
          video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE
        ) {
          finish('error')
          return
        }
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
        video.pause()
        if (video.seeking) return
        if (video.currentTime !== 0) {
          video.currentTime = 0
          return
        }
        finish('ok')
      }
      for (const event of events) video.addEventListener(event, read)
      video.addEventListener('error', read, true)
      video.autoplay = false
      video.pause()
      read()
      // Read before the reload, which holds no source until it picks one.
      if (video.preload === 'none') {
        video.preload = 'auto'
        video.load()
      }
    })

  const settle = async (video: HTMLVideoElement): Promise<'ok' | 'error'> => {
    if (await posterLoads(video)) {
      // A reload brings back the poster a video that already played dropped.
      video.autoplay = false
      video.pause()
      if (video.currentTime !== 0 || video.played.length > 0) video.load()
      return 'ok'
    }
    if (!video.getAttribute('src') && !video.querySelector('source[src]')) {
      return 'error'
    }
    return firstFrame(video)
  }

  const outcomes = videos.map(({ video }) => ({
    state: 'pending' as 'ok' | 'error' | 'pending',
    done: settle(video),
  }))
  for (const outcome of outcomes) {
    void outcome.done.then((state) => {
      outcome.state = state
    })
  }
  await Promise.race([
    Promise.all(outcomes.map((outcome) => outcome.done)),
    new Promise((done) => setTimeout(done, timeoutMs)),
  ])

  const unloaded: UnloadedVideo[] = []
  videos.forEach(({ index: own, src }, at) => {
    const state = outcomes[at]?.state
    if (state === undefined || state === 'ok') return
    unloaded.push({ index: own, src, state })
  })
  return unloaded
}
