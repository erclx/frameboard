---
title: Board
description: The browser app, being the home view, the board shell, the inspector, the command palette, undo, and the editing claim
---

# Board

## Overview

Owns everything the developer sees and does in the browser: the home view of projects, the board for one project, the inspector, the command palette, undo and redo, and how an agent's claim shows. Its look, colors, and type belong to `canon/DESIGN.md`.

## Layout

- `src/client/` owns the app
- `src/server/` owns the edit history undo reads, and the live updates the app listens to

### Home view

- Every project as a card with a thumbnail of its frames, its name, and when it was last edited, or as a list with name, edited, and created columns
- A new project button
- Opening a card opens its board. A home button in the board returns here, and that is the one way between projects

### Board shell

- A left panel with Design, Theme, and Assets tabs. Assets shows the project's `assets/` folder as thumbnails with type and size, takes dropped files, and copies the path a frame links. Design holds the pages list and the layers tree, split by a draggable divider that is remembered. The pages list scrolls on its own and its header carries a search that filters it in place, and the layers header carries a collapse-all button. Theme shows the project's tokens, read-only, with each light and dark value, and says where tokens go when there are none
- A toolbar with Move, Hand, Frame, Undo, Redo, Zoom to fit, the theme toggle, and the Edit and Play toggle. The Frame tool drags out a new empty frame, or adds one from a size preset, being phone at 390, tablet at 768, or desktop at 1440. The toolbar floats at the bottom center of the canvas
- The canvas in the middle, with each frame's name above it, and pan and zoom
- The inspector on the right, whose header shows the zoom level and opens the zoom menu, beside an avatar with the initials of git's `user.name`, the name notes are signed with. The avatar opens a menu of keyboard shortcuts, theme, and docs
- Both side panels resize by dragging their edge, from 200 to 400px with 240 by default, a double-click on the edge resetting it and the widths remembered, and Hide UI, Cmd+\ or a button, hides both, leaving the project name with the show-panels button top left, the toolbar, and the avatar with the zoom level top right
- The layers panel hides and locks a frame, per "Hide and lock act on frames, not elements" below
- A Note tool pins a note on a frame or element. Notes show as markers on the canvas, and a done note clears. Send hands a note to a listening agent session, whose replies show in the note's thread, and the board shows which sessions are listening
- In Edit, clicks select, per "Selection goes into a frame on purpose" below. In Play, a frame behaves like a page, the panels stay, nothing selects, notes and claim outlines hide, and a banner says how to get back

### Inspector

- Frame: name, position, and size, alone when a whole frame is selected
- Several frames: the shared position and size, and Arrange buttons for each align and distribute key, each naming its key on hover
- Element: name, opacity, and radius
- Typography: size, weight, and alignment
- Fill: color, through the browser's own color input with the project's tokens offered first, and fill opacity. On a text element Fill is the text color, and on any other element its background, as in Figma
- Text: the element's text, when it holds text only
- Stroke: the border's color, through the same token-first color row as Fill, on an element that has a border
- Shadow: one of the project's shadow tokens, or none
- Selection colors: the colors the frame uses, with token names, and a flag on raw values

### Adding one more control

A control joins the inspector only when the developer's edit beats asking the agent, and only when it leaves layout alone.

## Decisions

### Layout stays with the agent

Element position, width, height, padding, flex, gap, border width, font family, line height, and letter spacing have no control. Each is a layout call a prompt makes better, or a number that fights the layout when set by hand.

### Hand edits write the element's inline style or text and nothing else

A token pick writes `var(--token)`, so it keeps following the theme. A raw value is marked raw.

### An agent's changes stay marked until seen

A frame an agent changed carries a purple dot on its label and layers row until the developer selects it or it sits on screen a moment, never cleared by a timer. Page rows and the project card count the unseen frames under them. The update toast offers Show and Next, with `]` stepping through the changes. Follow on an agent's avatar pans the board to whatever it edits, and stops on a click or a hand pan. The board never moves the view on its own. Seen state lives in the browser, never in the board folder.

### A narrow screen opens with the UI hidden

