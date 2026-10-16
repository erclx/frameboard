import './styles.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app'
import { connectLive } from './live/socket'
import { liveStore } from './live/store'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

connectLive(liveStore)
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
