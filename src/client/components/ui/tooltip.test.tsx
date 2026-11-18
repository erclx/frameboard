import '../../styles.css'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { contrastOnPage } from '@/test/contrast'
import { emulateReducedMotion } from '@/test/motion'

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
  // An axe sweep read 1.29:1 mid-fade, the fill at about 15% opacity.
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
      await emulateReducedMotion(true)
    })

    afterEach(async () => {
      await emulateReducedMotion(false)
    })

    // A sweep at mount reads resting colors only with no fade running.
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
