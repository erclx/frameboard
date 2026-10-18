---
title: Design references
subtitle: The accepted look of every board surface, as light and dark captures beside their frame HTML
auto: false
---

# Design references

This folder is the accepted design. The canvas is where a design is drafted, and what is picked there lands here. A reference stays after its surface ships, so a later change can be checked against it. Only `bun run design:sync` writes the frame files and the Files section, and a hand edit is reported by `bun run design:sync --check`.

## Surfaces

| Surface                       | Frames                                                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Tokens and parts              | `02-design-system/tokens`, `02-design-system/parts`, `02-design-system/fb-base`, `02-design-system/fb-parts`, `02-design-system/fb-board` |
| Chrome colors                 | `06-color/picked-hybrid`                                                                                                                  |
| Logo mark                     | `03-logo/picked-arm-5c`                                                                                                                   |
| Floating toolbar              | `05-layout/picked-toolbar-floating`                                                                                                       |
| Hide UI                       | `05-layout/picked-hide-ui`                                                                                                                |
| Panel resize                  | `05-layout/picked-resize-none`                                                                                                            |
| Play with panels              | `12-canvas/picked-play-panels`                                                                                                            |
| Empty page                    | `12-canvas/page-empty`                                                                                                                    |
| Avatar menu                   | `14-overlays/avatar-menu`                                                                                                                 |
| Home                          | `07-home/home-grid`, `07-home/home-list`, `07-home/home-empty`                                                                            |
| Home right-click              | `07-home/context-home`                                                                                                                    |
| Layers tree                   | `08-layers/layers-edit`                                                                                                                   |
| Pages list and search         | `08-layers/pages-many`, `08-layers/pages-search`                                                                                          |
| Find                          | `08-layers/find-panel`                                                                                                                    |
| Theme tab                     | `09-tabs/theme-tab`, `09-tabs/theme-empty`                                                                                                |
| Assets tab                    | `09-tabs/assets-tab`                                                                                                                      |
| Element inspector             | `10-inspector/inspector-text`                                                                                                             |
| Frame selection               | `10-inspector/frame-selected`, `10-inspector/multi-select`                                                                                |
| Marquee, snapping, and labels | `11-selection/marquee`, `11-selection/picked-snap-magenta`, `11-selection/frame-labels`                                                   |
| Agent claim                   | `13-agents/picked-claim-full`, `13-agents/picked-claim-pulse`                                                                             |
| Notes                         | `13-agents/note-place`, `13-agents/note-thread`                                                                                           |
| Unseen changes and Follow     | `13-agents/unseen-one`, `13-agents/unseen-many`                                                                                           |
| Palette                       | `14-overlays/palette`                                                                                                                     |
| Shortcuts                     | `14-overlays/shortcuts`                                                                                                                   |
| Menus and toasts              | `14-overlays/menu-toast`, `14-overlays/context-menus`                                                                                     |

## Files

<!-- design:sync:start -->

