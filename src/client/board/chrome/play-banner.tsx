/** The notice centered atop the canvas column while the board is in Play. */
export function PlayBanner() {
  return (
    <p
      role="status"
      className="pointer-events-none absolute top-3.5 left-1/2 z-10 -translate-x-1/2 rounded-full bg-primary px-3 py-1.5 font-medium whitespace-nowrap text-primary-foreground"
    >
      Playing. Clicks go to the frames. Esc to edit
    </p>
  )
}
