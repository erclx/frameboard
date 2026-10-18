import { useEffect, useState } from 'react'

import { registerActions } from '@/client/actions/registry'

export type HomeLayout = 'grid' | 'list'

const LAYOUT_KEY = 'frameboard.home.layout'

/**
 * The home view's grid or list, remembered for the next visit, with
 * `home.layoutGrid` and `home.layoutList` registered so the header and
 * later the palette switch it the same way.
 */
export function useHomeLayout(): HomeLayout {
  const [layout, setLayout] = useState<HomeLayout>(readLayout)

  useEffect(() => {
    const choose = (next: HomeLayout) => {
      setLayout(next)
      writeLayout(next)
    }
    return registerActions([
      {
        id: 'home.layoutGrid',
        label: 'Grid',
        group: 'home',
        run: () => choose('grid'),
        checked: () => layout === 'grid',
      },
      {
        id: 'home.layoutList',
        label: 'List',
        group: 'home',
        run: () => choose('list'),
        checked: () => layout === 'list',
      },
    ])
  }, [layout])

  return layout
}

function readLayout(): HomeLayout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
}

function writeLayout(layout: HomeLayout): void {
  try {
    localStorage.setItem(LAYOUT_KEY, layout)
  } catch {
    // A browser refusing storage keeps the choice for this visit alone.
  }
}
