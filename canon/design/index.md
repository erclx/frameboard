---
title: Design references
subtitle: The accepted look of every board surface, as light and dark captures beside their frame HTML
auto: false
---

# Design references

This folder is the accepted design. The canvas is where a design is drafted, and what is picked there lands here. A reference stays after its surface ships, so a later change can be checked against it. Only `bun run design:sync` writes the frame files and the Files section, and `bun run design:sync --check` fails on a changed frame or kit file and on a missing or stray file, and only warns on a PNG whose bytes differ, since the HTML is the source and a PNG varies with the browser build.

## Surfaces

Each row files its frames under a folder named for the surface. A frame is cited by its canvas page and stem. Its files drop the page number, the `picked-` prefix, and a leading folder name, or take the name a row gives after `as`.

| Surface                       | Folder          | Frames                                                                                                                                    |
| ----------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Tokens and parts              | `design-system` | `02-design-system/tokens`, `02-design-system/parts`, `02-design-system/fb-base`, `02-design-system/fb-parts`, `02-design-system/fb-board` |
| Chrome colors                 | `colors`        | `06-color/picked-hybrid`                                                                                                                  |
| Logo mark                     | `logo`          | `03-logo/picked-arm-5c`                                                                                                                   |
| Floating toolbar              | `toolbar`       | `05-layout/picked-toolbar-floating`                                                                                                       |
| Hide UI                       | `shell`         | `05-layout/picked-hide-ui`                                                                                                                |
| Panel resize                  | `shell`         | `05-layout/picked-resize-none`                                                                                                            |
| Play with panels              | `canvas`        | `12-canvas/picked-play-panels`                                                                                                            |
| Empty page                    | `canvas`        | `12-canvas/page-empty` as `empty`                                                                                                         |
| Avatar menu                   | `menus`         | `14-overlays/avatar-menu` as `avatar`                                                                                                     |
| Home                          | `home`          | `07-home/arm-2` as `grid`, `07-home/home-list`, `07-home/home-empty`                                                                      |
| Home right-click              | `menus`         | `07-home/context-home` as `home`                                                                                                          |
| Layers tree                   | `layers`        | `08-layers/layers-edit`                                                                                                                   |
| Pages list and search         | `layers`        | `08-layers/pages-many` as `pages`, `08-layers/pages-search` as `search`                                                                   |
| Find                          | `layers`        | `08-layers/find-panel` as `find`                                                                                                          |
| Theme tab                     | `tabs`          | `09-tabs/theme-tab` as `theme`, `09-tabs/theme-empty`                                                                                     |
| Assets tab                    | `tabs`          | `09-tabs/assets-tab` as `assets`                                                                                                          |
| Element inspector             | `inspector`     | `10-inspector/inspector-text`                                                                                                             |
| Frame selection               | `inspector`     | `10-inspector/frame-selected` as `frame`, `10-inspector/multi-select` as `multi`                                                          |
| Marquee, snapping, and labels | `canvas`        | `11-selection/marquee`, `11-selection/picked-snap-magenta` as `snap`, `11-selection/frame-labels` as `labels`                             |
| Check findings                | `canvas`        | `check-findings-2/arm-2a` as `findings`                                                                                                   |
| Agent claim                   | `agents`        | `13-agents/picked-claim-full`, `13-agents/picked-claim-pulse`                                                                             |
| Notes                         | `notes`         | `13-agents/note-place` as `place`, `13-agents/note-thread` as `thread`                                                                    |
| Unseen changes and Follow     | `agents`        | `13-agents/unseen-one`, `13-agents/unseen-many`                                                                                           |
| Palette                       | `palette`       | `14-overlays/palette` as `commands`                                                                                                       |
| Shortcuts                     | `palette`       | `14-overlays/shortcuts`                                                                                                                   |
| Menus and toasts              | `menus`         | `14-overlays/menu-toast` as `toast`, `14-overlays/context-menus` as `context`                                                             |

## Files

<!-- design:sync:start -->

