/**
 * Swaps the hero's footage, its pause, and the play control for an inline
 * player of the film, and puts them back on Close, on Escape, and when the film
 * ends. The play control is a link to the file, so with scripts off it still
 * opens the film. The player starts with sound, since the Play click is the
 * gesture that lets a browser play audio, and its own controls carry the mute.
 *
 * The hero's nodes stay in the document, hidden, rather than being detached or
 * rebuilt, so the pause wiring on them survives a round trip and a theme switch
 * made while the film plays still re-points their sources. Escape is left to
 * the browser while the film is fullscreen, where it leaves fullscreen and the
 * film plays on.
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
