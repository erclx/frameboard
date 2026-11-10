import react from '@astrojs/react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'
import path from 'path'

const portOffset = Number(process.env.WORKTREE_PORT_OFFSET) || 0

// The production address, which ASTRO_SITE overrides for a preview build.
const site = process.env.ASTRO_SITE || 'https://frameboard.erclx.dev'

export default defineConfig({
  integrations: [react()],
  site,
  server: {
    port: 4321 + portOffset,
  },
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve('./src'),
      },
    },
    server: {
      strictPort: true,
    },
    preview: {
      strictPort: true,
    },
  },
})
