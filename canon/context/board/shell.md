---
title: Board shell
description: The board screen and canvas, Edit and Play, the panels, find, and the toolbar
---

# Board shell

## Overview

Owns the browser app around the frames, being the board screen and canvas, widths, devices, scroll, sections, find, and the toolbar. Its look belongs to `canon/DESIGN.md`.

The rest of the app sits in its own entries:

- Playback in `canon/context/board/playback.md`, the placement tools in `canon/context/board/placing.md`, and the left panel in `canon/context/board/left-panel.md`
- The home view in `canon/context/board/home.md`, commands in `canon/context/board/commands.md`, agent work in `canon/context/board/agent-work.md`, and the server in `canon/context/board/server.md`

## Layout

### `src/client/board/`

Owns the board screen and canvas, with `mode.ts` holding Edit, Play, the tool, and Hide UI, and `view.ts` the view controller. It covers the Frame tool, culling frames past one viewport, the loading shell in `loading.tsx`, and each frame's label with its theme chips, open-alone link, and crowding in `label-room.ts`.

- The layer carries `data-staging` until its last kept frame is live, and a harness reads the layer whose `checkVisibility()` passes, since two `[data-layer]` stand until the drop
- A page switch keeps the page left behind under a hidden React `Activity` until the new canvas calls `onLive`, so a quick return reveals its frames loaded
- `screen.tsx` holds one page at most and appends a new canvas after the held one, since moving an iframe's node reloads it
- The loading shell and the board both read `panels.ts` and `mode.ts`, since a width or Hide UI read differently jumps the page on arrival. Its menus stay shut, since the swap remounts the chrome.
- A double-click in the label strip opens `LabelRename` in the notes layer, since the hit layer would take the caret's click, and it skips a `[data-label-control]`

### `src/client/board/widths/`

Owns `linked-box.tsx`, the views of a frame at each width its entry lists, drawn after the frame in a row past its drawn box, so a drag carries them along.

- A linked box is a view and never a frame. `frameAt` and `framesIn` answer the frame for a point or marquee on one, and `pickAt` reads the frame's own box alone, so no element picks inside it
- It loads the frame's URL at the frame's reload version and theme, flips with it, and in Play takes the pointer while its frame is entered, binding Esc into its window
- Its label names its width and counts the findings tagged with that width, and `mountedRefs` tests `drawnExtent` so a frame and its row mount together
- Its row moves out by a laptop base's reach past the lid, so a linked box taller than the frame never meets the base

### `src/client/board/device/`

Owns `bezel.tsx`, the body around a frame showing a `device`, `page-colors.ts`, a status bar's colors, `poses.tsx`, the bar under a selected device, and `turn.ts`, the Rotate action. All read `src/shared/frame-device.ts`, as capture does, and a board point maps into a phone's page through `pageBox`.

- The body is a `box-shadow` spread that misses a square corner, so the page rounds to `pageCorners`, square on top under a phone's status bar, and every other box on its screen to `screenCorners`
- A laptop's lid is that spread, its chin and base boxes from `laptopParts`, and the body scales with the canvas, its edge one screen pixel at any zoom, taking no pointer events
- The label, the open-alone link, and the rail stand past the border, a laptop's lid, and the In frame tag below the body, a laptop's base, and a linked width draws no device
- Every geometry helper takes the frame's `turn` as a required argument, so a turned phone drops its status bar and its buttons reach past its top and bottom on every surface
- Present and Play show a page-tall phone one screen tall through `shownBox`, centered by `bezelBox` and fit by `bezelReach`

### `src/client/board/scroll/`

Owns `rail.tsx`, the rail a scroll frame draws in Edit 8px past its right edge, or past its device body, at a constant 6px, and `page.ts`, which reads and scrolls the page behind it.

- The rail draws inside the frame's box and each linked box, and only while the page is taller than its box and readable, so a page on another origin draws none
- A frame's rail shows on hover or selection, and a linked box's while its frame is selected, since the pointer marks the frame alone
- The scroll offset lives on the iframe's window and is never written to the layout or to undo

### `src/client/board/sections/`

Owns a page's sections on the canvas, apart from `left-panel/section.tsx`, which is the panel's section heading and shares only the word.

- `box.tsx` draws each section under every frame, a faint plate with its name inside the top left at the labels' constant screen size
- The name is the box's one handle, and the rest of the plate is bare canvas to a press, so a marquee across a section stays free
- `actions.ts` registers Wrap in section on `$mod+Alt+KeyG`, rename on F2, delete on Delete, the arrow nudges, and the Section tool
- A wrap pads the selected frames' bounds by 40, with 200 on top so the name clears the frames' labels down to about 25% zoom. Delete keeps every frame.
- The Section tool, Shift+S, draws a section at a dragged box or at 800 by 600 on a click, then selects it and returns to Move

