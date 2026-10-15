import type { CaptureCase } from './types'

/**
 * The board shell at `/`. No toggle sets the chrome's `.dark` class yet, so the
 * dark case adds it to the root itself. An init script runs before the parser
 * has created `<html>`, so the class waits for the document to be parsed.
 */
export const BOARD_CASES: CaptureCase[] = [
  {
    section: 'board',
    theme: 'light',
    route: '/',
    evidence: true,
  },
  {
    section: 'board',
    theme: 'dark',
    route: '/',
    evidence: true,
    setup: async (page) => {
      await page.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
          document.documentElement.classList.add('dark')
        })
      })
    },
  },
]
