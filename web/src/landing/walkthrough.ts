/**
 * Marks step `index` as the one being read and shows its still in the sticky
 * panel. Steps and stills pair up by their `data-step` value.
 */
export function setActiveStep(walk: HTMLElement, index: number): void {
  for (const step of walk.querySelectorAll<HTMLElement>('.step')) {
    const on = Number(step.dataset.step) === index
    step.classList.toggle('on', on)
    if (on) step.setAttribute('aria-current', 'step')
    else step.removeAttribute('aria-current')
  }
  for (const still of walk.querySelectorAll<HTMLElement>(
    '.stick [data-step]',
  )) {
    still.hidden = Number(still.dataset.step) !== index
  }
}

/**
 * Follows the reader down the steps, making the step that crosses the middle
 * band of the viewport the active one. The dimming of the other steps waits on
 * `data-ready`, so with scripts off every step reads at full strength.
 */
export function wireWalkthrough(walk: HTMLElement): void {
  if (!('IntersectionObserver' in window)) return
  walk.dataset.ready = ''
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const target = entry.target
        if (!entry.isIntersecting || !(target instanceof HTMLElement)) continue
        setActiveStep(walk, Number(target.dataset.step))
      }
    },
    { rootMargin: '-45% 0px -45% 0px' },
  )
  for (const step of walk.querySelectorAll('.step')) observer.observe(step)
}
