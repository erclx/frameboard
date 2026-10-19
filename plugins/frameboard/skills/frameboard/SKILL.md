---
name: frameboard
description: Draws screens on a Frameboard board as plain HTML frames and keeps each one passing the board's content checks. Use when asked to design, mock up, or sketch a screen, to put a frame on the board, or to change a frame the developer is reviewing.
---

# Frameboard

A Frameboard board is a folder of projects, pages, and frames, where every frame is one HTML file the developer reviews in a browser. You draw by writing those files and running the `frameboard` command, which never prompts and prints one JSON envelope under `--json`.

## Read the facts first

- Run `frameboard docs --json` once per session, before the first verb. It lists every verb, flag, exit code, record shape, content rule, and check rule for the installed version, so take them from there rather than from memory.
- Branch on the `ok` key of each envelope and on the exit code, never on the wording of a message.

## Start or reuse the board

- Run `frameboard serve --json` in the background. It creates a board in a folder that has none, and a second call on a board already served reports `reused: true` and binds nothing, so calling it again is safe.
- Run `frameboard list --json` to see the projects, pages, and frames before adding any.

## Draw a frame

1. Place it with `frameboard frame add <page>/<frame> --json`, choosing a phone, tablet, or desktop size when the screen calls for one. The verb writes a skeleton file when none exists.
2. Write the frame's file at the path the envelope returns. Keep everything it loads inside its own page folder, or in the project's `assets/` folder when two pages share a file.
3. Fix every finding the check hands back after the write, then write again. The check runs after each write, and a finding left in place shows on the frame's label on the board.
4. Run `frameboard check <page>/<frame> --json` to confirm a frame is clean before calling it done. An error finding exits 8 with every finding in the error's details, each naming its rule, file, line, and column. Warnings alone exit 0 and sit in the envelope's `data.findings`, so read them there.
5. Run that check with `frameboard serve` up before handing back, since the hook reports static findings alone and only a running server adds clipping, scrollbars, viewport sizing, and minimum font size. The result's `browser.ran` says whether those rules ran.
6. Run `frameboard show <page>/<frame>` so the developer's board turns to the frame you drew.

## Make every frame work in both themes

- Take colors and fonts from the board's token variables through `var()` wherever a token exists, since a token carries both themes.
- Define the dark theme beside any color you set yourself, through a `[data-theme="dark"]` rule, a `prefers-color-scheme` query, or `light-dark()`.
- Name a font first in every `font-family`, keeping a generic family as the fallback only.

## Respect what the developer changed

- Read a frame again before changing it, since the developer may have edited it by hand since your last write.
- Change one property the developer touched through `frameboard edit`, passing the frame file's SHA-256 as `--hash`. A file that changed since you read it is refused rather than overwritten, so read it again and redo the edit.
- Rewrite a whole frame only when the change reshapes it, and keep every value the developer set by hand.

## Answer the developer's notes

A line beginning `frameboard note` is a request the developer sent you from the board, so act on it as if they had typed it. Read the whole thread with `frameboard notes --json` when the line was cut short, answer in the note with `frameboard notes reply <id> "<text>"` saying what you changed, and close it with `frameboard notes done <id>` once the request is met.
