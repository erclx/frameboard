import { LayoutGrid, List } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { refreshActions, registerActions } from '@/client/actions/registry'

export type HomeLayout = 'grid' | 'list'

const LAYOUT_KEY = 'frameboard.home.layout'

/**
 * The home view's grid or list, remembered for the next visit, with
 * `home.layoutGrid` and `home.layoutList` registered so the header and
 * later the palette switch it the same way.
 */
export function useHomeLayout(): HomeLayout {
  const [layout, setLayout] = useState<HomeLayout>(readLayout)
  // The actions read the layout through the ref, so they register once and
  // keep their place in the order while the layout changes.
  const current = useRef(layout)

  useEffect(() => {
    const choose = (next: HomeLayout) => {
      current.current = next
      setLayout(next)
      writeLayout(next)
      refreshActions()
    }
    return registerActions([
      {
        id: 'home.layoutGrid',
        label: 'Grid',
        group: 'home',
        command: { label: 'Show projects as a grid', icon: LayoutGrid },
        run: () => choose('grid'),
        checked: () => current.current === 'grid',
      },
      {
        id: 'home.layoutList',
        label: 'List',
        group: 'home',
        command: { label: 'Show projects as a list', icon: List },
        run: () => choose('list'),
        checked: () => current.current === 'list',
      },
    ])
  }, [])

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
