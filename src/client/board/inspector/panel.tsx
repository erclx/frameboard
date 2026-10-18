import { useAuthor } from '../chrome/author'
import { AvatarMenu } from '../chrome/avatar-menu'
import { ZoomControl } from '../chrome/zoom-control'
import { useMode } from '../mode'

/**
 * The right panel: the header of the avatar and the zoom level, over a body
 * that holds a hint until a selection gives the inspector something to show.
 */
export function InspectorPanel() {
  const name = useAuthor() ?? null
  const playing = useMode((state) => state.mode === 'play')
  return (
    <aside
      aria-label="Inspector"
      className="flex h-full min-w-0 flex-col bg-sidebar text-body text-sidebar-foreground"
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-sidebar-border px-3">
        <AvatarMenu name={name} />
        <ZoomControl />
      </div>
      <div className="px-3 pt-2.5 pb-3 text-muted-foreground">
        {playing ? (
          <p>Playing. Nothing selects while frames take the clicks.</p>
        ) : (
          <>
            <p>Select a frame to see its details.</p>
            <p className="mt-4">
              Click a frame, or drag on the canvas to select several.
            </p>
          </>
        )}
      </div>
    </aside>
  )
}
