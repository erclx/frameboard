import { useEffect, useRef, useState } from 'react'

import { writeBoard } from '@/client/live/write'

/** What the server stores, so a refused file is caught before it uploads. */
const ACCEPTED = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

const REFUSED = 'Only PNG, JPEG, GIF, and WebP images go in a note.'

/** One image waiting in a composer or a reply box, with a preview URL it owns. */
export interface DraftImage {
  id: string
  file: File
  url: string
}

/**
 * The images a note box holds until Save or Send: added from a paste or a
 * drop, removed one at a time, and uploaded to the page before the note
 * names them. A file the server would refuse is left out with a sentence,
 * and the note still saves without it.
 */
export function useDraftImages() {
  const [images, setImages] = useState<DraftImage[]>([])
  const [refusal, setRefusal] = useState<string | null>(null)
  // The previews a closing box still holds, released on unmount.
  const held = useRef(images)
  useEffect(() => {
    held.current = images
  }, [images])
  useEffect(
    () => () => {
      for (const image of held.current) URL.revokeObjectURL(image.url)
    },
    [],
  )

  const add = (files: readonly File[]) => {
    const accepted = files.filter((file) => ACCEPTED.has(file.type))
    setRefusal(accepted.length < files.length ? REFUSED : null)
    if (accepted.length === 0) return
    setImages((current) => [
      ...current,
      ...accepted.map((file) => ({
        id: crypto.randomUUID(),
        file,
        url: URL.createObjectURL(file),
      })),
    ])
  }

  const remove = (id: string) => {
    const gone = images.find((image) => image.id === id)
    if (gone) URL.revokeObjectURL(gone.url)
    setRefusal(null)
    setImages((current) => current.filter((image) => image.id !== id))
  }

  /** Uploads every held image to the page, answering the paths a note carries. */
  const upload = async (page: string): Promise<string[]> => {
    if (images.length === 0) return []
    const form = new FormData()
    form.append('page', page)
    for (const image of images) form.append('files', image.file)
    const data = await writeBoard<{ images: string[] }>(
      '/api/notes/images',
      form,
    )
    return data.images
  }

  const clear = () => {
    for (const image of images) URL.revokeObjectURL(image.url)
    setRefusal(null)
    setImages([])
  }

  return { images, refusal, add, remove, upload, clear }
}

/** The image files a paste or a drop carries, if any. */
export function transferredImages(transfer: DataTransfer | null): File[] {
  return [...(transfer?.files ?? [])].filter((file) =>
    file.type.startsWith('image/'),
  )
}

/** True while a drag carries files, so a drag of text is left to the textarea. */
export function carriesFiles(transfer: DataTransfer | null): boolean {
  return [...(transfer?.types ?? [])].includes('Files')
}
