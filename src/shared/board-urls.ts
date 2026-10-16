/** Where the server serves a frame's file, with each name encoded as its own segment. */
export function frameUrl(ref: string): string {
  const [project = '', page = '', frame = ''] = ref.split('/')
  return `/frames/${encodeURIComponent(project)}/${encodeURIComponent(page)}/${encodeURIComponent(frame)}.html`
}

/** The board route showing one page of a project. */
export function boardUrl(project: string, page: string): string {
  return `/p/${encodeURIComponent(project)}/${encodeURIComponent(page)}`
}
