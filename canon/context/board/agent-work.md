---
title: Agent work on the board
description: Notes, claimed frames, agent change marks, and the live store that carries them to the board
---

# Agent work on the board

## Overview

Owns how an agent's work shows on the board and how the developer hands work back, being notes, claimed frames, change marks, and the socket and store that carry them. The records behind them are in `canon/context/content/model.md` and `canon/context/board/server.md`.

## Layout

### `src/client/board/notes/`

Owns the Note tool, its markers, the composer, and the thread, which change together.

- A Note tool pins a note on a frame or element, Send hands it to a listening session, and replies show in the note's thread
- The Note tool, key N, is enabled only while the tab may write, and its click opens the composer and goes no further, since selection and marquee gestures bind only under the Move tool
- A pick hit-tests inside the iframe, counting through `board/frame-dom.ts` past the injected elements, and sends the `modifiedAt` the iframe loaded, so a stale pick is refused
- An amber numbered marker sits on its element's top right corner, or its frame's once the element is lost, and hides in Play and once done
- The composer saves or sends, the thread replies, hands the thread on, or closes it, both reading the notes and listeners the live store holds, which a dropped socket clears until the next hello

An open card closes on Esc, on a press outside it, and when focus leaves it, a marker's press aside. Unsent text waits in `notesUi`, a reply by its note and a new note by its frame, so the card reopens with it.

### `src/client/board/claims/`

Owns how a claimed frame shows and how an edit waits on one, apart from `frame.tsx` since the tag, header initials, and waiting card change together.

- A claimed frame, read from the live store's `claims` slice by frame ref, draws a dashed `--claim` outline at screen width whatever the zoom
- Its label turns `--claim` with the agent's initial, its tag, and `editing · <elapsed>`, before any findings count
- The outline and tag fade on one 2.4s cycle only when motion is allowed, and Play hides both
- The inspector header shows one initial per listening session, solid while it holds a claim, pale while it only listens, and none for a holder not listening
- The layers row of a claimed frame carries a ringed `--claim` dot after its name

### `src/client/board/changes/`

Owns the change toast with Show, Previous on `[`, and Next on `]`, Enter on the toast itself running Show, the glow over changed elements, and the dwell clearing a mark once selected or half on screen for 1.5 seconds. `src/server/changes/` tells an agent's write from the board's own, which `History`'s `onWrite` rereads, and diffs its elements.

Compare flips or splits one changed frame between the version before and the current one. The server holds each version, and the browser picks which one the before side shows.

- `src/server/changes/tracker.ts` keeps, in memory alone, the source each agent write replaced, and names its hash as the change's `before`
- A version leaves once no logged change names it, so `LOG_CAP` and a restart end it
- The frame route serves that source under `?at=<hash>` with the same head, and answers 404 for any hash it lacks and for `at` off a frame
- `compare.ts` holds the one frame compared and its actions, and ends compare on a selection change, Play, the Note tool, or a moved base
- `compare-view.tsx` draws the before side as a second iframe over the live one, whose `src` it never touches, plus the label's control

The hit layer covers the label, so the gestures click a `data-label-control` button on release and drag the `data-compare-divider`. Starting compare asks the server for the version first, and one it no longer holds drops the base and toasts rather than loading a 404 page.

### `src/client/live/`

Owns the socket and the store every screen reads, and how an agent's changes show.

- `structure.ts` holds the typed calls to the structure and history routes over `writeBoard`
- `unseen.ts` keeps each frame's latest unseen change, dotted on its label and layers row and counted on pages and projects, with each frame's seen hash in `localStorage`

- Following an agent, from its initial or the palette while one session listens, centers each frame it changes or claims at the zoom it started with, and a hand move stops it
- A frame breaking a content rule carries a warning triangle in `--note` and its count in the text color, since the amber is too light for 11px text, cleared on the batch that fixes the file
- `canWrite` is false until the server's `access` message and whenever the socket drops, and `writeBoard` sends the cookie and marks the tab read-only on a 401

`unseen.ts` also keeps each frame's compare base, the `before` of the first change since the developer last looked. It reads the base off the replayed log rather than the seen hash, keeps it past the look, and moves it on the next change after.
