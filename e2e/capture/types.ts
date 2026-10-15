import type { Page } from '@playwright/test'

/**
 * The case shape e2e/screenshot.ts reads. That file is a golden config a sync
 * replaces, so Frameboard restates the shape here, and assigning these cases to
 * its own CaptureCase type makes tsc report any drift after a sync.
 */
export interface CaptureSection {
  name: string
  selector: string
}

export interface CaptureCase {
  section: string
  theme: string
  route: string
  /** Names of viewports this case skips, for a route that reflows rather than breaks at that width. */
  excludeViewports?: readonly string[]
  /** Also write the 320 and 1280 frames to the committed baseline under EVIDENCE_ROOT. */
  evidence?: boolean
  /** Selectors painted over in every frame, for a value that moves between runs with no code change. */
  mask?: readonly string[]
  /** Parts of the route captured as their own frames beside the whole page. */
  sections?: CaptureSection[]
  setup?: (page: Page) => Promise<void>
}
