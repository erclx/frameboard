import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { TooltipProvider } from '@/client/components/ui/tooltip'
import { createLiveStore, liveStore } from '@/client/live/store'

import { InspectorPanel } from './panel'

describe('the inspector of a view-only tab', () => {
  afterEach(() => act(() => liveStore.setState(createLiveStore().getState())))

  it('carries the Edit button on its View only line where the server offers it', () => {
    act(() =>
      liveStore.setState({
        connected: true,
        accessKnown: true,
        canWrite: false,
        editButton: true,
      }),
    )

    render(
      <TooltipProvider>
        <InspectorPanel />
      </TooltipProvider>,
    )

    expect(screen.getByText('View only')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Edit this board' }),
    ).toBeVisible()
  })
})
