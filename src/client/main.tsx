import './styles.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { bindKeys } from './actions/registry'
import { App } from './app'
import {
  cancelPendingShow,
  receiveShow,
  startBusyWatch,
} from './board/changes/show'
import { registerHistoryActions } from './history/actions'
import { connectLive } from './live/socket'
import { liveStore } from './live/store'
import { registerPaletteActions } from './palette/actions'
import { registerThemeActions } from './theme/actions'
import { connectTheme, themeStore, windowThemeHost } from './theme/store'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

startBusyWatch()
connectLive(liveStore, {
  onShow: receiveShow,
  onDisconnect: cancelPendingShow,
})
connectTheme(themeStore, windowThemeHost(window))
// Both the home and the board draw the toggle and undo, so the actions live as long as the app.
registerThemeActions()
registerHistoryActions()
registerPaletteActions()
bindKeys(window)
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
