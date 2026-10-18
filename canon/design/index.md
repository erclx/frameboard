---
title: Design references
subtitle: The accepted look of every board surface, as light and dark captures beside their frame HTML
auto: false
---

# Design references

This folder is the accepted design. The canvas is where a design is drafted, and what is picked there lands here. A reference stays after its surface ships, so a later change can be checked against it. Only `bun run design:sync` writes the frame files and the Files section, and a hand edit is reported by `bun run design:sync --check`.

## Surfaces

Each row files its frames under a folder named for the surface. A frame is cited by its canvas page and stem, and its files drop the page number, the `picked-` prefix, and a leading folder name.

| Surface                       | Folder          | Frames                                                                                                                                    |
| ----------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Tokens and parts              | `design-system` | `02-design-system/tokens`, `02-design-system/parts`, `02-design-system/fb-base`, `02-design-system/fb-parts`, `02-design-system/fb-board` |
| Chrome colors                 | `colors`        | `06-color/picked-hybrid`                                                                                                                  |
| Logo mark                     | `logo`          | `03-logo/picked-arm-5c`                                                                                                                   |
| Floating toolbar              | `toolbar`       | `05-layout/picked-toolbar-floating`                                                                                                       |
| Hide UI                       | `shell`         | `05-layout/picked-hide-ui`                                                                                                                |
| Panel resize                  | `shell`         | `05-layout/picked-resize-none`                                                                                                            |
| Play with panels              | `canvas`        | `12-canvas/picked-play-panels`                                                                                                            |
| Empty page                    | `canvas`        | `12-canvas/page-empty`                                                                                                                    |
| Avatar menu                   | `menus`         | `14-overlays/avatar-menu`                                                                                                                 |
| Home                          | `home`          | `07-home/home-grid`, `07-home/home-list`, `07-home/home-empty`                                                                            |
| Home right-click              | `menus`         | `07-home/context-home`                                                                                                                    |
| Layers tree                   | `layers`        | `08-layers/layers-edit`                                                                                                                   |
| Pages list and search         | `layers`        | `08-layers/pages-many`, `08-layers/pages-search`                                                                                          |
| Find                          | `layers`        | `08-layers/find-panel`                                                                                                                    |
| Theme tab                     | `tabs`          | `09-tabs/theme-tab`, `09-tabs/theme-empty`                                                                                                |
| Assets tab                    | `tabs`          | `09-tabs/assets-tab`                                                                                                                      |
| Element inspector             | `inspector`     | `10-inspector/inspector-text`                                                                                                             |
| Frame selection               | `inspector`     | `10-inspector/frame-selected`, `10-inspector/multi-select`                                                                                |
| Marquee, snapping, and labels | `canvas`        | `11-selection/marquee`, `11-selection/picked-snap-magenta`, `11-selection/frame-labels`                                                   |
| Agent claim                   | `agents`        | `13-agents/picked-claim-full`, `13-agents/picked-claim-pulse`                                                                             |
| Notes                         | `notes`         | `13-agents/note-place`, `13-agents/note-thread`                                                                                           |
| Unseen changes and Follow     | `agents`        | `13-agents/unseen-one`, `13-agents/unseen-many`                                                                                           |
| Palette                       | `palette`       | `14-overlays/palette`                                                                                                                     |
| Shortcuts                     | `palette`       | `14-overlays/shortcuts`                                                                                                                   |
| Menus and toasts              | `menus`         | `14-overlays/menu-toast`, `14-overlays/context-menus`                                                                                     |

## Files

<!-- design:sync:start -->

