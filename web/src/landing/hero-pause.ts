/**
 * Turns the hero's button into a pause for its footage. An animated WebP has no
 * pause of its own, so pausing swaps in a still, and a matching `<source>` beats
 * a changed `img.src`, so every `[data-loop]` element swaps to its own
 * `data-still`. The button ships hidden, so with scripts off no dead control
 * shows.
 */
export function wireHeroPause(root: ParentNode = document): void {
  const button = root.querySelector<HTMLButtonElement>('#hero .pause')
  const loops = root.querySelectorAll<HTMLElement>('#hero [data-loop]')
  if (!button) return
  button.hidden = false
  button.addEventListener('click', () => {
    const paused = button.getAttribute('aria-pressed') === 'true'
    for (const loop of loops) {
      if (paused) showLoop(loop)
      else showStill(loop)
    }
    button.setAttribute('aria-pressed', String(!paused))
    button.textContent = paused ? 'Pause' : 'Play'
  })
}

function showStill(loop: HTMLElement): void {
  const attribute = picturedBy(loop)
  loop.dataset.playing = loop.getAttribute(attribute) ?? ''
  loop.setAttribute(attribute, loop.dataset.still ?? '')
}

function showLoop(loop: HTMLElement): void {
  loop.setAttribute(picturedBy(loop), loop.dataset.playing ?? '')
  delete loop.dataset.playing
}

function picturedBy(loop: HTMLElement): 'src' | 'srcset' {
  return loop instanceof HTMLSourceElement ? 'srcset' : 'src'
}
