---
name: draw
description: Draws screens on a Frameboard board as plain HTML frames and keeps each one passing the board's content checks. Use when asked to design, mock up, or sketch a screen, to put a frame on the board, or to change a frame the developer is reviewing. Also use when asked to draw slides or a deck, add a slide transition or step, make a link preview card, lay out a video scene, draw sliders that tune an element, show a 3D model, or draw in a design kit such as a sketch or a wireframe. It also covers putting a screen in a phone or another device, finding or generating a picture for a frame, setting up local image and model generation, keeping accepted designs as a design record, copying a live page onto the board, and tilting an element in 3D.
---

# Frameboard

A Frameboard board is a folder of projects, pages, and frames, where every frame is one HTML file the developer reviews in a browser. You draw by writing those files and running the `frameboard` command, which never prompts and prints one JSON envelope under `--json`.

## Read the facts first

- Run `frameboard docs --json` once per session, before the first verb
- Read the version note the plugin's session hook prints, mention a mismatch to the developer once, and carry on
- When `frameboard` is not on PATH, install it with `npm install -g frameboard` rather than running a checkout's `dist/`
- Take every verb, flag, exit code, record shape, content rule, and check rule from that output rather than from memory, since it describes the installed version
- Branch on the `ok` key of each envelope and on the exit code, never on the wording of a message

## Start or reuse the board

- Run `frameboard serve --json` in the background. It creates a board in a folder that has none, and on a board already served it reports `reused: true` and binds nothing, so a second call is safe.
- Run `frameboard list --json` to see the projects, pages, and frames before adding any.
- Run `frameboard project add`, `rename`, or `delete` to manage projects, taking the arguments from `docs`, and reach for the rest of the `project` verbs as below
  - `project title <name> <title>` sets a free display title, and a blank one takes it off. It can move the folder to a name made from the title, so run `list --json` again before using an old path.
  - `project group <name> <folder>` files one under a home folder, and `--clear` takes it out
  - `project archive <name>` moves one to home's Archived section, and `--restore` brings it back
  - `project tokens` gives one with no token sheet a starter
- Run `frameboard open --no-open --json` when the developer needs a second tab that can edit, and hand them its `writeUrl`. The link works once and expires at `expiresAt`, and a tab opened on the plain address only reads.

## Draw a frame

1. Write the frame's file as `<frame>.html` in its page folder, whose path `frameboard list --json` reports, after `frameboard page add` for a page that does not exist yet. Keep everything it loads inside that folder, or in the project's `assets/` folder when two pages share a file.
   - Check the page's frames in that `list` output first, and treat a name already there as an existing frame to claim before you rewrite it, since a write over it lands unclaimed
   - Write the file before placing it, since `frame add` writes an empty skeleton when none exists and the developer watches a blank box until your write lands
2. Place it with `frameboard frame add <page>/<frame> --json` straight after the write. It places the file as written and touches nothing in it.
   - Pass the size name nearest the screen the developer described, from the `Frame sizes` block of `frameboard docs`, so it lands at its device width at once
   - Pass `slide-16-9` or `slide-4-3` for a slide, `og-card` for a link preview card at 1200 × 630, and `linkedin-post` for a LinkedIn post at 1200 × 627
   - Pass `video-landscape` or `video-portrait` for a video scene at 1920 × 1080 or 1080 × 1920
   - A frame with no size hugs its content on both axes, and a size fixes its width alone, so leave the size off a component and let the running server measure it
   - A frame with no size, reserved box, or layout entry whose name ends in a listed width, such as `overview-390`, takes that width with its device on, and `--width 390` takes it bare
   - Resize an axis only to fix it, since a resize stops that axis hugging
   - Pass `--scroll` for a page meant to scroll at a screen height, such as one with a sticky section, rather than running `frame fit`, which grows it to its full length
   - Place one frame with `--widths 834,390` for a responsive page, rather than copying its file per width, so every fix lands once and the board draws each width beside it
   - Leave the top of a phone frame unpadded for the status bar. While its device shows, the board draws the bar over the top 54 px of the box and starts the page under it, so a page at 390 × 844 lays out at 390 × 790.

## Tidy the board

When the developer asks to rearrange the board, run the verb for it rather than moving files or editing `layout.json`, and take its arguments from `docs`.

- Run `frame hide` when they want a frame out of sight for now, and `frame lock` when they want one kept as it is
- Run `frame move` to place a frame or carry it to another page, `frame order` when one covers another, and `frame rename`, `frame duplicate`, or `frame delete` when they ask for that
- Run `page move` to reorder pages, and `page rename`, `page duplicate`, or `page delete` when they ask for that, since deleting a page deletes its frames

## Check it and hand it back

Run these on each frame once it is placed.

1. Fix every finding the check hands back after the write, then write again. The check runs after each write, and a finding left in place shows on the frame's label on the board.
2. Run `frameboard check <page>/<frame> --json` to confirm a frame is clean before calling it done.
   - A finding at error means the frame renders wrong or cannot load, and a warning is a style call the frame still renders through
   - Read the findings from the envelope's `data.findings` in both answers, each naming its rule, file, line, and column
   - An error finding exits 8 and warnings alone exit 0, so branch on the exit and read `data.findings` either way
   - A frame runs on its own port, apart from the board, so a call to the board's `/api/` fails and `board-route` reports a script naming one. Mock an app's calls with data kept in the script.
3. Run that check with `frameboard serve` up before handing back, since the hook reports static findings alone.
   - Only a running server adds clipping, scrollbars, viewport sizing, and minimum font size, and the result's `browser.ran` says whether those rules ran
