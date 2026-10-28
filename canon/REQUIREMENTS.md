# Requirements

A developer working with coding agents needs a local board where agents draw screens as plain HTML files the developer reviews and edits by hand.

This record holds at most 600 words.

## Goals

### Files and folders

- An agent draws by writing an HTML file and running commands with machine-readable output and no prompts
- The files are the design, with no private copy
- Frames render as real web pages, so animation, video, and interaction work
- A board folder lives anywhere, with or without git
- An empty folder starts with one command
- A new board's first page asks for a name, first screen size, and look

### Projects and navigation

- A board folder holds several projects of pages of frames, not repositories
- A home view lists projects as cards or rows in folders, adds one, and leads between them
- A command palette jumps to any project, page, or frame and runs board actions

### Hand edits

- Most edits a designer makes in a design tool are made by hand, outside the non-goals
- The developer adds, duplicates, renames, reorders, and deletes pages and frames, adds a frame from device sizes or draws one, selects several, and undoes their changes
- By hand, a developer sets a frame's position, size, and fill, and an element's name, opacity, radius, rotation, flip, type, fill, stroke, shadow, and text. Colors show their token names, and number fields scrub.
- A developer places text, a shape, an image, or a video in a frame, sizes it by drag or corners, deletes it, and edits text in place
- A developer sets a container's flow, gap, padding, and alignment and a child's fixed, hug, or fill size, places an element freely or back in the flow, and restacks it among siblings

### Working with the agent

- The agent sees the developer's selection and works through notes pinned on frames, carrying images, which reach a listening session or start one, and take replies.
- The board shows the frame an agent is editing and warns a second session
- A frame breaking a content rule is reported at once to its agent and the board, and projects add rules.
- An agent screenshots a frame or page, and the developer exports a frame as a PNG at 1x to 3x, in either theme or both

### Themes and tokens

- Every frame works in light and dark, switched board-wide or flipped alone.
- Frames share one look through design tokens, a board-wide default with per-project overrides, edited by hand

## Non-goals

### Never

- Real-time collaboration, comments, teams, or sharing links
- A hosted service, an MCP server, or non-PNG export
- Claude rules shipped with the tool
- A plugin system

### Never by hand

- Vector editing, pen and path tools, or image editing
- Edge constraints, grid tracks, a stacking order beside the file's, or editing a shared style rule
- Components and variants

### Deferred

- Opening one frame on a phone over the local network
- Skill and hook packaging for agents other than Claude Code
- Blending and filter effects by hand

## Constraints

- Runs on macOS and Linux
- A hand edit writes ordinary HTML and CSS on the element it names, its parent when placing it freely, or a token sheet, and the browser lays out the rest.
- Human and agent edits never silently overwrite each other.
- Frameboard knows nothing about any consumer, which hands it a board folder and token stylesheet.