### `src/client/board/find/`

Owns find, being the panel Cmd+F puts in place of the left panel's tabs under the same header, its query, and the pick, which change together.

- `GET /api/find` searches the frame files through `src/server/edit/find.ts`, so a culled frame is found, matching frame names, element names, and each element's own text
- A hidden frame is left out, and an element named by its own text hits as text alone, so it is listed once
- Hits group by page, the page on the canvas when they arrived first, and a pick runs `board/jump.ts`, shared with the palette, selecting by the index and hash the search read
- The field owns Esc, since the registry skips keys typed in a field, and Cmd+F turns Hide UI off
- A hit draws the glyph its Layers row draws, read from the frame's cached tree at the hash the search read, and a frame hit draws the Frame `#`

### `src/client/board/chrome/`

Owns what floats over the canvas, being the toolbar, the Play banner, the Hide UI pills, the zoom control, and the avatar menu. The toolbar floats bottom center on the canvas column and publishes its top edge as `--toast-lift`, so the toast stack sits above it and layers over a dialog's overlay.

- The Move, Frame, and Shape buttons show the tool chosen last, Hand, Section, or a shape, and each caret opens its tools, keys V and H, F and Shift+S, and R, O, and L
- The Hide UI pill renders the header's own `ProjectTitle` between the way home and Show UI, so the two project menus never drift
- A primary drag on the canvas pans under the Hand tool, or under any tool while Space is held outside a field, a button, a menu, or a dialog
- `toolbar-stage.ts` picks one of five stages from the column's width, never the window's, and below 601 px Undo, Redo, Zoom to fit, and the theme toggle fold into `more-menu.tsx`
- The stages hold widths measured against the bundled Geist faces, so a new control or a face swap means re-measuring, which the clip test in `toolbar.test.tsx` catches

### `src/client/`

Owns the app shell and the controls around the canvas.

- The inspector header shows the zoom level and zoom menu, beside an avatar with the initials of the name that signs notes, which a writing tab edits in place from the avatar menu's name row
- Both side panels resize by dragging from 200 to 400px, default 240, remember their width, and reset on a double-click
- Hide UI, through Cmd+\ or a button, hides both panels and keeps the way home, the project name with its menu, the toolbar, the avatar, and the zoom level
- `focus/pointer-mark.ts` marks a control focused after a pointer press with `data-pointer-focus`, cleared on blur, and a field that takes typing is never marked
- `styles.css` redefines the `focus-visible` variant to skip a marked control, so a ring shows for keyboard focus alone

### `src/client/lib/`

Owns `cn.ts`, the one import of `cn`, which registers the `--text-*` steps as font sizes. `cn.test.ts` reads the steps out of `styles.css`, so a step added there alone fails it.

### `src/client/access/`

Owns what a tab shows about its write access, mirroring `src/server/access/`.

- The View only pill takes the Reconnecting pill's slot once the server answers that the tab reads, and Play hides it on the board, where its banner holds that spot
- The inspector opens on one View only line in the same state, read through `view-only.ts`, so neither shows before the first answer
- `expired-link.ts` reads the redeem route's `link=expired` flag, strips it once access is answered, and raises a toast that stays until dismissed in a tab that cannot write

### Other folders

The favicon files sit beside the app.

- `src/client/public/` owns the files served at the site root, being the favicon set rendered from `icon.svg`
- `src/client/title/` owns the tab title, `(3) landing-v2 · Frameboard`, counting every unseen agent change and agent note reply on the board, whichever project is open

## Gotchas

- A frame's script keeps its reach through `parent.document` and same-origin `fetch`, which the board accepts as the developer's own agents' work
- Pan and zoom write the layer's CSS transform from the `d3-zoom` handler, so a gesture renders nothing, and a plain wheel pans while a wheel carrying `ctrlKey` zooms
- `wheel.ts` reads an axis in line mode or of 50 pixels or more as a mouse notch, which zooms one 1.2 step or pans over 120 ms, so a unit test polls the view after a notch-sized pan
- Edit covers the frames with a hit layer so a press reaches the selection gestures. Play swaps it for the shield, and the frames' layer passes the pointer to it everywhere but the entered frame.
- A text step sets its weight as well as its size, so `text-label` draws at 600 unless a `font-*` class beside it says otherwise
