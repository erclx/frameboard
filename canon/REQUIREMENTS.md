# Requirements

Developers working with coding agents need a local board where agents draw screens as plain HTML files they review and edit by hand.

This record holds at most 650 words.

## Goals

### Files and folders

- An agent draws by writing an HTML file and running commands with machine-readable output and no prompts
- The files are the design, with no private copy
- Frames render as real web pages, so animation, video, and interaction work
- A board folder lives anywhere, with or without git, and starts with one command
- A new board's first page asks for a name and first screen size

### Projects and navigation

- A board folder holds several projects of pages of frames, not repositories
- A home view lists projects as cards or rows in folders, adds one, and leads between them
- A command palette jumps to any project, page, or frame and runs board actions

### Hand edits

- Most design tool edits are made by hand, outside the non-goals
- The developer adds, duplicates, renames, reorders, and deletes pages and frames, replaces, renames, and deletes assets, draws or picks a frame's size, selects several, and undoes their changes
- A developer sets a frame's position, size, fill, and extra widths, and an element's name, look, and text, with colors showing token names
- A developer places text, shapes, images, video, audio, or 3D models in a frame, sizes and deletes them, and edits text in place
- A developer places, turns, and scales a 3D model along each axis, by field or by a handle on the canvas
- A developer sets a container's flow, spacing, and alignment and each child's size, places an element freely or in the flow, and wraps a selection in one container
- A developer builds a slide in steps, setting each element's order, effect, start, duration, and delay

### Working with the agent

- The agent sees the selection and works through notes pinned on frames, with images and replies, reaching or starting a session
- The board shows the frame an agent is editing and warns a second session
- A broken content rule is reported at once to its agent and the board, and projects add rules or turn one off
- An agent screenshots a frame or page, and the developer exports a frame or element as PNG in either theme
- One project's frames open read only on a same-network phone

### Themes and tokens

- Every frame works in light and dark, switched board-wide or flipped alone
- Frames share design tokens, a board-wide default with per-project overrides, edited by hand, and a project adds kits, previewed and set one per frame

## Richer frames

- A developer plays a frame's drawn controls and keeps the values
- A developer or agent finds or generates an openly licensed image, 3D model, or font, saved with its license

## Non-goals

### Never

- Real-time collaboration, comments, teams, or sharing links
- A hosted service, an MCP server, or non-PNG export
- Claude rules shipped with the tool
- A plugin system

### Never by hand

- Vector or mesh editing, pen and path tools, or image editing
- Edge constraints, grid tracks, a stacking order beside the file's, or editing a shared style rule
- Components and variants

### Deferred

- Skill and hook packaging for agents other than Claude Code
- Blending and filter effects by hand

## Constraints

- Runs on macOS and Linux
- A hand edit writes ordinary HTML and CSS on each element it names, its parent when placing one freely, a token sheet, or a renamed asset's links, and the browser lays out the rest.
- Human and agent edits never silently overwrite each other.
- Frameboard knows no consumer, which hands it a board folder and token stylesheet.
