---
title: Checks
description: The content rules Frameboard enforces, the three paths that run them, and a project's own rules
---

# Checks

## Overview

Owns the content rules and where they run. A frame that breaks one is reported without anyone remembering to check, both to the agent straight after its write and on the frame's label on the board.

## Layout

### `src/server/checks/`

Owns the rules, the cascade they read, and the runner over a frame, a page, or a project. It imports only `src/shared/` and its libraries, so the hook bundles it without the server. While a server runs, the board sheet is the `--tokens` sheet the address file records.

- The `check` verb, the server on every watched batch, and the plugin hook all run `checkFrameIn`, so no path drifts from another
- `check` exits 8 with `check-findings` and the result in the error's details when any finding is an error, so a script branches on the exit alone. A result holding warnings alone exits 0
- Exact rules read the parsed file, being `naming`, `dot-folder`, `head-body`, `table-tbody`, `malformed-tag`, `nesting`, `outside-link`, `network`, `missing-file`, and `unknown-token`

Every rule's level sits on its `RuleDoc` as `severity`, which `docs` prints beside its id, so a new rule cannot ship without one.

- Red means the frame is broken, rendering wrong or not loading, and an error fails `check`. Amber means it renders and a style call is in question, so a warning never does
- The errors are the link, markup, and naming rules, `clipped`, `theme`, and `allowed-fonts`, which a project chose. Every other rule warns, `uppercase` and `min-font-size` included
- `findingFor` binds a module's docs and stamps each finding with its rule's level, refusing a rule the docs never declare

The markup rules read what parse5 recovered from, since a browser recovers from the same bytes without a word.

- `readFrame` collects parse5's `onParseError` codes onto `FrameSource.parseErrors`, so a rule reads them without parsing twice
- `malformed-tag` reports the tokenizer codes for a broken tag or attribute, once per start tag at its first code, since one stray quote raises several
- `nesting` reports an element with no start tag past the wrappers a valid file may imply, and one a table fostered out ahead of it
- `nesting` also reports an HTML element whose end tag never matched, past those a valid file may omit, and leaves SVG, MathML, and `<template>` content alone

The custom property rule reads declarations rather than the tree.

- `unknown-token` reports a `var()` with no fallback that no token sheet, frame sheet, or style attribute declares, leaving a token sheet's own references to the board
- A property a script sets reads as unknown to `unknown-token`, which a fallback silences
- `unknown-token` skips a rule whose selectors match no element in the frame, so a linked site sheet's rules for other pages stay quiet. One css-select cannot match statically still reports
- `parseSheet` blanks a declaration postcss reads as an unknown word and cuts the sheet at any other break, so `unknown-token` and `dropped-declaration` read every declaration a browser keeps

Selector rules read the cascade rather than the parsed file.

- They are `default-font`, `generic-font`, and `theme`, plus `allowed-fonts` and `uppercase` only when `project.json` sets `checks.allowedFonts` or `checks.noUppercase`
- `theme` passes a `box-shadow` or `text-shadow` whose colors are all black or white at or under 0.2 alpha, since a faint shadow reads the same on either theme
- The cascade matches with css-select, weighs with `@bramus/specificity`, resolves custom properties per element, and reads token sheets ahead of the frame's own

One rule reads two versions of a frame rather than one.

- `outranked` warns when an agent's write changed a rule in the frame's own `<style>` that an element's `style` attribute also sets, since an inline value beats every normal rule
- It counts only an inline declaration the replaced bytes already held, so a value the write added never trips it
- It matches a shorthand to the longhands it sets, so a `padding` rule reaches an inline `padding-left`
- `frameFrom` reads the replaced bytes from memory, since `readFrame` reads the file as it stands now

The hook's entry is `src/cli/hook.ts`, bundled to `dist/hook.js` beside the CLI, in the folder `canon/context/agent/cli.md` owns.

- The hook prints `decision: "block"` with the findings as `reason`, which Claude Code places beside the tool result as feedback on that write
- It exits 0 and prints nothing for a non-frame write, a frame outside any board, a file gone since, and stdin that is not JSON, so a write is never reported as failed
- The bundle carries no commander, Hono, chokidar, ws, or zod, and a run cost a median 80 ms on Bun against a bare start of 17 ms. Measured at d609955 on 2026-10-17.

### `src/server/checks/browser/`

Owns the browser tier, the rules that read a rendered page. It sits in its own folder so the hook bundle, which imports `checks/frame.ts` alone, never reaches it or `playwright-core`. Only `clipped` reports an error, and `viewport` warns since a full-height screen sizes off the viewport on purpose.

