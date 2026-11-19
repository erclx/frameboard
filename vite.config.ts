import type { ClientRequest, IncomingMessage } from 'node:http'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const offset = Number(process.env.WORKTREE_PORT_OFFSET ?? 0)
const vitePort = 5173 + offset
// The board server `scripts/dev.ts` starts and proxies the API, socket, and
// look to. It sits above Vite's port because `canon pr local` reports the
// lowest page port, which has to be Vite's. Frames load from the board's
// frame port directly, which its socket names.
const boardServer = `http://127.0.0.1:${6173 + offset}`
const viteOrigins = new Set([
  `http://localhost:${vitePort}`,
  `http://127.0.0.1:${vitePort}`,
])

/**
 * Passes Vite's own page to the board as the board's origin, and no other,
 * so a frame posting through Vite keeps its frame port `Origin` and the
 * board's write guard refuses it as it does without Vite.
 */
function asBoardOrigin(proxyReq: ClientRequest, req: IncomingMessage): void {
  if (viteOrigins.has(req.headers.origin ?? '')) {
    proxyReq.setHeader('origin', boardServer)
  }
}

export default defineConfig({
  root: fileURLToPath(new URL('./src/client', import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL('./dist/client', import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    port: vitePort,
    strictPort: true,
    proxy: {
      // The server answers only its own host and, on the socket, its own origin.
      '/api': {
        target: boardServer,
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          proxy.on('proxyReq', asBoardOrigin)
          proxy.on('proxyReqWs', asBoardOrigin)
        },
      },
      '/frameboard': { target: boardServer, changeOrigin: true },
    },
  },
  preview: {
    port: 4173 + offset,
    strictPort: true,
  },
})
