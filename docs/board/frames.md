---
title: Frames
description: Moving, resizing, and adding frames, sections, widths, height, devices, the layers panel, right-click menus, and Play
---

# Frames

What you do to a frame as a whole, from placing it to the menus it carries.

## Placing and moving

In the board you move and resize frames, and you add, rename, reorder, delete, and search pages.

- Esc mid-drag cancels a move, a resize, a section drag, a carried element, or a marquee
- Alt-drag a frame to drop a copy, and hold Space to pan with any tool
- Sections group the frames sitting in them. Shift+S draws one, Cmd+Alt+G wraps the selection in one, and dragging a section's name moves it with its frames.

The Frame tool places a phone, tablet, desktop, slide, social card, or video size picked from its list with a click, or draws a frame at any size with a drag. A selected frame's `Frame` heading opens the same list to resize it. The inspector's Preview row redraws a frame at another width without writing, and a 393 px frame reads as a phone there.

## Widths, height, and device

The inspector holds each frame-level setting.

- A frame given several widths draws each beside it, in its own device while the frame's is on, and a click or drag on one acts on the frame. The More widths row lists, adds, and removes them.
- The inspector's Height row holds a frame at a fixed height, at its content's height, or at one screen its page scrolls past. A frame taken through Fit and back to Scroll returns to the screen it left.
- In Edit a scroll frame draws a rail beside it, which a drag or click scrolls while the wheel still pans the board, and the icon ending a frame's label opens it alone in a new tab

### Device

The inspector's Show device switch draws a body around the frame and leaves its file alone.

- The switch draws the phone, tablet, or laptop the width names, from 320, 480, and 1024 wide, with a phone's page under its status bar
- The device name beside it offers a phone's Compact or Wide island and Foldable, whose buttons under the body fold it to each screen's size, and Include device adds the body to an export
- Rotate under a selected phone, tablet, or foldable turns it left, then right, then upright, laying its page out landscape, and Play's banner offers it while one is entered
- A turned phone's or foldable's page stands in from both side edges, so its island covers none of it
- A turned phone at a fixed height shows one landscape screen, and in Edit it draws a rail past its body as a scroll frame does while its page runs past that screen

## Layers, find, and menus

These reach a frame or an element from outside the canvas.

- The layers panel selects, renames, restacks, hides, and locks frames, renames and reorders elements, and Cmd+D, Cmd+C, Cmd+X, and Cmd+V duplicate, copy, cut, and paste them across pages and projects
- Cmd+F finds a frame, an element, or a line of copy on any page of the project and jumps to it
- Right-click a frame, element, empty canvas, page, or layers row for its actions, such as Copy as PNG, Fit height, or Flip to light, which shows that frame alone in the other theme until reload
- Right-click the empty space below the pages for New page, or below the layers for New frame and Paste
- Copy as PNG with several frames selected puts each on the clipboard as its own file under WSL, so one paste lands them all, and elsewhere copies one image laid out as on the canvas

## Play

Play lets you use a frame the way someone would use the real app. Press P, or Play on the toolbar, to switch to it, and P again or Edit to switch back.

- Click a frame to enter it, and it takes your clicks, scrolling, and keys while every other frame stays put under the board
- Esc leaves the entered frame, and a second Esc returns to Edit
- A row in the layers panel brings its frame into view and enters it, and nothing is selected while you play
- The banner says when nothing on the page takes a click, and offers Rotate while you are in a phone, tablet, or foldable
- Sliders an agent drew tune their targets live, and Keep values writes what you set, as [Drawn controls](elements.md#drawn-controls) describes
