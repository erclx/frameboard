/**
 * Swaps the film's poster for an inline player. The play control is a link to
 * the file, so with scripts off it still opens the film. The player starts with
 * sound, since the Play click is the gesture that lets a browser play audio,
 * and its own controls carry the mute.
 */
export function wireFilmPlayer(root: ParentNode = document): void {
  const shot = root.querySelector<HTMLElement>('[data-film]')
  const play = shot?.querySelector('.play')
  if (!shot || !play) return
  play.addEventListener('click', (event) => {
    event.preventDefault()
    const video = document.createElement('video')
    video.src = '/film.mp4'
    video.poster = shot.dataset.poster ?? ''
    video.controls = true
    video.playsInline = true
    video.setAttribute('aria-label', 'The Frameboard launch film')
    shot.replaceChildren(video)
    video.focus()
    void video.play()
  })
}
