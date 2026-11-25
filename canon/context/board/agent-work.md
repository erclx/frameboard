---
title: Agent work on the board
description: Notes, claimed frames, agent change marks, and the live store that carries them to the board
---

# Agent work on the board

## Overview

Owns how an agent's work shows on the board and how the developer hands work back, being notes, claimed frames, change marks, and the socket and store that carry them. The records behind them are in `canon/context/content/model.md` and `canon/context/board/server.md`.

## Layout

### `src/client/board/notes/`

Owns the Note tool, its markers, the composer, and the thread, which change together. Send hands a note to a listening session or starts one through New session, and the card closes on Esc, a press outside, or focus leaving, capped at the canvas height with its messages scrolling.

- The Note tool, key N, is enabled only while the tab may write, and its click opens the composer and goes no further, since selection gestures bind only under Move
- A pick asks the frame's bridge what sits under the point, counted past the injected elements, and sends the `modifiedAt` the iframe loaded, so a stale pick is refused
- An amber numbered marker points its tail at its element's top right corner, or its frame's once the element is lost, per `board/pin-corner.ts`
- Markers hide in Play and once done, and notes whose pins would overlap stack into a count pin listing them in `pin-list.tsx`
- Unsent text waits in `notesUi` by note or frame, and a pasted image waits as a thumbnail until Save or Send uploads it, dropping when the card closes

### `src/client/board/claims/`

Owns how a claimed frame shows and how an edit waits on one, apart from `frame.tsx`, since the tag, header initials, and waiting card change together. A claim is read from the live store's `claims` slice by frame ref.

- A claimed frame draws a dashed `--claim` outline at screen width, fading with its tag on one 2.4s cycle only when motion is allowed, and Play hides both
- Its label turns `--claim` with the agent's initial, its tag, and `editing · <elapsed>`, before any findings count, and its layers row carries a ringed dot
- The inspector header shows one initial per listening session, solid while it holds a claim, pale while it only listens, and none for a holder not listening
- `reserved.tsx` draws a reservation whose frame is not listed yet as a hatched box, the member with the latest `drawingAt` reading drawing and the rest queued
- Zoom to fit takes the reserved boxes in, and a right-click on one offers Release reservation

### `src/client/board/changes/`

Owns the change toast, the glow over changed elements, compare in `compare.ts` and `compare-view.tsx`, and how an agent's `show` lands through `show.ts`, `busy.ts`, and `show-toast.tsx`. `src/server/changes/` tells an agent's write from the board's own, keeping each replaced source as the change's `before`, which `persist.ts` saves.

- The toast offers Show on `\`, Previous on `[`, Next on `]`, and Mark all seen on `⇧]`, rides the kit's one stack above the toolbar, and Enter on it runs Show
- Mark all seen's Undo lasts 5 seconds and restores the `lastCleared` snapshot in `unseen.ts`, never joining `edit.undo`, since seen state touches no file
- The hit layer covers the label, so a gesture clicks a `data-label-control` button on release, and a base the server no longer holds drops with a toast
- An idle board jumps to a shown frame, another project's only while Follow is on, and mid-action a following tab waits, reading Follow again after, since a hand move stops it, and any other offers it
- The busy read names popups by `data-slot`, leaving out the toast viewport, and counts a presentation, through which Follow holds still and after which it replays nothing

### `src/client/live/`

Owns the socket and the store every screen reads, being unseen marks, seen replies, each frame's compare base, shown marks, findings counts, write access, and Follow, kept in memory or `localStorage`. `structure.ts` holds the typed calls to the structure and history routes over `writeBoard`.

- A reply counts only while its root is not done and its frame stands, since only then can the thread open
- Follow skips a reservation and a hand move stops it, and a board message keeps a reservation's claim, whose frame is listed only once it lands
- `canWrite` is false until the server's `access` message and whenever the socket drops, and `writeBoard` marks the tab read-only on a 401
- A look clears a shown mark by the show's id and time, never by hash, since the hash may already have been seen
- A show of a frame whose write is still unseen leaves the write's mark, so its glow and the changed title stay