| Frame                               | Box       | Files                                                                                                                                              |
| ----------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `02-design-system/tokens`           | 1440x1000 | `tokens-dark.html`, `tokens-dark.png`, `tokens-light.html`, `tokens-light.png`                                                                     |
| `02-design-system/parts`            | 1440x720  | `parts-dark.html`, `parts-dark.png`, `parts-light.html`, `parts-light.png`                                                                         |
| `02-design-system/fb-base`          | 1100x2760 | `fb-base.html`, `fb-base-dark.png`, `fb-base-light.png`                                                                                            |
| `02-design-system/fb-parts`         | 1100x2400 | `fb-parts.html`, `fb-parts-dark.png`, `fb-parts-light.png`                                                                                         |
| `02-design-system/fb-board`         | 1100x2030 | `fb-board.html`, `fb-board-dark.png`, `fb-board-light.png`                                                                                         |
| `06-color/picked-hybrid`            | 1440x900  | `picked-hybrid-dark.html`, `picked-hybrid-dark.png`, `picked-hybrid-light.html`, `picked-hybrid-light.png`                                         |
| `03-logo/picked-arm-5c`             | 1200x630  | `picked-arm-5c-dark.html`, `picked-arm-5c-dark.png`, `picked-arm-5c-light.html`, `picked-arm-5c-light.png`                                         |
| `05-layout/picked-toolbar-floating` | 1440x900  | `picked-toolbar-floating-dark.html`, `picked-toolbar-floating-dark.png`, `picked-toolbar-floating-light.html`, `picked-toolbar-floating-light.png` |
| `05-layout/picked-hide-ui`          | 1440x900  | `picked-hide-ui-dark.html`, `picked-hide-ui-dark.png`, `picked-hide-ui-light.html`, `picked-hide-ui-light.png`                                     |
| `05-layout/picked-resize-none`      | 1440x900  | `picked-resize-none-dark.html`, `picked-resize-none-dark.png`, `picked-resize-none-light.html`, `picked-resize-none-light.png`                     |
| `12-canvas/picked-play-panels`      | 1440x900  | `picked-play-panels-dark.html`, `picked-play-panels-dark.png`, `picked-play-panels-light.html`, `picked-play-panels-light.png`                     |
| `12-canvas/page-empty`              | 1440x900  | `page-empty-dark.html`, `page-empty-dark.png`, `page-empty-light.html`, `page-empty-light.png`                                                     |
| `14-overlays/avatar-menu`           | 1440x900  | `avatar-menu-dark.html`, `avatar-menu-dark.png`, `avatar-menu-light.html`, `avatar-menu-light.png`                                                 |
| `07-home/home-grid`                 | 1440x900  | `home-grid-dark.html`, `home-grid-dark.png`, `home-grid-light.html`, `home-grid-light.png`                                                         |
| `07-home/home-list`                 | 1440x900  | `home-list-dark.html`, `home-list-dark.png`, `home-list-light.html`, `home-list-light.png`                                                         |
| `07-home/home-empty`                | 1440x900  | `home-empty-dark.html`, `home-empty-dark.png`, `home-empty-light.html`, `home-empty-light.png`                                                     |
| `07-home/context-home`              | 1440x900  | `context-home-dark.html`, `context-home-dark.png`, `context-home-light.html`, `context-home-light.png`                                             |
| `08-layers/layers-edit`             | 1440x900  | `layers-edit-dark.html`, `layers-edit-dark.png`, `layers-edit-light.html`, `layers-edit-light.png`                                                 |
| `08-layers/pages-many`              | 1440x900  | `pages-many-dark.html`, `pages-many-dark.png`, `pages-many-light.html`, `pages-many-light.png`                                                     |
| `08-layers/pages-search`            | 1440x900  | `pages-search-dark.html`, `pages-search-dark.png`, `pages-search-light.html`, `pages-search-light.png`                                             |
| `08-layers/find-panel`              | 1440x900  | `find-panel-dark.html`, `find-panel-dark.png`, `find-panel-light.html`, `find-panel-light.png`                                                     |
| `09-tabs/theme-tab`                 | 1440x900  | `theme-tab-dark.html`, `theme-tab-dark.png`, `theme-tab-light.html`, `theme-tab-light.png`                                                         |
| `09-tabs/theme-empty`               | 1440x900  | `theme-empty-dark.html`, `theme-empty-dark.png`, `theme-empty-light.html`, `theme-empty-light.png`                                                 |
| `09-tabs/assets-tab`                | 1440x900  | `assets-tab-dark.html`, `assets-tab-dark.png`, `assets-tab-light.html`, `assets-tab-light.png`                                                     |
| `10-inspector/inspector-text`       | 1440x900  | `inspector-text-dark.html`, `inspector-text-dark.png`, `inspector-text-light.html`, `inspector-text-light.png`                                     |
| `10-inspector/frame-selected`       | 1440x900  | `frame-selected-dark.html`, `frame-selected-dark.png`, `frame-selected-light.html`, `frame-selected-light.png`                                     |
| `10-inspector/multi-select`         | 1440x900  | `multi-select-dark.html`, `multi-select-dark.png`, `multi-select-light.html`, `multi-select-light.png`                                             |
| `11-selection/marquee`              | 1440x900  | `marquee-dark.html`, `marquee-dark.png`, `marquee-light.html`, `marquee-light.png`                                                                 |
| `11-selection/picked-snap-magenta`  | 1440x900  | `picked-snap-magenta-dark.html`, `picked-snap-magenta-dark.png`, `picked-snap-magenta-light.html`, `picked-snap-magenta-light.png`                 |
| `11-selection/frame-labels`         | 1440x900  | `frame-labels-dark.html`, `frame-labels-dark.png`, `frame-labels-light.html`, `frame-labels-light.png`                                             |
| `13-agents/picked-claim-full`       | 1440x900  | `picked-claim-full-dark.html`, `picked-claim-full-dark.png`, `picked-claim-full-light.html`, `picked-claim-full-light.png`                         |
| `13-agents/picked-claim-pulse`      | 1440x900  | `picked-claim-pulse-dark.html`, `picked-claim-pulse-dark.png`, `picked-claim-pulse-light.html`, `picked-claim-pulse-light.png`                     |
| `13-agents/note-place`              | 1440x900  | `note-place-dark.html`, `note-place-dark.png`, `note-place-light.html`, `note-place-light.png`                                                     |
| `13-agents/note-thread`             | 1440x900  | `note-thread-dark.html`, `note-thread-dark.png`, `note-thread-light.html`, `note-thread-light.png`                                                 |
| `13-agents/unseen-one`              | 1440x900  | `unseen-one-dark.html`, `unseen-one-dark.png`, `unseen-one-light.html`, `unseen-one-light.png`                                                     |
| `13-agents/unseen-many`             | 1440x900  | `unseen-many-dark.html`, `unseen-many-dark.png`, `unseen-many-light.html`, `unseen-many-light.png`                                                 |
| `14-overlays/palette`               | 1440x900  | `palette-dark.html`, `palette-dark.png`, `palette-light.html`, `palette-light.png`                                                                 |
| `14-overlays/shortcuts`             | 1440x900  | `shortcuts-dark.html`, `shortcuts-dark.png`, `shortcuts-light.html`, `shortcuts-light.png`                                                         |
| `14-overlays/menu-toast`            | 1440x900  | `menu-toast-dark.html`, `menu-toast-dark.png`, `menu-toast-light.html`, `menu-toast-light.png`                                                     |
| `14-overlays/context-menus`         | 1440x900  | `context-menus-dark.html`, `context-menus-dark.png`, `context-menus-light.html`, `context-menus-light.png`                                         |

<!-- design:sync:end -->
