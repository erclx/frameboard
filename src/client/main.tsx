import './styles.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { bindKeys } from './actions/registry'
import { App } from './app'
import { subscribe } from './board/bridge/channel'
import {
  cancelPendingShow,
  receiveShow,
  startBusyWatch,
} from './board/changes/show'
import { armGuideLanding } from './board/guide/state'
import { isPresenterPath } from './board/present/sync'
import { markPointerFocus } from './focus/pointer-mark'
import { registerHistoryActions } from './history/actions'
import { connectLive } from './live/socket'
import { liveStore } from './live/store'
import { registerPaletteActions } from './palette/actions'
import { registerThemeActions } from './theme/actions'
import { connectTheme, themeStore, windowThemeHost } from './theme/store'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

armGuideLanding(window.location.pathname)
startBusyWatch()
// A frame on its own port hides its window, so its bridge pushes its keys.
markPointerFocus(window, (iframe, onKey) => {
  const heard = subscribe(iframe, 'focus-keys', {}, onKey)
  return heard.close
})
// The presenter window shows no board, so an agent's show would navigate it away from the slides.
connectLive(
  liveStore,
  isPresenterPath(window.location.pathname)
    ? {}
    : { onShow: receiveShow, onDisconnect: cancelPendingShow },
)
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
