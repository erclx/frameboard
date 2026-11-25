---
title: Selecting and undo
description: Selecting frames and elements, several at once, and undoing a hand edit
---

# Selecting and undo

How you pick what to edit on the board, and how an undo treats an agent's later work.

## Selecting

On the board, Cmd-click or double-click selects an element inside a frame. Once one is selected, a plain click on another element of that frame selects it, and a click on the frame's bare background or label goes back to the frame.

- Enter, Esc, and Tab walk the tree, and the layers panel lists each frame's elements, leaving out scripts, styles, and other tags that draw nothing.
- The eye on an element's row, or Cmd+Shift+H, hides it in the page itself, and the lock, or Cmd+Shift+L, sends your clicks and drags to what sits behind it. A locked element still selects from its row.
- With one frame selected and focus on the board, Tab and Shift+Tab step through the frames left to right, then top to bottom.
- Cmd+Shift+Right and Cmd+Shift+Left, or Ctrl+Shift on Linux, step the same way. On a frame label's button, such as Compare, Tab moves focus as usual.
- `selection` prints what you picked, with the element's index and hash ready for `edit`, naming the last one picked when several are selected

## Several elements

Several elements in one frame select together and edit as one.

- With an element selected, Shift-click on the canvas adds another from that frame or takes one out, and Cmd+A selects its siblings
- In the layers panel, Shift-click selects every open row from the last one picked, and Cmd-click, or Ctrl-click on Linux, adds or takes out one row, for frames and elements alike
- A drag from the empty body of a selected frame selects the elements it touches, and a drag from an element in it moves the frame
- With several selected, the inspector shows `Mixed` where their values differ and `1 of 3` on a section only some have, and an edit or Delete applies to them all as one undo step
- Several selected elements take one box with corner handles and their size. A drag or an arrow key moves every Absolute one together, and a corner drag scales them in proportion, each as one undo step.
- Several Absolute elements get the Arrange row and keys frames have, which align and distribute them

## Undo

Undo any of it with Cmd+Z. An undo of something an agent has changed since is refused and named on the board, so it never reverts the agent's work. Releases before 1.0 ship the board in stages, and the rest of editing by hand arrives in later 0.x releases.
