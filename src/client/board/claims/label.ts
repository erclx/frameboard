/** The first letter of the agent, as the tag's chip and the header's initial show it. */
export function initialOf(agent: string): string {
  return agent.slice(0, 1).toUpperCase()
}

/** How long ago `since` was, as the tag reads it: seconds under a minute, else minutes. */
export function elapsed(since: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(since)) / 1000))
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`
}