4. Capture the frame in both themes with `frameboard capture <page>/<frame> --json` and look at each image before handing back, since a theme you never saw is a theme nobody checked.
   - Capture any motion you wrote at a few moments with `--at` or `--filmstrip`, since a plain capture shows only where it comes to rest
   - Judge a whole page at once with `capture --page --composite`, and archive a whole project's images with `capture --all-pages`
5. Run `frameboard show <ref> [<ref>...]` naming every frame you drew, in the order to review them, so the developer's board turns to the first and its toast steps through the rest.
   - A ref is `<page>/<frame>`, or a page ref such as `<page>` standing for every frame on that page

## Read the reference for the task

Each feature past the core loop keeps its judgment in its own file. Read the one matching the task before the first write, and skip the rest.

- When copying a live site's page onto the board, read `${CLAUDE_SKILL_DIR}/references/lift.md`
- When the task is presenting a page, such as a deck, a slide transition, speaker notes, or an element a press reveals, read `${CLAUDE_SKILL_DIR}/references/slides.md`
- When drawing sliders or other controls that tune an element the developer keeps values for, read `${CLAUDE_SKILL_DIR}/references/controls.md`
- When a frame's `list --json` record carries `kit`, the project holds `assets/kits/` or `assets/kit/`, or the developer asks for a look or a new kit, read `${CLAUDE_SKILL_DIR}/references/kits.md`
- When a frame needs a photo or a picture you would otherwise fetch or generate yourself, read `${CLAUDE_SKILL_DIR}/references/images.md`
- When a frame shows a device body, the developer names a phone, a tablet, a laptop, or the foldable, or asks for a screen turned landscape, read `${CLAUDE_SKILL_DIR}/references/devices.md`
- When an element should lean or turn in 3D, such as a tilted card or a screenshot at an angle, read `${CLAUDE_SKILL_DIR}/references/tilt.md`
- When a frame plays a video or a sound, read `${CLAUDE_SKILL_DIR}/references/media.md`
- When a frame shows a 3D model, the developer asks for an object they can turn, or a picture should become a model through `model generate`, read `${CLAUDE_SKILL_DIR}/references/models.md`
- When the developer asks to set up local image or model generation on their own machine, or a picture or a model should be made on their ComfyUI server, read `${CLAUDE_SKILL_DIR}/references/generate.md`
- When the project keeps its accepted frames in a tracked folder, or the developer asks for a design record, read `${CLAUDE_SKILL_DIR}/references/record.md`

## Keep frames in their sections

The developer draws sections on the board, and `list --json` names each section's frames. A frame belongs to the section holding its center, so moving a frame out of the box takes it out of the section. Place a new frame inside a section's box to put it there, and never write a section yourself.

## Make every frame work in both themes

- Take colors and fonts from the board's token variables through `var()` wherever a token exists, since a token carries both themes.
- Define the dark theme beside any color you set yourself, through a `[data-theme="dark"]` rule, a `prefers-color-scheme` query, or `light-dark()`.
- Name a font first in every `font-family`, keeping a generic family as the fallback only.
- Run `font find` when the developer asks for a typeface the project does not hold, save the one they pick, and name its family in the frame with no link.

## Claim a frame before you rewrite it

Reserve every new frame you plan with `frameboard editing <page>/<frame>... --new --json` before writing any, so the developer's board shows where each will land. Each file lands in its reserved box.

Run `frameboard editing <page>/<frame> --json` before you change an existing frame, so the developer's board shows you working on it and another session knows it is taken. Run it on each reserved frame as you turn to write it too, which marks that box as the one you are drawing and keeps the whole set held.

- A claim lapses five minutes after you last ran it, so run it again while you are still at work
- Drop it with `frameboard editing <page>/<frame> --release --json` as soon as you are done rather than letting it lapse, since the developer's hand edits on it wait for your claim to end
- A refusal with `frame-claimed` means another session holds the frame. Leave it alone, or ask the developer, rather than writing it anyway, since nothing else stops you.
- Treat a frame the developer locked as one to keep as they left it. Rewrite its file only when they name it, since the lock never stops a write, and never clear the lock yourself.
- Leave a hidden frame out of `show`, and tell the developer when you change one

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
- Take one element out with `frameboard remove`, by the same index and hash, rather than rewriting the file around the gap
- Treat `editable: false` in the inspect result as a frame `edit` refuses at every index, then rewrite the file instead of trying other indices
- Inspect again after any rewrite, since indices follow document order and an old one can point at a different element
- Read the `edit` entry of `frameboard docs` for its refusals, `stale-address` among them, then inspect again and redo the edit
- Rewrite a whole frame only when the change reshapes it, and keep every value the developer set by hand.
- A `style` attribute outranks every rule, and may hold a value the developer set by hand, so read it before changing a rule the element matches. With a server running, `check` warns as `outranked` when your write changed such a rule.

## Answer the developer's notes

A line beginning `frameboard note` is a request the developer sent you from the board, so act on it as if they had typed it.

A line carrying `(images: <path>, ...)` names images the developer pasted into the note, by absolute path. Open each one before acting, since it shows what the words describe.

Read the whole thread with `frameboard notes --json` when the line was cut short, answer in the note with `frameboard notes reply <id> "<text>"` saying what you changed, and close it with `frameboard notes done <id>` once the request is met.

Run `frameboard inbox` to read the notes queued to this session when none arrived as a line, such as before the monitor starts. Add `--follow` to keep printing each note as the board sends it.
