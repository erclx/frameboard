interface TrackPlan {
  /** Whether the block fits under the bar and pins while the track scrolls. */
  readonly pinned: boolean
  /** The pinned block's distance from the top of the window. */
  readonly top: number
  /** The scroll each step holds the block for. */
  readonly segment: number
}

/**
 * Where the block pins and how much scroll each step takes. The block pins at
 * the bar plus a quarter of the space it leaves free, and a block taller than
 * the window under the bar does not pin at all, as on a 375 by 667 phone.
 */
export function planTrack({
  bar,
  viewport,
  block,
  narrow,
}: {
  bar: number
  viewport: number
  block: number
  narrow: boolean
}): TrackPlan {
  const top = Math.max(
    bar + (narrow ? 8 : 24),
    Math.round(bar + (viewport - bar - block) * 0.25),
  )
  return {
    pinned: block <= viewport - bar - 8,
    top,
    segment: Math.max(240, Math.round(viewport * 0.38)),
  }
}

/** The step open while the track's top sits at `trackTop` in the window. */
export function stepAt({
  trackTop,
  pin,
  segment,
  count,
}: {
  trackTop: number
  pin: number
  segment: number
  count: number
}): number {
  const progress = (pin - trackTop) / (segment * count)
  const clamped = Math.min(Math.max(progress, 0), 0.9999)
  return Math.floor(clamped * count)
}

/** The step whose still each root last asked for, so a late decode loses. */
const wanted = new WeakMap<HTMLElement, number>()

/**
 * Opens a step and shows its still once decoded, since Chrome decodes a hidden
 * still only on first paint and an early swap paints one empty frame.
 */
export async function setActiveStep(
  root: HTMLElement,
  index: number,
): Promise<void> {
  for (const step of root.querySelectorAll<HTMLElement>('li[data-step]')) {
    const on = Number(step.dataset.step) === index
    if (on) step.setAttribute('aria-current', 'step')
    else step.removeAttribute('aria-current')
    step.querySelector('button')?.setAttribute('aria-expanded', String(on))
    const body = step.querySelector('p')
    if (body) body.hidden = !on
  }
  const stills = [
    ...root.querySelectorAll<HTMLElement>('[data-stills] [data-step]'),
  ]
  const next = stills.find((still) => Number(still.dataset.step) === index)
  wanted.set(root, index)
  if (next instanceof HTMLImageElement && typeof next.decode === 'function') {
    await next.decode().catch(() => undefined)
  }
  if (wanted.get(root) !== index) return
  for (const still of stills) still.hidden = still !== next
}

/**
 * Pins the walkthrough and opens the step the scroll reached, a step's button
 * opening it in place where the block cannot pin.
 */
export function wireWalkthrough(track: HTMLElement): void {
  const pinned = track.querySelector<HTMLElement>('[data-pinned]')
  const walk = track.querySelector<HTMLElement>('[data-walk]')
  if (!pinned || !walk) return
  const buttons = [...walk.querySelectorAll<HTMLButtonElement>('li button')]
  let plan: TrackPlan = { pinned: false, top: 0, segment: 0 }
  let current = -1

  const open = (index: number): void => {
    if (index === current) return
    current = index
    void setActiveStep(walk, index)
  }

  const read = (): void => {
    if (!plan.pinned) return
    open(
      stepAt({
        trackTop: track.getBoundingClientRect().top,
        pin: plan.top,
        segment: plan.segment,
        count: buttons.length,
      }),
    )
  }

  const size = (): void => {
    pinned.removeAttribute('data-pin')
    track.style.height = ''
    const bar =
      document.querySelector<HTMLElement>('[data-bar]')?.offsetHeight ?? 64
    plan = planTrack({
      bar,
      viewport: window.innerHeight,
      block: pinned.offsetHeight,
      narrow: matchesNarrow(),
    })
    if (!plan.pinned) return
    pinned.setAttribute('data-pin', '')
    pinned.style.top = `${plan.top}px`
    track.style.height = `${pinned.offsetHeight + plan.segment * buttons.length}px`
    read()
  }

  const go = (index: number): void => {
    if (!plan.pinned) {
      open(index)
      return
    }
    const trackY = track.getBoundingClientRect().top + window.scrollY
    window.scrollTo(
      0,
      trackY - plan.top + plan.segment * index + plan.segment / 2,
    )
  }

  const rove = (index: number): void => {
    buttons.forEach((button, k) => {
      button.tabIndex = k === index ? 0 : -1
    })
  }

  buttons.forEach((button, index) => {
    button.addEventListener('focus', () => rove(index))
    button.addEventListener('click', () => go(index))
    button.addEventListener('keydown', (event) => {
      const next =
        event.key === 'ArrowDown'
          ? buttons[index + 1]
          : event.key === 'ArrowUp'
            ? buttons[index - 1]
            : undefined
      if (!next) return
      event.preventDefault()
      next.focus()
    })
  })

  let ticking = false
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        ticking = false
        read()
      })
    },
    { passive: true },
  )
  window.addEventListener('resize', size)
  // Measured again on load, since WebKit can run this before the height settles.
  if (document.readyState !== 'complete') {
    window.addEventListener('load', size, { once: true })
  }

  walk.dataset.ready = ''
  rove(0)
  open(0)
  size()
}

function matchesNarrow(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(width < 40rem)').matches
  )
}