| Frame                      | Box       | Files                                                                                                          |
| -------------------------- | --------- | -------------------------------------------------------------------------------------------------------------- |
| `design-system/tokens`     | 1440x1000 | `tokens-dark.html`, `tokens-dark.png`, `tokens-light.html`, `tokens-light.png`                                 |
| `design-system/parts`      | 1440x720  | `parts-dark.html`, `parts-dark.png`, `parts-light.html`, `parts-light.png`                                     |
| `design-system/fb-base`    | 1100x2760 | `fb-base.html`, `fb-base-dark.png`, `fb-base-light.png`                                                        |
| `design-system/fb-parts`   | 1100x2400 | `fb-parts.html`, `fb-parts-dark.png`, `fb-parts-light.png`                                                     |
| `design-system/fb-board`   | 1100x2030 | `fb-board.html`, `fb-board-dark.png`, `fb-board-light.png`                                                     |
| `colors/hybrid`            | 1440x900  | `hybrid-dark.html`, `hybrid-dark.png`, `hybrid-light.html`, `hybrid-light.png`                                 |
| `logo/arm-5c`              | 1200x630  | `arm-5c-dark.html`, `arm-5c-dark.png`, `arm-5c-light.html`, `arm-5c-light.png`                                 |
| `toolbar/floating`         | 1440x900  | `floating-dark.html`, `floating-dark.png`, `floating-light.html`, `floating-light.png`                         |
| `shell/hide-ui`            | 1440x900  | `hide-ui-dark.html`, `hide-ui-dark.png`, `hide-ui-light.html`, `hide-ui-light.png`                             |
| `shell/resize-none`        | 1440x900  | `resize-none-dark.html`, `resize-none-dark.png`, `resize-none-light.html`, `resize-none-light.png`             |
| `canvas/play-panels`       | 1440x900  | `play-panels-dark.html`, `play-panels-dark.png`, `play-panels-light.html`, `play-panels-light.png`             |
| `canvas/page-empty`        | 1440x900  | `page-empty-dark.html`, `page-empty-dark.png`, `page-empty-light.html`, `page-empty-light.png`                 |
| `menus/avatar-menu`        | 1440x900  | `avatar-menu-dark.html`, `avatar-menu-dark.png`, `avatar-menu-light.html`, `avatar-menu-light.png`             |
| `home/grid`                | 1440x900  | `grid-dark.html`, `grid-dark.png`, `grid-light.html`, `grid-light.png`                                         |
| `home/list`                | 1440x900  | `list-dark.html`, `list-dark.png`, `list-light.html`, `list-light.png`                                         |
| `home/empty`               | 1440x900  | `empty-dark.html`, `empty-dark.png`, `empty-light.html`, `empty-light.png`                                     |
| `menus/context-home`       | 1440x900  | `context-home-dark.html`, `context-home-dark.png`, `context-home-light.html`, `context-home-light.png`         |
| `layers/edit`              | 1440x900  | `edit-dark.html`, `edit-dark.png`, `edit-light.html`, `edit-light.png`                                         |
| `layers/pages-many`        | 1440x900  | `pages-many-dark.html`, `pages-many-dark.png`, `pages-many-light.html`, `pages-many-light.png`                 |
| `layers/pages-search`      | 1440x900  | `pages-search-dark.html`, `pages-search-dark.png`, `pages-search-light.html`, `pages-search-light.png`         |
| `layers/find-panel`        | 1440x900  | `find-panel-dark.html`, `find-panel-dark.png`, `find-panel-light.html`, `find-panel-light.png`                 |
| `tabs/theme-tab`           | 1440x900  | `theme-tab-dark.html`, `theme-tab-dark.png`, `theme-tab-light.html`, `theme-tab-light.png`                     |
| `tabs/theme-empty`         | 1440x900  | `theme-empty-dark.html`, `theme-empty-dark.png`, `theme-empty-light.html`, `theme-empty-light.png`             |
| `tabs/assets-tab`          | 1440x900  | `assets-tab-dark.html`, `assets-tab-dark.png`, `assets-tab-light.html`, `assets-tab-light.png`                 |
| `inspector/text`           | 1440x900  | `text-dark.html`, `text-dark.png`, `text-light.html`, `text-light.png`                                         |
| `inspector/frame-selected` | 1440x900  | `frame-selected-dark.html`, `frame-selected-dark.png`, `frame-selected-light.html`, `frame-selected-light.png` |
| `inspector/multi-select`   | 1440x900  | `multi-select-dark.html`, `multi-select-dark.png`, `multi-select-light.html`, `multi-select-light.png`         |
| `canvas/marquee`           | 1440x900  | `marquee-dark.html`, `marquee-dark.png`, `marquee-light.html`, `marquee-light.png`                             |
| `canvas/snap-magenta`      | 1440x900  | `snap-magenta-dark.html`, `snap-magenta-dark.png`, `snap-magenta-light.html`, `snap-magenta-light.png`         |
| `canvas/frame-labels`      | 1440x900  | `frame-labels-dark.html`, `frame-labels-dark.png`, `frame-labels-light.html`, `frame-labels-light.png`         |
| `agents/claim-full`        | 1440x900  | `claim-full-dark.html`, `claim-full-dark.png`, `claim-full-light.html`, `claim-full-light.png`                 |
| `agents/claim-pulse`       | 1440x900  | `claim-pulse-dark.html`, `claim-pulse-dark.png`, `claim-pulse-light.html`, `claim-pulse-light.png`             |
| `notes/note-place`         | 1440x900  | `note-place-dark.html`, `note-place-dark.png`, `note-place-light.html`, `note-place-light.png`                 |
| `notes/note-thread`        | 1440x900  | `note-thread-dark.html`, `note-thread-dark.png`, `note-thread-light.html`, `note-thread-light.png`             |
| `agents/unseen-one`        | 1440x900  | `unseen-one-dark.html`, `unseen-one-dark.png`, `unseen-one-light.html`, `unseen-one-light.png`                 |
| `agents/unseen-many`       | 1440x900  | `unseen-many-dark.html`, `unseen-many-dark.png`, `unseen-many-light.html`, `unseen-many-light.png`             |
| `palette/palette`          | 1440x900  | `palette-dark.html`, `palette-dark.png`, `palette-light.html`, `palette-light.png`                             |
| `palette/shortcuts`        | 1440x900  | `shortcuts-dark.html`, `shortcuts-dark.png`, `shortcuts-light.html`, `shortcuts-light.png`                     |
| `menus/menu-toast`         | 1440x900  | `menu-toast-dark.html`, `menu-toast-dark.png`, `menu-toast-light.html`, `menu-toast-light.png`                 |
| `menus/context-menus`      | 1440x900  | `context-menus-dark.html`, `context-menus-dark.png`, `context-menus-light.html`, `context-menus-light.png`     |

<!-- design:sync:end -->
