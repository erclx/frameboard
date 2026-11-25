import { useState } from 'react'

import { cn } from '@/client/lib/cn'

export interface PictureProps {
  /** The links to try in turn, each the board's own or over http or https. */
  links: readonly string[]
  /** What the file is, as `SVG`, shown once no link drew. */
  type: string
  /** Where the file comes from, shown beside its type. */
  source: string
  /** `cover` fills the box, as a tile's does, and `contain` shows the whole picture. */
  fit?: 'cover' | 'contain'
  className?: string
}

/**
 * A result's picture from the first of its links that draws, or its file type
 * and source where none does.
 */
export function Picture({
  links,
  type,
  source,
  fit = 'cover',
  className,
}: PictureProps) {
  const [failed, setFailed] = useState<readonly string[]>([])
  const link = links.find((candidate) => !failed.includes(candidate))
  return (
    <span className={cn('grid place-items-center overflow-hidden', className)}>
      {link === undefined ? (
        <span className="px-2 text-center">
          <b className="block text-label font-semibold text-foreground">
            {type}
          </b>
          <span className="block text-caption text-muted-foreground">
            {source}
          </span>
        </span>
      ) : (
        <img
          // Another link is another picture, so the one that failed never shows through it.
          key={link}
          src={link}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          onError={() => setFailed((known) => [...known, link])}
          className={cn(
            'size-full min-h-0 min-w-0',
            fit === 'cover' ? 'object-cover' : 'object-contain',
          )}
        />
      )}
    </span>
  )
}
