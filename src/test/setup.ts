import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

import { liveStore } from '@/client/live/store'

beforeEach(() => {
  // The test page's own origin stands in, so a test can read into a frame.
  liveStore.setState({
    framePort: Number(location.port),
    frameHost: location.hostname,
  })
})

afterEach(() => {
  cleanup()
})
