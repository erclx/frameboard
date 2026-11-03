import '../styles.css'

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { contrastOnPage } from '@/test/contrast'

import { NewProjectButton } from './header'

describe('NewProjectButton', () => {
  afterEach(() => {
    cleanup()
    document.documentElement.classList.remove('dark')
  })

  it.each(['light', 'dark'])(
    'reads its label at 4.5:1 or better at rest in %s',
    (theme) => {
      document.documentElement.classList.toggle('dark', theme === 'dark')
      render(<NewProjectButton action={undefined} />)

      expect(
        contrastOnPage(screen.getByText('New project')),
      ).toBeGreaterThanOrEqual(4.5)
    },
  )
})
