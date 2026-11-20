/** A clip starts once this share of it shows, and stops below it. */
const IN_VIEW = 0.5

/**
 * What a reader last asked of one clip. `auto` follows the section, `on` was
 * started by its own button, and `off` was paused by it and stays paused.
 */
type Choice = 'auto' | 'on' | 'off'

interface Clip {
  readonly button: HTMLButtonElement
  readonly video: HTMLVideoElement
  inView: boolean
  choice: Choice
}

/**
 * Plays each `#themes` clip while half of it shows, the section starting held
 * under reduced motion. The controls ship hidden or disabled, so a page with no
 * scripts shows posters and no dead control.
 */
export function wireThemes(root: ParentNode = document): void {
  const section = root.querySelector<HTMLButtonElement>('#themes .pause')
  const clips: Clip[] = [
    ...root.querySelectorAll<HTMLButtonElement>('#themes [data-clip]'),
  ].flatMap((button) => {
    const video = button.querySelector('video')
    return video ? [{ button, video, inView: false, choice: 'auto' }] : []
  })
  if (!section || clips.length === 0) return
  let held = prefersReducedMotion()

  const label = (clip: Clip, playing: boolean): void => {
    clip.button.setAttribute('aria-pressed', String(!playing))
    clip.button.setAttribute(
      'aria-label',
      `${playing ? 'Pause' : 'Play'} ${clip.button.dataset.clip ?? 'the clip'}`,
    )
  }

  const render = (clip: Clip): void => {
    const wanted =
      clip.inView && (clip.choice === 'on' || (clip.choice === 'auto' && !held))
    if (wanted && clip.video.paused) {
      // iOS Low Power Mode refuses play and leaves the poster, so offer play.
      clip.video.play().catch(() => {
        if (clip.video.paused) label(clip, false)
      })
    } else if (!wanted && !clip.video.paused) {
      clip.video.pause()
    }
    label(clip, wanted)
  }

  const renderSection = (): void => {
    section.setAttribute('aria-pressed', String(held))
    section.textContent = held ? 'Play clips' : 'Pause clips'
  }

  section.addEventListener('click', () => {
    held = !held
    for (const clip of clips) {
      if (held && clip.choice === 'on') clip.choice = 'auto'
      render(clip)
    }
    renderSection()
  })

  for (const clip of clips) {
    clip.button.disabled = false
    clip.button.addEventListener('click', () => {
      clip.choice = clip.video.paused ? 'on' : 'off'
      render(clip)
    })
  }

  const byVideo = new Map<Element, Clip>(
    clips.map((clip) => [clip.video, clip]),
  )
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const clip = byVideo.get(entry.target)
        if (!clip) continue
        clip.inView = entry.isIntersecting && entry.intersectionRatio >= IN_VIEW
        render(clip)
      }
    },
    { threshold: [0, IN_VIEW] },
  )
  for (const clip of clips) observer.observe(clip.video)

  section.hidden = false
  renderSection()
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
