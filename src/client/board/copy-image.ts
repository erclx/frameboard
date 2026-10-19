import type { Theme } from '@/shared/theme'

/**
 * Copies a frame to the clipboard as a PNG in the theme on screen. The
 * clipboard write starts at once with the image's fetch as its pending
 * value, since a browser grants the write only inside the key press's user
 * activation, which an awaited fetch would outlast.
 */
export function copyFrameImage(
  ref: string,
  theme: Theme,
  clipboard: Pick<Clipboard, 'write'> = navigator.clipboard,
): Promise<void> {
  const query = new URLSearchParams({ ref, theme })
  const png = fetch(`/api/frames/png?${query}`).then(async (response) => {
    if (!response.ok) throw new Error(`The board answered ${response.status}.`)
    return response.blob()
  })
  return clipboard.write([new ClipboardItem({ 'image/png': png })])
}
