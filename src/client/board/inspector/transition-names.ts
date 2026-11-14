import { useLive } from '@/client/live/store'
import { TRANSITIONS } from '@/shared/present-transition'

const NO_OWN: readonly string[] = []

/**
 * The transitions a page or a slide in `project` may take, the built-ins
 * and then the project's own by name, each of those shown as written.
 */
export function useTransitionNames(project: string | undefined): string[] {
  const own = useLive(
    (state) =>
      state.board?.projects.find((candidate) => candidate.name === project)
        ?.transitions ?? NO_OWN,
  )
  return [...TRANSITIONS, ...own]
}
