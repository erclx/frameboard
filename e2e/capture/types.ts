import type { CaptureCase as HarnessCase } from '../capture-types'

/** The harness's case shape, with the ordering a run against the served board needs. */
export interface CaptureCase extends HarnessCase {
  /**
   * Marks a case that writes the served board, so it runs after every case
   * that does not. `assets` runs after every `board` writer too, for a case
   * whose files stay in the served project.
   */
  writes?: 'board' | 'assets'
}
