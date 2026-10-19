/** The first letter of the agent, as the tag's chip and the header's initial show it. */
export function initialOf(agent: string): string {
  return agent.slice(0, 1).toUpperCase()
}

/** The agent `inbox` registers every follower as, the only one a listener can be today. */
const LISTENING_AGENT = 'claude'

/**
 * The agent a listener's tag names, `<agent> · <folder>`. The server swaps the
 * tag for the session id's first characters when two listeners share one, and
 * that form names no agent, so it reads as the agent `inbox` registers.
 */
export function agentOf(tag: string): string {
  const [agent, folder] = tag.split(' · ')
  return folder === undefined || !agent ? LISTENING_AGENT : agent
}

/** How long ago `since` was, as the tag reads it: seconds under a minute, else minutes. */
export function elapsed(since: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(since)) / 1000))
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`
}
