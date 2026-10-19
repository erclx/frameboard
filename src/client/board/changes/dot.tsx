/** The 7px dot marking a frame an agent changed, per agents/unseen-many's `.ud`. */
export function UnseenDot() {
  return (
    <span
      role="img"
      aria-label="Unseen change"
      data-unseen
      className="inline-block size-[7px] shrink-0 rounded-full bg-claim"
    />
  )
}
