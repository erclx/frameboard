---
name: frameboard
description: Draws screens on a Frameboard board as plain HTML frames and keeps each one passing the board's content checks. Use when asked to design, mock up, or sketch a screen, to put a frame on the board, or to change a frame the developer is reviewing.
---

# Frameboard

A Frameboard board is a folder of projects, pages, and frames, where every frame is one HTML file the developer reviews in a browser. You draw by writing those files and running the `frameboard` command, which never prompts and prints one JSON envelope under `--json`.

## Read the facts first

- Run `frameboard docs --json` once per session, before the first verb
- Take every verb, flag, exit code, record shape, content rule, and check rule from that output rather than from memory, since it describes the installed version
- Branch on the `ok` key of each envelope and on the exit code, never on the wording of a message

## Start or reuse the board

- Run `frameboard serve --json` in the background. It creates a board in a folder that has none, and on a board already served it reports `reused: true` and binds nothing, so a second call is safe.
- Run `frameboard list --json` to see the projects, pages, and frames before adding any.
- Run `frameboard open --no-open --json` when the developer needs a second tab that can edit, and hand them its `writeUrl`. The link works once and expires at `expiresAt`, and a tab opened on the plain address only reads.

## Draw a frame

1. Write the frame's file as `<frame>.html` in its page folder, whose path `frameboard list --json` reports, after `frameboard page add` for a page that does not exist yet. Keep everything it loads inside that folder, or in the project's `assets/` folder when two pages share a file.
   - Check the page's frames in that `list` output first, and treat a name already there as an existing frame to claim before you rewrite it, since a write over it lands unclaimed
   - Write the file before placing it, since `frame add` writes an empty skeleton when none exists and the developer watches a blank box until your write lands
2. Place it with `frameboard frame add <page>/<frame> --json` straight after the write. It places the file as written and touches nothing in it.
   - Pass the size name nearest the screen the developer described, from the `Frame sizes` block of `frameboard docs`, so it lands at its device width at once
   - A frame with no size hugs its content on both axes, and a size fixes its width alone, so leave the size off a component and let the running server measure it
   - Resize an axis only to fix it, since a resize stops that axis hugging
3. Fix every finding the check hands back after the write, then write again. The check runs after each write, and a finding left in place shows on the frame's label on the board.
4. Run `frameboard check <page>/<frame> --json` to confirm a frame is clean before calling it done.
   - An error finding exits 8 with every finding in the error's details, each naming its rule, file, line, and column
   - Warnings alone exit 0 and sit in the envelope's `data.findings`, so read them there
5. Run that check with `frameboard serve` up before handing back, since the hook reports static findings alone.
   - Only a running server adds clipping, scrollbars, viewport sizing, and minimum font size, and the result's `browser.ran` says whether those rules ran
6. Capture the frame in both themes with `frameboard capture <page>/<frame> --json` and look at each image before handing back, since a theme you never saw is a theme nobody checked.
7. Run `frameboard show <page>/<frame>` so the developer's board turns to the frame you drew.

## Make every frame work in both themes

- Take colors and fonts from the board's token variables through `var()` wherever a token exists, since a token carries both themes.
- Define the dark theme beside any color you set yourself, through a `[data-theme="dark"]` rule, a `prefers-color-scheme` query, or `light-dark()`.
- Name a font first in every `font-family`, keeping a generic family as the fallback only.

## Claim a frame before you rewrite it

A new frame needs no claim, since nothing else holds a file you have just written.

Run `frameboard editing <page>/<frame> --json` before you change an existing frame, so the developer's board shows you working on it and another session knows it is taken.

- A claim lapses five minutes after you last ran it, so run it again while you are still at work
- Drop it with `frameboard editing <page>/<frame> --release --json` as soon as you are done rather than letting it lapse, since the developer's hand edits on it wait for your claim to end
- A refusal with `frame-claimed` means another session holds the frame. Leave it alone, or ask the developer, rather than writing it anyway, since nothing else stops you.

## Read what the developer picked

When the developer says "this", "the selected one", or points at something on the board, run `frameboard selection --json` before acting, and take the target from its answer rather than guessing.

- Treat a selection with no element as a frame or several frames, never as one element address
- On `server-not-running`, run `frameboard serve --json`, and when nothing is selected, ask the developer to pick what they mean
- Read it again before each new request, since it is a snapshot of the last writing tab and the developer keeps selecting

## Respect what the developer changed

- Read a frame again before changing it, since the developer may have edited it by hand since your last write.
- Change one property of one element through `frameboard edit`, which takes the element's `--index` and the frame file's SHA-256 as `--hash`
  1. Run `frameboard inspect <page>/<frame> --json` to find the element's index, or take it from the selection
  2. Edit by that index and hash
- Treat `editable: false` in the inspect result as a frame `edit` refuses at every index, then rewrite the file instead of trying other indices
- Inspect again after any rewrite, since indices follow document order and an old one can point at a different element
- Read the `edit` entry of `frameboard docs` for its refusals, `stale-address` among them, then inspect again and redo the edit
- Rewrite a whole frame only when the change reshapes it, and keep every value the developer set by hand.
- A `style` attribute outranks every rule, and may hold a value the developer set by hand, so read it before changing a rule the element matches. With a server running, `check` warns as `outranked` when your write changed such a rule.

## Answer the developer's notes

A line beginning `frameboard note` is a request the developer sent you from the board, so act on it as if they had typed it.

A line carrying `(images: <path>, ...)` names images the developer pasted into the note, by absolute path. Open each one before acting, since it shows what the words describe.

Read the whole thread with `frameboard notes --json` when the line was cut short, answer in the note with `frameboard notes reply <id> "<text>"` saying what you changed, and close it with `frameboard notes done <id>` once the request is met.
