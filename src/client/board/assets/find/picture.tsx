import { Picture, type PictureProps } from '../picture'
import type { ImageResult, ModelResult } from '../sourcing'

type Frame = Pick<PictureProps, 'fit' | 'className'>

/**
 * An image result's thumbnail, then its original for an SVG alone, since a
 * photo's original can be many megabytes.
 */
export function ImagePicture({
  result: { thumbnail, url, landingUrl },
  ...frame
}: Frame & { result: Pick<ImageResult, 'thumbnail' | 'url' | 'landingUrl'> }) {
  const type = fileType(url)
  const links = [thumbnail, type === 'SVG' ? url : null].filter(isWeb)
  return (
    <Picture
      links={[...new Set(links)]}
      type={type ?? 'Image'}
      source={siteName(landingUrl) ?? 'Openverse'}
      {...frame}
    />
  )
}

/** A model result's thumbnail alone, a model having no original picture. */
export function ModelPicture({
  result,
  ...frame
}: Frame & { result: Pick<ModelResult, 'thumbnail'> }) {
  return (
    <Picture
      links={[result.thumbnail].filter(isWeb)}
      type="GLB"
      source="Poly Haven"
      {...frame}
    />
  )
}

/** A link a picture may load, over http or https alone. */
function isWeb(link: string | null): link is string {
  return link !== null && webUrl(link) !== null
}

function webUrl(link: string): URL | null {
  if (!URL.canParse(link)) return null
  const url = new URL(link)
  return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
}

/** The file type a link's name ends in, as `SVG`, null when it names none. */
function fileType(link: string): string | null {
  const ending = /\.([a-z0-9]{2,5})$/i.exec(webUrl(link)?.pathname ?? '')
  return ending?.[1]?.toUpperCase() ?? null
}

/**
 * The site a result came from, read off its landing page as the label under
 * its top-level domain, so `www.flickr.com` reads Flickr.
 */
function siteName(landingUrl: string | null): string | null {
  const host = landingUrl === null ? null : webUrl(landingUrl)?.hostname
  if (!host) return null
  const labels = host.split('.')
  const name = labels.at(-2) ?? labels[0] ?? ''
  return name === '' ? null : name[0]?.toUpperCase() + name.slice(1)
}
