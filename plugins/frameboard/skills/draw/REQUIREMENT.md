---
name: draw
description: What the Frameboard draw skill is for, the failures it closes for an agent drawing on a board, and where its facts live instead
---

# Draw requirement

## Gap

Without this skill, an agent drawing on a Frameboard board works the command from memory. It writes flags and rule names the installed version does not have, places a frame before writing its file so the developer watches a blank box, and hands back a frame it never checked or captured in both themes.

It also rewrites a frame the developer edited by hand, or one another session holds, since nothing on disk tells it either is taken. And a feature's judgment piles into one body every session reads, so each new feature costs every task that never uses it.

## Must

- Every verb, flag, record shape, and rule comes from `frameboard docs` at run time, and no file in the skill restates them
- A frame is written, placed, checked with a server up, and captured in both themes before it is handed back
- A frame is claimed before a rewrite, and a value the developer set by hand survives the agent's change
- The core loop stays in the body, and each feature past it sits in its own reference the body names with its trigger
- The description names only what the installed tool can do today

## Must not

- Carry a verb table or a rule list, which drift from the installed tool
- Name a reference file that does not exist yet

## Out of scope

- The facts themselves, which `frameboard docs` prints from the code the verbs run on
- Copying a page from a live site step by step, which `references/lift.md` owns
- Presenting a page, which `references/slides.md` owns
- Running images and models on the developer's own ComfyUI server, which `references/generate.md` owns
- Keeping accepted frames in a tracked folder, which `references/record.md` owns
