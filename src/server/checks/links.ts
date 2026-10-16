import { existsSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import postcss from 'postcss'

import type { Finding, FindingLocation } from '@/shared/records/check'

import {
  assetsDirOf,
  attributeLocation,
  boardPath,
  type FrameSource,
  hasScheme,
  isInside,
  localTarget,
  locate,
  type Sheet,
  sheetBase,
} from './frame-source'
import { finding, type RuleDoc } from './rule'

export const LINK_RULES: RuleDoc[] = [
  {
    id: 'outside-link',
    tier: 'exact',
    description:
      "A frame loads files from its own page folder and its project's assets/ folder alone, never from a sibling page or the server root",
  },
  {
    id: 'network',
    tier: 'exact',
    description:
      'A frame loads nothing over the network, while a navigation link passes',
  },
  {
    id: 'missing-file',
    tier: 'exact',
    description: 'Every local file a frame loads exists',
  },
]

/**
 * The attributes that load a resource, by element. An `a href` navigates
 * rather than loads, so it is left out.
 */
const RESOURCE_ATTRIBUTES: Record<string, string[]> = {
  link: ['href'],
  script: ['src'],
  img: ['src', 'srcset'],
  source: ['src', 'srcset'],
  video: ['src', 'poster'],
  audio: ['src'],
  track: ['src'],
  iframe: ['src'],
  embed: ['src'],
  object: ['data'],
  input: ['src'],
  image: ['href', 'xlink:href'],
  use: ['href', 'xlink:href'],
}

interface Load {
  url: string
  /** The folder a relative `url` resolves against. */
  base: string
  /** The file the finding names, board-relative. */
  path: string
  location: FindingLocation | null
  /** What loads it, as the message names it. */
  via: string
}

/** `outside-link`, `network`, and `missing-file` over every load a frame makes. */
export function checkLinks(source: FrameSource): Finding[] {
  const framePath = boardPath(source.root, source.path)
  const loads: Load[] = []

  for (const element of source.elements) {
    for (const name of RESOURCE_ATTRIBUTES[element.name] ?? []) {
      const value = element.attribs[name]
      if (value === undefined) continue
      const urls = name === 'srcset' ? srcsetUrls(value) : [value]
      for (const url of urls) {
        loads.push({
          url,
          base: source.pageDir,
          path: framePath,
          location: attributeLocation(element, name),
          via: `<${element.name} ${name}>`,
        })
      }
    }
    const style = element.attribs.style
    if (style !== undefined) {
      for (const { url } of cssUrls(`x{${style}}`)) {
        loads.push({
          url,
          base: source.pageDir,
          path: framePath,
          location: attributeLocation(element, 'style'),
          via: `a style attribute's url()`,
        })
      }
    }
  }

  for (const sheet of source.sheets) loads.push(...sheetLoads(source, sheet))

  return loads.flatMap((load) => judge(source, load))
}

function sheetLoads(source: FrameSource, sheet: Sheet): Load[] {
  const path = boardPath(source.root, sheet.path)
  const text = sheet.origin === 'style' ? source.html : sheet.css
  return cssUrls(sheet.css).map(({ url, start, end, kind }) => ({
    url,
    base: sheetBase(sheet),
    path,
    location: locate(text, sheet.offset + start, sheet.offset + end),
    via: kind === 'import' ? '@import' : 'url()',
  }))
}

function judge(source: FrameSource, load: Load): Finding[] {
  const url = load.url.trim()
  if (url === '' || url.startsWith('#') || /^(data|blob|about):/i.test(url)) {
    return []
  }
  const fields = { frame: source.ref, path: load.path, location: load.location }
  if (hasScheme(url)) {
    return [
      finding('network', {
        ...fields,
        message: `${load.via} loads ${url} over the network. Save the file into the page folder or the project's assets/ and link it there.`,
      }),
    ]
  }
  const target = localTarget(url, load.base)
  if (target === null || !allowed(source, target)) {
    return [
      finding('outside-link', {
        ...fields,
        message: `${load.via} loads ${url}, outside this page's folder and the project's assets/. Move the file into one of them.`,
      }),
    ]
  }
  if (!existsSync(target)) {
    return [
      finding('missing-file', {
        ...fields,
        message: `${load.via} loads ${url}, which does not exist.`,
      }),
    ]
  }
  return []
}

/**
 * Inside the page folder or the project's `assets/`, both by path and, for a
 * file that exists, by realpath, so a symlink out of the project is caught.
 */
function allowed(source: FrameSource, target: string): boolean {
  const assets = assetsDirOf(source)
  if (!isInside(source.pageDir, target) && !isInside(assets, target)) {
    return false
  }
  if (!existsSync(target)) return true
  const real = realpathSync(target)
  const projectDir = realpathSync(source.projectDir)
  return (
    isInside(realpathSync(source.pageDir), real) ||
    isInside(join(projectDir, 'assets'), real)
  )
}

function srcsetUrls(value: string): string[] {
  return value
    .split(',')
    .map((candidate) => candidate.trim().split(/\s+/)[0] ?? '')
    .filter((url) => url !== '')
}

interface CssUrl {
  url: string
  /** Offsets within the sheet's text. */
  start: number
  end: number
  kind: 'import' | 'url'
}

/** Every `url()` and `@import` in a sheet. A sheet that does not parse loads nothing. */
export function cssUrls(css: string): CssUrl[] {
  const urls: CssUrl[] = []
  let root
  try {
    root = postcss.parse(css)
  } catch {
    return urls
  }
  root.walk((node) => {
    const start = node.source?.start?.offset ?? 0
    const end = node.source?.end?.offset ?? start
    if (node.type === 'atrule' && node.name.toLowerCase() === 'import') {
      const match = /^\s*(?:url\(\s*)?(['"]?)([^'")\s]+)\1/i.exec(node.params)
      if (match?.[2]) urls.push({ url: match[2], start, end, kind: 'import' })
    } else if (node.type === 'decl') {
      for (const match of node.value.matchAll(
        /url\(\s*(['"]?)(.*?)\1\s*\)/gi,
      )) {
        urls.push({ url: match[2] ?? '', start, end, kind: 'url' })
      }
    }
  })
  return urls
}
