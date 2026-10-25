import '../../styles.css'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

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
})
