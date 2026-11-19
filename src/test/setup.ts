import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

import { liveStore } from '@/client/live/store'

beforeEach(() => {
  // The test server stands in for the frame port, so a frame loads on the
  // test page's own origin and a test can read into it.
  liveStore.setState({ framePort: Number(location.port) })
})

afterEach(() => {
  cleanup()
})
