import './styles.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { navigate } from 'wouter/use-browser-location'

import { boardUrl } from '@/shared/board-urls'

import { bindKeys } from './actions/registry'
import { App } from './app'
import { registerHistoryActions } from './history/actions'
import { connectLive } from './live/socket'
import { liveStore } from './live/store'
import { registerThemeActions } from './theme/actions'
import { connectTheme, themeStore, windowThemeHost } from './theme/store'

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
connectTheme(themeStore, windowThemeHost(window))
// Both the home and the board draw the toggle and undo, so the actions live as long as the app.
registerThemeActions()
registerHistoryActions()
bindKeys(window)
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
