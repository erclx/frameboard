import './styles.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { navigate } from 'wouter/use-browser-location'

import { boardUrl } from '@/shared/board-urls'

import { App } from './app'
import { connectLive } from './live/socket'
import { liveStore } from './live/store'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

connectLive(liveStore, {
  // The page route first, then the canvas it mounts zooms to the frame.
  onShow: (ref) => {
    const [project = '', page = ''] = ref.split('/')
    navigate(boardUrl(project, page))
    liveStore.setState({ focus: ref })
  },
})
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
