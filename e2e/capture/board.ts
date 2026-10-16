import type { Page } from '@playwright/test'

import type { CaptureCase } from './types'

/**
 * No toggle sets the chrome's `.dark` class yet, so a dark case adds it to the
 * root itself. An init script runs before the parser has created `<html>`, so
 * the class waits for the document to be parsed.
 */
async function darkChrome(page: Page): Promise<void> {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.classList.add('dark')
    })
  })
}

/**
 * The home view and one board page of the preview's `basic` fixture. The
 * "Edited" times count back from each file's checkout time, so they are masked.
 * Every `basic` frame sets no font, so the board cases also hold the label's
 * check findings mark in both themes.
 */
export const BOARD_CASES: CaptureCase[] = [
  {
    section: 'home',
    theme: 'light',
    route: '/',
    evidence: true,
    mask: ['[data-edited]'],
  },
  {
    section: 'home',
    theme: 'dark',
    route: '/',
    evidence: true,
    mask: ['[data-edited]'],
    setup: darkChrome,
  },
  {
    section: 'board',
    theme: 'light',
    route: '/p/webapp/home',
    evidence: true,
  },
  {
    section: 'board',
    theme: 'dark',
    route: '/p/webapp/home',
    evidence: true,
    setup: darkChrome,
  },
]
