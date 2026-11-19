# Requirements

A developer working with coding agents needs a local board where agents draw screens as plain HTML files the developer reviews and edits by hand.

This record holds at most 650 words.

## Goals

### Files and folders

- An agent draws by writing an HTML file and running commands with machine-readable output and no prompts
- The files are the design, with no private copy
- Frames render as real web pages, so animation, video, and interaction work
- A board folder lives anywhere, with or without git, and an empty one starts with one command
- A new board's first page asks for a name and first screen size

### Projects and navigation

- A board folder holds several projects of pages of frames, not repositories
- A home view lists projects as cards or rows in folders, adds one, and leads between them
- A command palette jumps to any project, page, or frame and runs board actions

### Hand edits

- Most edits a designer makes in a design tool are made by hand, outside the non-goals
- The developer adds, duplicates, renames, reorders, and deletes pages and frames, replaces, renames, and deletes assets, draws or picks a frame's size, selects several, and undoes their changes
- A developer sets a frame's position, size, fill, and extra widths, and an element's name, look, and text, with colors showing their token names
- A developer places text, a shape, an image, video, audio, or a 3D model in a frame, sizes it, deletes it, and edits text in place
- A developer sets a container's flow, spacing, and alignment and each child's size, places an element freely or in the flow, and wraps a selection in one container

### Working with the agent

- The agent sees the developer's selection and works through notes pinned on frames, with images and replies, which reach a listening session or start one
- The board shows the frame an agent is editing and warns a second session
- A frame breaking a content rule is reported at once to its agent and the board, and projects add rules or turn one off
- An agent screenshots a frame or page, and the developer exports a frame or element as a PNG in either theme
- A developer opens one project's frames read only on a phone on the same network

### Themes and tokens

- Every frame works in light and dark, switched board-wide or flipped alone
- Frames share one look through design tokens, a board-wide default with per-project overrides, edited by hand, and a project adds kits the board previews and sets one per frame

## Richer frames

- A developer plays controls drawn in a frame and keeps the values they set
- A developer or an agent finds an openly licensed image or 3D model, or generates one, saved into the project with its license

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
- Frameboard knows nothing about any consumer, which hands it a board folder and token stylesheet.
