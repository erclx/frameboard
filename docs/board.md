---
title: On the board
description: Selecting, notes, and every hand edit, including undo
---

# On the board

What you can do by hand on the board, from picking an element to undoing an edit.

## Selecting

On the board, Cmd-click or double-click selects an element inside a frame.

- Enter, Esc, and Tab walk the tree, and the layers panel lists each frame's elements.
- With one frame selected and focus on the board, Tab and Shift+Tab step through the frames in layers order. On a frame label's button, such as Compare, Tab moves focus as usual.
- `selection` prints what you picked, with the element's index and hash ready for `edit`, naming the last one picked when several are selected
- With an element selected, Shift-click on the canvas or in the layers panel adds another from that frame or takes one out, and Cmd+A selects its siblings
- A drag from the empty body of a selected frame selects the elements it touches, and a drag from an element in it moves the frame
- With several selected, the inspector shows `Mixed` where their values differ and `1 of 3` on a section only some have, and an edit or Delete applies to them all as one undo step

## Notes

Pin a note on a frame or one element with the Note tool, and Send hands it to a Claude Code session listening on the board.

- The agent answers in the note's thread through `notes reply` and closes it with `notes done`
- Paste or drop a PNG, JPEG, GIF, or WebP image into a note or a reply, and the agent gets its path to open
- The notes stay in each page's `notes.json`, and their images in its `.notes/` folder
- A note is signed with the name you set from the avatar menu, saved for every board on this machine in `$XDG_CONFIG_HOME/frameboard/config.json`, else `~/.config/frameboard/config.json`, and with git's `user.name` until you set one
- With nobody listening, Send can start a session through a command you export before `serve`, such as `FRAMEBOARD_DISPATCH='claude --bg "$FRAMEBOARD_NOTE"'`, which gets the note in its environment
- The command runs in the folder `serve` started in, and `claude --bg` starts only once Claude Code trusts that folder

## Hand edits

In the board you move and resize frames, press Esc mid-drag to cancel a move, a resize, a section drag, a carried element, or a marquee. Alt-drag a frame to drop a copy, and hold Space to pan with any tool. You add, rename, reorder, delete, and search pages. Sections group the frames sitting in them. Shift+S draws one, Cmd+Alt+G wraps the selection in one, and dragging a section's name moves it with its frames.

The Frame tool places a phone, tablet, desktop, slide, social card, or video size picked from its list with a click, or draws a frame at any size with a drag. A selected frame's `Frame` heading opens the same list to resize it. The inspector's Preview row redraws a frame at another width without writing, and a 393 px frame reads as a phone there.

- On the home view, New project adds a project, a card's right-click menu opens, renames, duplicates, pins, or deletes one, and Sort orders them by last edited, created, or name, in either direction
- Drag one project onto another, or pick Move to folder from its menu, to file it in a folder. A folder's menu opens, renames, ungroups, or pins it, and a double click on its name renames it
- Cmd+F filters home by name, and Archive moves a project into a collapsed Archived section
- A frame an agent gave several widths draws each beside it under its width, and a click or drag on one acts on the frame
- The inspector's Height row holds a frame at a fixed height, at its content's height, or at one screen its page scrolls past
- Its Device row draws a generic phone or tablet around the frame, leaving the file unchanged, and Export's Include device puts it in the PNG
- In Edit a scroll frame draws a rail beside it, which a drag or click scrolls while the wheel still pans the board, and the icon ending a frame's label opens it alone in a new tab
- The inspector edits a frame's fill and an element's opacity, radius, rotation, flip, type, case, truncation, line height, letter spacing, fill, stroke, shadow, and text
- Its Layout section sets a container's flow, gap, alignment, and padding, and a child's size as Fixed, Hug, or Fill, on that element alone even where a shared rule sets the flow
- Position's Free takes an element out of the flow where it rendered, its X and Y or a drag move it inside its parent, and its right-click menu brings it to the front or back
- Every inspector number steps on arrows and scrubs from its label
- The layers panel selects, renames, restacks, hides, and locks frames, renames and reorders elements, and Cmd+D, Cmd+C, Cmd+X, and Cmd+V duplicate, copy, cut, and paste them across pages and projects
- Cmd+F finds a frame, an element, or a line of copy on any page of the project and jumps to it
- Right-click a frame, element, empty canvas, page, or layers row for its actions, such as Copy as PNG, Fit height, or Flip to light, which shows that frame alone in the other theme until reload
- The inspector's Export section saves one selected frame as a PNG at 1x, 2x, or 3x, in light, dark, or both, named like `hero.light@2x.png`, where Copy as PNG puts it on the clipboard at 2x in the theme on screen
- A selected frame that animates gets a Motion section, whose track holds it at any moment and whose play runs it on, in your tab alone. A Held chip on its label resumes it.
- The Motion section's Filmstrip exports up to 12 moments in one row at the Export section's scale and theme, offering only the counts that fit, named like `hero.filmstrip-5.light@2x.png`
- Open on a phone, under the Preview row, shows a code a phone on the same Wi-Fi scans to open the frame's project, read only, until the card closes
- Copy as PNG with several frames selected puts each on the clipboard as its own file under WSL, so one paste lands them all, and elsewhere copies one image laid out as on the canvas

The Text and Shape tools drop a paragraph, rectangle, ellipse, or divider into a frame where you click, sizing a rectangle or ellipse to a drag. Drag any element to move it, press Delete to take it out, or double-click text to retype it. Alt+Shift+ArrowUp and ArrowDown step it among its siblings.

Drag a corner of selected upright text, a shape, an image, or a video to resize it. Text wraps to the new width with its height following, and Shift keeps a shape's or media's ratio. Inline text, a container, and a divider draw no corner marks.

A Free element dragged past its frame's edge shows there as a dashed ghost, which a press drags back. The color picker holds a hex field, opacity, and token swatches, and flags a color no token names.

- The toolbar's Place toggle decides where a new element lands, and Auto puts it Free where you drew it unless its parent lays out as flex or grid
- Flow and Free force one or the other, and a divider always joins the flow

Selection colors lists every color the selection uses, and a raw color's swatch swaps it for a token on each element setting it inline, as one undo step. Select on a hovered or focused row selects the elements within the selection using that color.

Images, videos, and audio come from the project's `assets/` folder and land the same way.

- Image, video, or audio in the Shape menu, or Cmd+Shift+K, picks a file and places it where you click, at its own size capped at the column's width, and audio lands as a player 300px wide
- Dragging a tile from the Assets tab onto a frame places it where you let go. A video tile shows its first frame and length, plays muted on hover, and says when its codec cannot play.
- A selected video or audio element in Edit draws a bar under it, and the inspector's Video section carries the same play, scrub, and sound controls, which change nothing in the file
- Muted in the file is the one media control that writes, setting or dropping the element's `muted` attribute

Undo any of it with Cmd+Z. An undo of something an agent has changed since is refused and named on the board, so it never reverts the agent's work. Releases before 1.0 ship the board in stages, and the rest of editing by hand arrives in later 0.x releases.
