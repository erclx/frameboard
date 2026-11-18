/**
 * Swaps the hero for an inline film player with sound, the Play click being the
 * gesture that allows audio, keeping the hero's nodes hidden so its wiring survives.
 */
export function wireFilmPlayer(root: ParentNode = document): void {
  const shot = root.querySelector<HTMLElement>('[data-film]')
  const play = shot?.querySelector<HTMLElement>('[data-play]')
  const close = shot?.querySelector<HTMLButtonElement>('[data-close]')
  if (!shot || !play || !close) return

  let hero: { element: HTMLElement; hidden: HTMLElement['hidden'] }[] = []
  let video: HTMLVideoElement | null = null

  const backToHero = (): void => {
    if (!video) return
    document.removeEventListener('keydown', onKeydown)
    video.remove()
    video = null
    close.hidden = true
    for (const { element, hidden } of hero) element.hidden = hidden
    play.focus()
  }

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && !document.fullscreenElement) backToHero()
  }

  close.addEventListener('click', backToHero)
  play.addEventListener('click', (event) => {
    event.preventDefault()
    hero = [...shot.children]
      .filter((child): child is HTMLElement => child instanceof HTMLElement)
      .filter((child) => child !== close)
      .map((element) => ({ element, hidden: element.hidden }))
    for (const { element } of hero) element.hidden = true
    video = document.createElement('video')
    video.className = 'aspect-video bg-black'
    video.src = '/film.mp4'
    video.controls = true
    video.playsInline = true
    video.setAttribute('aria-label', 'The Frameboard launch film')
    video.addEventListener('ended', backToHero)
    shot.prepend(video)
    close.hidden = false
    document.addEventListener('keydown', onKeydown)
    video.focus()
    void video.play()
  })
}
