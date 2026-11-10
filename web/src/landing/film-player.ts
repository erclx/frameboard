/**
 * Swaps the hero's footage, its pause, and the play control for an inline
 * player of the film, and puts them back on Close, on Escape, and when the film
 * ends. The play control is a link to the file, so with scripts off it still
 * opens the film. The player starts with sound, since the Play click is the
 * gesture that lets a browser play audio, and its own controls carry the mute.
 *
 * The hero's nodes are kept rather than rebuilt, so the pause wiring on them
 * survives a round trip. Escape is left to the browser while the film is
 * fullscreen, where it leaves fullscreen and the film plays on.
 */
export function wireFilmPlayer(root: ParentNode = document): void {
  const shot = root.querySelector<HTMLElement>('[data-film]')
  const play = shot?.querySelector<HTMLElement>('[data-play]')
  const close = shot?.querySelector<HTMLButtonElement>('[data-close]')
  if (!shot || !play || !close) return

  let hero: Node[] = []
  let video: HTMLVideoElement | null = null

  const backToHero = (): void => {
    if (!video) return
    document.removeEventListener('keydown', onKeydown)
    video = null
    close.hidden = true
    shot.replaceChildren(...hero, close)
    play.focus()
  }

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && !document.fullscreenElement) backToHero()
  }

  close.addEventListener('click', backToHero)
  play.addEventListener('click', (event) => {
    event.preventDefault()
    hero = [...shot.childNodes].filter((node) => node !== close)
    video = document.createElement('video')
    video.className = 'aspect-video bg-black'
    video.src = '/film.mp4'
    video.controls = true
    video.playsInline = true
    video.setAttribute('aria-label', 'The Frameboard launch film')
    video.addEventListener('ended', backToHero)
    shot.replaceChildren(video, close)
    close.hidden = false
    document.addEventListener('keydown', onKeydown)
    video.focus()
    void video.play()
  })
}
