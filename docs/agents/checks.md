---
title: Content checks
description: The content rules a frame is checked against, their levels, and turning one off for a project
---

# Content checks

The checks report what keeps a frame from rendering right, at once to the agent and on the board.

`frameboard check` reports every content rule a frame breaks, such as a link outside its page folder, colors set for one theme alone, or a script calling the board's own `/api/` routes, and exits 8 on any error. With `--json` the findings sit under `data.findings` whether it passes or fails.

- An error means the frame renders wrong or cannot load, and a warning means it renders and a style call is in question, such as a generic font. `frameboard docs` prints each rule's level.
- The board runs the same rules on each change, and a frame's findings mark opens the list. Any error draws it as a filled red badge, and warnings alone as a grey dot and a count
- A finding in a stylesheet the frame links names that file beside its line
- A running server adds the rules only a browser can see, such as clipped content, an inner scrollbar, dropped CSS, and a sticky effect in a frame that never scrolls
- A running server also warns when an agent's write changes a rule that an element's own `style` attribute overrides, since that element keeps the value you may have set by hand

A project turns off a rule that does not fit it, an error rule included.

- List the rule's id in `checks.off` of the project's `project.json`, such as `"off": ["generic-font"]`
- A rule turned off is silent on the board, in `check`, and in the plugin hook
- Each finding's card on the board carries a Turn off button that writes that key for the frame's project
- The project menu's Rules turned off list turns one back on with a press, as Undo or a hand edit of the file does
- `list --json` carries the ids as `checksOff` on each project, an id no rule declares included