The narrow-screen layout stays deferred. Below about 1024px the board opens as Hide UI leaves it, so the canvas still pans and zooms and nothing is blocked. Opening one frame on a phone over the local network waits for a later release.

### Find searches what the frames hold

Cmd+F swaps the left panel for a search over frame names, element names, and the text inside frames, across the project's pages. Results group by page, filter by frames, elements, or text, and a click selects and zooms to the hit. Cmd+K stays the route to actions, pages, and other projects.

### The command palette runs board actions, not edits

Cmd+K jumps to any project, page, or frame, and runs new page, new frame, theme toggle, Edit and Play, zoom to fit, and zoom to selection. Inspector edits stay in the inspector.

### Undo covers the developer's own changes

Undo and redo cover hand edits, moves, resizes, reorders, renames, adds, duplicates, and deletes, held by the server as small before-and-after records. An undo whose target an agent has since changed is refused and dropped, and the board says so.

### Selection goes into a frame on purpose

A click selects the frame. Cmd-click or a double-click on the canvas selects the element under the cursor. Enter selects one level down, Esc one level up and clears the selection from a frame, and Tab and Shift+Tab step through siblings. Figma and Paper both work this way, and selecting writes nothing, so element addresses stay put.

### Hide and lock act on frames, not elements

Cmd+Shift+H hides a selected frame on the board and Cmd+Shift+L locks it. A hidden frame stays in the layers panel and leaves the canvas and a composite capture. A locked frame cannot be dragged, resized, nudged, or deleted by hand until it is unlocked, and still selects from the layers panel. Both are flags in the page's layout, so neither writes into a frame. Hiding an element would write `display` into the frame, which is layout. Neither binds the agent, whose writes the claim and the file hash already govern.

### Arranging frames on the board

Alt+A, Alt+D, Alt+W, and Alt+S align selected frames left, right, top, and bottom, Alt+H and Alt+V center them, and Ctrl+Alt+H and Ctrl+Alt+V distribute them. A dragged or resized frame snaps to other frames' edges and centers, and holding Ctrl while dragging turns snapping off. Each writes the page's layout alone.

### Copy a frame as an image

Cmd+Shift+C copies a selected frame to the clipboard as a PNG in the theme on screen, rendered by the same browser `capture` uses.

### Right-click opens the actions for what was clicked

A page row, a frame on the canvas or in the layers panel, an element, the empty canvas, and a project card each open a menu titled with what was clicked. Each lists only actions that already have a key or a button, shows the key, and puts Delete last. An element's menu holds no style or layout action, since those stay with the agent.

### Every hand action has a key or a drag

Arrow keys nudge a selected frame, Shift for bigger steps, and pan the canvas when nothing is selected. Cmd with an arrow resizes a selected frame, and corner handles resize by drag. Shift+1 zooms to fit and Shift+2 zooms to the selection. Double-click on a label or in a panel renames. Cmd+D duplicates. Cmd+C, Cmd+X, and Cmd+V copy, cut, and paste selected frames into the current page of any project. Shift-click or a marquee drag selects several frames, and move, nudge, align, duplicate, copy, cut, hide, lock, and delete act on all of them. Delete deletes, and undo restores.

## Gotchas

- A pasted frame copies its whole file and its size into the target page, so no element index shifts. A name the page already holds takes a numbered suffix.
- Pan, zoom, and drag preview move a CSS transform, not app state, and write the file once on release.
- Each frame is an iframe. Frames far offscreen unmount on a large board.
- A frame whose file changes on disk reloads alone, keeping pan and zoom. New frames appear without a refresh.
- A claimed frame shows a tag on its label naming the agent and its session, such as Claude · visual-style, with what it is doing and for how long, and a dashed outline with a gentle pulse that respects reduced motion. Its layers row carries a purple dot. A hand move or edit on it says who holds it and that the change waits. When the agent writes, the elements it changed glow for a moment and a toast names the frame and the count. The inspector header shows each listening agent session as purple initials beside the developer's. Any agent takes the same purple, and the badge shows its initial rather than its maker's logo.
