---
title: Claims
description: How an agent claims a frame or reserves new ones, and what your edits do meanwhile
---

# Claims

A claim tells you and other sessions which frames an agent is working on.

An agent runs `editing` on a frame before rewriting it.

- The board then outlines the frame and tags it with the agent and how long it has held it, and a second session that tries to claim it is told it is taken
- A claim lapses five minutes after the agent last ran `editing`, and a note sent from a claimed frame goes to the session holding it
- When you move, resize, edit, rename, or delete a claimed frame, your edit waits until the claim ends, under a card naming the agent
- A move or resize then goes only if the agent left the frame as you saw it, and a rename or delete goes once the claim ends
- An element edit goes if the agent left that element alone, and otherwise comes back, with typed text kept in the Text field to apply again

Before writing new frames, an agent reserves them with `editing --new`, one call for the whole set.

- The board draws each as a hatched box where it will land, in one row past the page's frames, naming the agent and its place in the set
- With no size flag, a name ending in a listed width, such as `overview-390`, reserves that width and lands with its device on
- The frame the agent turned to last reads drawing and the rest read queued, and each box becomes its frame when the file lands
- Renewing any frame in the set keeps the whole set, so it lapses together five minutes after the agent's last `editing`
- Adding or renaming a frame onto a reserved name waits for the reservation to end, since the agent's file would replace yours

Two ways end a reservation before its file lands.

- An agent drops several at once by naming them in one `editing --release`, where one wrong name drops none
- Right-click a box and choose Release reservation to free the space for a frame of your own
