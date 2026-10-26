# Requirements

A developer working with coding agents needs a local board where agents draw screens as plain HTML files the developer reviews and tweaks, with no hosted design tool or MCP server.

This record holds at most 600 words.

## Goals

### Files and folders

- An agent draws by writing an HTML file and running commands with machine-readable output and no prompts
- The files are the design, with no private copy, and a hand edit changes only its target.
- Frames render as real web pages, so animation, video, and interaction work
- A board folder lives in a repository or anywhere, with or without git
- An empty folder starts with one command
- A new board's first page asks for a name, first screen size, and look, writing each answer to files

### Projects and navigation

- A board folder holds several projects, each a set of pages of frames, not a repository
- A home view lists every project as cards or rows, with a new project button. Moving between projects goes through it.
- A command palette jumps to any project, page, or frame and runs board actions

### Hand edits

- The developer adds, duplicates, renames, reorders, and deletes pages and frames, adds a frame from a short phone, tablet, and desktop list or draws one to any size, selects several frames, and undoes their own changes
- By hand, a developer sets a frame's position, size, and fill, and an element's name, opacity, radius, type, line height, letter spacing, fill, stroke color, shadow, and text. Colors are picked beside their token names, and number fields scrub.
- A developer places text or a shape inside a frame, landing in the layout where clicked or sized by a drag, moves it to another spot in the layout or deletes it, and edits text in place on a double-click

### Working with the agent

- The agent sees the developer's selection and works through notes pinned on frames, carrying pasted or dropped images, which reach a listening session at once or start one, and take its replies.
- The board shows which frame an agent is editing and tells a second session it is taken
- A frame breaking a content rule is reported at once to its agent and on the board, and projects can add their own rules.
- An agent screenshots a frame or page in either theme

### Themes and tokens

- Every frame works in light and dark, switched board-wide by one toggle or flipped alone.
- Frames share one look through design tokens, a board-wide default with per-project overrides

## Non-goals

### Never

- Real-time collaboration, comments, teams, or sharing links
- A hosted service, an MCP server, or export
- Claude rules shipped with the tool

### Never by hand

- Vector editing, pen and path tools, or image editing
- Layout editing, being flex, padding, or placing an element outside the layout's flow
- Effects controls such as blending and filters
- Components, constraints, or a plugin system

### Deferred

- Opening one frame on a phone over the local network
- Skill and hook packaging for agents other than Claude Code

## Constraints

- Runs on macOS and Linux
- A hand control earns its place only when the edit beats asking the agent, and nothing by hand changes the layout of anything but what it touches.
- Human and agent edits never silently overwrite each other.
- Frameboard knows nothing about any one consumer, which hands it a board folder and token stylesheet.
