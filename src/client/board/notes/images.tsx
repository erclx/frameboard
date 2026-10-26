import { X } from 'lucide-react'

import type { DraftImage } from './draft-images'

const STORED_PREFIX = '.notes/'

const THUMB =
  'block size-12 overflow-hidden rounded-md border border-border bg-muted object-cover'

/** The held images as thumbnails, each with a control that takes it out. */
export function DraftStrip({
  images,
  onRemove,
}: {
  images: readonly DraftImage[]
  onRemove: (id: string) => void
}) {
  if (images.length === 0) return null
  return (
    <ul aria-label="Images" className="mb-1.5 flex flex-wrap gap-1.5">
      {images.map((image, index) => (
        <li key={image.id} className="relative">
          <img
            src={image.url}
            alt={`Image ${index + 1}: ${image.file.name}`}
            className={THUMB}
          />
          <button
            type="button"
            aria-label={`Remove image ${index + 1}`}
            onClick={() => onRemove(image.id)}
            className="absolute -top-1.5 -right-1.5 grid size-6 place-items-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="grid size-4 place-items-center rounded-full bg-foreground text-card hover:bg-foreground/80">
              <X aria-hidden className="size-3" />
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** A message's stored images as thumbnails, each opening full size in a new tab. */
export function MessageImages({
  page,
  images,
}: {
  page: string
  images: readonly string[]
}) {
  const [project, pageName] = page.split('/')
  const shown = images.filter((image) => image.startsWith(STORED_PREFIX))
  if (!project || !pageName || shown.length === 0) return null
  return (
    <ul aria-label="Images" className="mt-1.5 flex flex-wrap gap-1.5">
      {shown.map((image, index) => {
        const src = `/api/note-images/${encodeURIComponent(project)}/${encodeURIComponent(pageName)}/${encodeURIComponent(image.slice(STORED_PREFIX.length))}`
        return (
          <li key={image}>
            <a
              href={src}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open image ${index + 1} full size`}
              className="block rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <img src={src} alt="" className={THUMB} />
            </a>
          </li>
        )
      })}
    </ul>
  )
}
