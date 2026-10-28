import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const offset = Number(process.env.WORKTREE_PORT_OFFSET ?? 0)
// The board server `scripts/dev.ts` starts and proxies the API, socket, and
// frames to. It sits above Vite's port because `canon pr local` reports the
// lowest page port, which has to be Vite's.
const boardServer = `http://127.0.0.1:${6173 + offset}`

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
    port: 5173 + offset,
    strictPort: true,
    proxy: {
      // The server answers only its own host and, on the socket, its own origin.
      '/api': {
        target: boardServer,
        changeOrigin: true,
        ws: true,
        headers: { origin: boardServer },
      },
      '/frames': { target: boardServer, changeOrigin: true },
      '/frameboard': { target: boardServer, changeOrigin: true },
    },
  },
  preview: {
    port: 4173 + offset,
    strictPort: true,
  },
})