| Frame                    | Box       | Files                                                                                              |
| ------------------------ | --------- | -------------------------------------------------------------------------------------------------- |
| `design-system/tokens`   | 1440x1000 | `tokens-dark.html`, `tokens-dark.png`, `tokens-light.html`, `tokens-light.png`                     |
| `design-system/parts`    | 1440x720  | `parts-dark.html`, `parts-dark.png`, `parts-light.html`, `parts-light.png`                         |
| `design-system/fb-base`  | 1100x2760 | `fb-base.html`, `fb-base-dark.png`, `fb-base-light.png`                                            |
| `design-system/fb-parts` | 1100x2400 | `fb-parts.html`, `fb-parts-dark.png`, `fb-parts-light.png`                                         |
| `design-system/fb-board` | 1100x2030 | `fb-board.html`, `fb-board-dark.png`, `fb-board-light.png`                                         |
| `colors/hybrid`          | 1440x900  | `hybrid-dark.html`, `hybrid-dark.png`, `hybrid-light.html`, `hybrid-light.png`                     |
| `logo/arm-5c`            | 1200x630  | `arm-5c-dark.html`, `arm-5c-dark.png`, `arm-5c-light.html`, `arm-5c-light.png`                     |
| `toolbar/floating`       | 1440x900  | `floating-dark.html`, `floating-dark.png`, `floating-light.html`, `floating-light.png`             |
| `shell/hide-ui`          | 1440x900  | `hide-ui-dark.html`, `hide-ui-dark.png`, `hide-ui-light.html`, `hide-ui-light.png`                 |
| `shell/resize-none`      | 1440x900  | `resize-none-dark.html`, `resize-none-dark.png`, `resize-none-light.html`, `resize-none-light.png` |
| `canvas/play-panels`     | 1440x900  | `play-panels-dark.html`, `play-panels-dark.png`, `play-panels-light.html`, `play-panels-light.png` |
| `canvas/empty`           | 1440x900  | `empty-dark.html`, `empty-dark.png`, `empty-light.html`, `empty-light.png`                         |
| `menus/avatar`           | 1440x900  | `avatar-dark.html`, `avatar-dark.png`, `avatar-light.html`, `avatar-light.png`                     |
| `home/grid`              | 1440x900  | `grid-dark.html`, `grid-dark.png`, `grid-light.html`, `grid-light.png`                             |
| `home/list`              | 1440x900  | `list-dark.html`, `list-dark.png`, `list-light.html`, `list-light.png`                             |
| `home/empty`             | 1440x900  | `empty-dark.html`, `empty-dark.png`, `empty-light.html`, `empty-light.png`                         |
| `menus/home`             | 1440x900  | `home-dark.html`, `home-dark.png`, `home-light.html`, `home-light.png`                             |
| `layers/edit`            | 1440x900  | `edit-dark.html`, `edit-dark.png`, `edit-light.html`, `edit-light.png`                             |
| `layers/pages`           | 1440x900  | `pages-dark.html`, `pages-dark.png`, `pages-light.html`, `pages-light.png`                         |
| `layers/search`          | 1440x900  | `search-dark.html`, `search-dark.png`, `search-light.html`, `search-light.png`                     |
| `layers/find`            | 1440x900  | `find-dark.html`, `find-dark.png`, `find-light.html`, `find-light.png`                             |
| `tabs/theme`             | 1440x900  | `theme-dark.html`, `theme-dark.png`, `theme-light.html`, `theme-light.png`                         |
| `tabs/theme-empty`       | 1440x900  | `theme-empty-dark.html`, `theme-empty-dark.png`, `theme-empty-light.html`, `theme-empty-light.png` |
| `tabs/assets`            | 1440x900  | `assets-dark.html`, `assets-dark.png`, `assets-light.html`, `assets-light.png`                     |
| `inspector/text`         | 1440x900  | `text-dark.html`, `text-dark.png`, `text-light.html`, `text-light.png`                             |
| `inspector/frame`        | 1440x900  | `frame-dark.html`, `frame-dark.png`, `frame-light.html`, `frame-light.png`                         |
| `inspector/multi`        | 1440x900  | `multi-dark.html`, `multi-dark.png`, `multi-light.html`, `multi-light.png`                         |
| `canvas/marquee`         | 1440x900  | `marquee-dark.html`, `marquee-dark.png`, `marquee-light.html`, `marquee-light.png`                 |
| `canvas/snap`            | 1440x900  | `snap-dark.html`, `snap-dark.png`, `snap-light.html`, `snap-light.png`                             |
| `canvas/labels`          | 1440x900  | `labels-dark.html`, `labels-dark.png`, `labels-light.html`, `labels-light.png`                     |
| `canvas/findings`        | 1440x900  | `findings-dark.html`, `findings-dark.png`, `findings-light.html`, `findings-light.png`             |
| `agents/claim-full`      | 1440x900  | `claim-full-dark.html`, `claim-full-dark.png`, `claim-full-light.html`, `claim-full-light.png`     |
| `agents/claim-pulse`     | 1440x900  | `claim-pulse-dark.html`, `claim-pulse-dark.png`, `claim-pulse-light.html`, `claim-pulse-light.png` |
| `notes/place`            | 1440x900  | `place-dark.html`, `place-dark.png`, `place-light.html`, `place-light.png`                         |
| `notes/thread`           | 1440x900  | `thread-dark.html`, `thread-dark.png`, `thread-light.html`, `thread-light.png`                     |
| `agents/unseen-one`      | 1440x900  | `unseen-one-dark.html`, `unseen-one-dark.png`, `unseen-one-light.html`, `unseen-one-light.png`     |
| `agents/unseen-many`     | 1440x900  | `unseen-many-dark.html`, `unseen-many-dark.png`, `unseen-many-light.html`, `unseen-many-light.png` |
| `palette/commands`       | 1440x900  | `commands-dark.html`, `commands-dark.png`, `commands-light.html`, `commands-light.png`             |
| `palette/shortcuts`      | 1440x900  | `shortcuts-dark.html`, `shortcuts-dark.png`, `shortcuts-light.html`, `shortcuts-light.png`         |
| `menus/toast`            | 1440x900  | `toast-dark.html`, `toast-dark.png`, `toast-light.html`, `toast-light.png`                         |
| `menus/context`          | 1440x900  | `context-dark.html`, `context-dark.png`, `context-light.html`, `context-light.png`                 |

<!-- design:sync:end -->
