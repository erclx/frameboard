import type { FrameRecord, ListResult, PageRecord } from '@/shared/records/list'

/** A frame on `studio/home`, at a phone's size from the origin unless told otherwise. */
export function frameOf(
  name: string,
  overrides: Partial<FrameRecord> = {},
): FrameRecord {
  return {
    ref: `studio/home/${name}`,
    project: 'studio',
    page: 'home',
    name,
    path: `/board/studio/home/${name}.html`,
    box: { x: 0, y: 0, width: 390, height: 844 },
    order: 0,
    hidden: false,
    locked: false,
    hugWidth: false,
    hugHeight: false,
    placed: true,
    modifiedAt: '2026-10-15T00:00:00.000Z',
    ...overrides,
  }
}

export function pageOf(
  frames: FrameRecord[],
  name: string = 'home',
): PageRecord {
  return {
    ref: `studio/${name}`,
    project: 'studio',
    name,
    path: `/board/studio/${name}`,
    index: 0,
    layoutError: null,
    frames,
    sections: [],
  }
}

export function boardOf(...pages: PageRecord[]): ListResult {
  return {
    root: '/board',
    projects: [
      {
        name: 'studio',
        path: '/board/studio',
        modifiedAt: '2026-10-15T00:00:00.000Z',
        createdAt: null,
        projectFileError: null,
        pages,
      },
    ],
  }
}
