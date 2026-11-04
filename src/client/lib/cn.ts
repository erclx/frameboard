import { createCn } from 'cn/config'

/**
 * The stylesheet's `--text-*` steps as font sizes, since the default config
 * reads an unknown `text-<name>` as a color and merges it against real colors.
 * Import `cn` from here alone, because the package's own export keeps that drop.
 */
export const cn = createCn({
  extend: {
    classGroups: {
      'font-size': [{ text: ['title', 'panel', 'body', 'label', 'caption'] }],
    },
  },
})
