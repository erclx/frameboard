import '../../styles.css'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cdp } from 'vitest/browser'

import { contrastOnPage } from '@/test/contrast'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip'

/** Settles every animation on the popup, so its colors are the ones it rests at. */
async function settled(element: Element): Promise<void> {
  await Promise.all(
    element.getAnimations({ subtree: true }).map((each) => each.finished),
  )
}

describe('TooltipContent', () => {
  // An axe sweep read 1.29:1 on mounted popups, which is the fill at about 15%
  // opacity over the canvas grey, so the reading was taken mid-fade.
  it('reads at 4.5:1 or better once its fade in ends', async () => {
    render(
      <div className="bg-background">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>Zoom</TooltipTrigger>
            <TooltipContent>Zoom to fit</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>,
    )

    await userEvent.hover(screen.getByRole('button', { name: 'Zoom' }))
    const popup = await screen.findByText('Zoom to fit')
    await settled(popup)

    expect(contrastOnPage(popup)).toBeGreaterThanOrEqual(4.5)
  })

  describe('under reduced motion', () => {
    beforeEach(async () => {
      await cdp().send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      })
    })

    afterEach(async () => {
      await cdp().send('Emulation.setEmulatedMedia', { features: [] })
    })

    // A sweep sampling the popup the moment it mounts reads its resting
    // colors only when no fade or zoom runs.
    it('opens at rest and reads at 4.5:1 or better at once', async () => {
      render(
        <div className="bg-background">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>Zoom</TooltipTrigger>
              <TooltipContent>Zoom to fit</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>,
      )

      await userEvent.hover(screen.getByRole('button', { name: 'Zoom' }))
      const popup = await screen.findByText('Zoom to fit')

      expect(popup.getAnimations({ subtree: true })).toHaveLength(0)
      expect(contrastOnPage(popup)).toBeGreaterThanOrEqual(4.5)
    })
  })
})