- `checkRendered` opens a frame through capture's `openFrame` at its layout size, in light then dark, with `fonts: 'wait'` so a missing face is measured in the fallback the board shows
- Each rule reports at most one finding per frame, naming the first offending element by its edit index and how many more, and opens with the theme when only one theme trips it
- `clipped` measures uncropped boxes grown to their text's line box, against the frame's box and not the block's, so a `nowrap` heading counts past the frame only. `scrollbar` takes 1 px of slack
- `viewport` rereads the content at twice the viewport height through `fit`'s `readContentSize`, which leaves out what a cropping ancestor hides, as `clipped` does
- `min-font-size` runs only when `project.json` sets `checks.minFontSize` to a positive number of pixels, and picks text elements the way capture's font check does

`dropped-declaration` is the one browser rule that reports per declaration rather than once per frame. Only the page's own parser knows what it drops, which is why the rule sits in the browser tier.

- It reads the frame's own sheets and style attributes with postcss in node, then asks the page's `CSS.supports` for every pair in one `evaluate`
- It reports each refused pair at its source location, and a sheet postcss refuses once at the break
- It skips custom properties, declarations inside `@font-face`, `@property`, `@page`, `@counter-style`, `@font-palette-values`, and `@supports`, and the `-moz-`, `-ms-`, and `-o-` prefixes
- It skips a `-webkit-` declaration whose standard property sits in the same rule, the fallback a build tool writes for Safari, and still reports one standing alone
- It reads no theme, so `checkRendered` runs it once and appends its findings after the merged themed rules, and it takes the board `root` to read the frame

The findings the board holds between watch batches, and the warm checker that runs this tier, sit in `src/server/live/`, which `canon/context/board/server.md` owns. Each frame's list is its static findings, then the change findings its last agent write raised, then the browser findings last landed for it, so the client keeps one list per ref.

- The server sends the whole findings map after the board on hello, then a partial map per batch where an empty list clears a frame
- A change to a token sheet rechecks and reloads every frame it reaches, and a change to a project's `project.json` rechecks them without a reload
- `rendered-findings.ts` rechecks one frame at a time on the PNG route's warm browser but its own queue, sweeping every frame at start and after each browser launch
- A batch queues the frames `recheckRefs` names plus every frame whose box or file time changed, since a resize writes `layout.json` alone
- A frame queued again before its result lands drops that result, a failed recheck lands an empty list, and a reading of a file since rewritten lands nothing

`start.ts` runs `outranked` as the tracker settles an agent's write, past the one-second grace, against the source `version` holds for its `before` hash. The hook holds no copy of the replaced bytes, so it never raises `outranked`.

- A later write raising nothing keeps the held warning while it still holds against the bytes that raised it
- A hand edit leaves a held warning as it is

### `src/server/routes/checks.ts`

Owns `POST /api/checks`, behind the write token, which `check` calls with the refs it read.

- It rescans the board first, queueing a write the watcher has not batched yet and handing it to the change tracker, then waits out that write's grace and every pending recheck of those frames
- It answers the held change findings, then the held browser findings, and `browser: { ran: true }`
- A browser that does not launch answers `browser: { ran: false, reason: 'browser-not-found' }` with the change findings alone, so the board says nothing of the browser and `check` alone reports it
- `check` with no live server, or one that does not answer in 120 seconds, sets `browser.reason` to `server-not-running` and closes its human output on a line saying so

### Other folders

The plugin side of the hook sits outside `src/`.

- `plugins/frameboard/hooks/` owns `hooks.json` and the `check.sh` resolver the plugin runs after every agent write

## Gotchas

- `frame.ts` holds `checkFrame` apart from the runner in `run.ts`, because the runner reads the board scanner and its zod classic import would double the hook's start
- The browser rules run on the server and never in the hook, so an agent sees them through `check` with a server running and on the board, never in the turn of its write
- Every serve launches Chromium for the startup sweep, so a spec or capture case reading a label count waits on `check` or `POST /api/checks` first, since a browser finding can land mid-assertion
- The browser comparison in `e2e/cli/checks.spec.ts` never sets `color-scheme` itself, since that flips the default text color around a frame's fixed literal color and reads as two themes
- A project rule kind is added only when a real frame needs it, since a config language that grows ahead of need becomes the design tool Frameboard is not

Both copies of the cropping test walk the containing block chain.

- An ancestor crops only what its box contains, so the walk skips one an absolute element anchors past
- An absolute element escaping an `overflow: hidden` ancestor that does not anchor it counts for `clipped` and `viewport`
