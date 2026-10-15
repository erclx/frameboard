# Requirements

A developer working with coding agents needs a local board where agents draw screens as plain HTML files and the developer reviews and tweaks them, with no hosted design tool or MCP server.

This record holds at most 600 words.

## Goals

- An agent draws by writing an HTML file and running a few commands, each with machine-readable output and no prompts.
- The files are the design. Frameboard keeps no private copy, and a hand edit lands in the file, changing only what was edited.
- Frames render as real web pages, so animation, video, and interaction just work.
- A board folder lives inside a repository or anywhere on disk, with or without git.
- A board folder holds several projects. A project is a set of pages and is not a repository. A page holds frames.
- A home view lists every project as cards or rows, with a new project button. Moving between projects goes through it.
- Inside a board, the developer adds, duplicates, renames, reorders, and deletes pages and frames by hand, adds a frame at a phone, tablet, or desktop size, selects several frames at once, and undoes their own changes.
- A developer selects a frame or element and adjusts what is quicker by hand: frame position and size, and an element's name, opacity, radius, type, fill, and text. A frame's colors show with their token names.
- A command palette jumps to any project, page, or frame and runs the board's actions.
- The agent sees what the developer selected and works through notes pinned on frames. A note sent to a listening session reaches it at once, and the agent replies in the note.
- Every frame works in light and dark. One toggle switches the whole board, and a frame can be flipped alone to compare.
- Frames share one look through design tokens, with a board-wide default and per-project overrides.
- A frame breaking a content rule is reported to the agent that wrote it, straight after the write, and on the board. A project can add rules of its own.
- An agent screenshots a frame or a whole page, in either theme.
- The board shows which frame an agent is editing, and a second session is told it is taken.
- A new, empty folder starts with one command.

## Non-goals

- Real-time collaboration, multiplayer, comments, teams, or sharing links
- Drawing tools, vector editing, or image editing
- Layout editing by hand, being flex, padding, element size, or position inside a frame
- Effects controls such as border, shadow, and blending
- Components, constraints, or a plugin system
- A hosted service or an MCP server
- Export
- Claude rules shipped with the tool
- Motion review: a scrubber, a screenshot at a chosen moment, a filmstrip, or a recording (deferred)
- A custom color picker or scrubbing number fields (deferred)
- Search and archive on the home view (deferred)
- Present mode (deferred)
- A narrow-screen layout (deferred). Below about 1024px the board hides its UI and the canvas still pans and zooms
- Opening one frame on a phone over the local network (deferred)
- Skill and hook packaging for agents other than Claude Code (deferred)

## Constraints

- A hand control earns its place only when the edit beats asking the agent, and nothing by hand reshapes layout.
- Human and agent edits never silently overwrite each other.
- Frameboard knows nothing about any one consumer. Another tool hands it a board folder and a token stylesheet.
