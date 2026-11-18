import type { ComponentProps } from 'react'

import { FilesView } from './files'

/** The left panel's Assets tab. */
export function AssetsTab(props: ComponentProps<typeof FilesView>) {
  return <FilesView {...props} />
}
