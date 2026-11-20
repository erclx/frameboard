<div align="center">

<img src="src/client/public/icon.svg" alt="Frameboard logo" width="64" height="64">

# Frameboard

A local design board that coding agents draw on as plain HTML files, and you review and tweak.

[![npm](https://img.shields.io/npm/v/frameboard)](https://www.npmjs.com/package/frameboard)
[![Verify](https://img.shields.io/github/actions/workflow/status/erclx/frameboard/verify.yml?branch=main&label=Verify)](https://github.com/erclx/frameboard/actions/workflows/verify.yml)
[![Node](https://img.shields.io/node/v/frameboard)](package.json)
[![License](https://img.shields.io/npm/l/frameboard)](LICENSE)

</div>

<p align="center">
  <picture>
    <source media="(prefers-reduced-motion: reduce) and (prefers-color-scheme: dark)" srcset=".github/readme-hero-dark.png">
    <source media="(prefers-reduced-motion: reduce)" srcset=".github/readme-hero-light.png">
    <source media="(prefers-color-scheme: dark)" srcset=".github/readme-hero-loop-dark.webp">
    <img src=".github/readme-hero-loop-light.webp" alt="The Frameboard canvas showing a plant care app's landing page and two phone screens" width="880">
  </picture>
</p>

## Quick start

```bash
npx frameboard serve
```

`serve` opens a board in your browser, in a tab that can edit. Point your coding agent at the same folder, and each frame it writes shows up as soon as the file lands.

To keep it around, install it with `npm install -g frameboard` or `bun add -g frameboard`.

## How it works

| 1. Your agent writes                                                                             | 2. The board shows it                                                                                      | 3. You steer                                                                       |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Each frame is one HTML file in a page folder, so your agent draws with the tools it already has. | A frame reloads the moment its file changes, in light and dark, and a broken rule is flagged on the frame. | Move, restyle, and retype by hand, or pin a note your agent answers in its thread. |

## What you can do

<table>
  <tr>
    <td width="50%">
      <picture>
        <source media="(prefers-reduced-motion: reduce)" srcset=".github/readme-themes/slides.jpg">
        <img src=".github/readme-themes/slides.webp" alt="The slide grid, a step, then the presenter view with notes" width="420">
      </picture>
      <br><b>Slides</b><br>
      Present a page as slides, with transitions, steps inside a slide, speaker notes, and a presenter view in a second window.
    </td>
    <td width="50%">
      <picture>
        <source media="(prefers-reduced-motion: reduce)" srcset=".github/readme-themes/devices.jpg">
        <img src=".github/readme-themes/devices.webp" alt="A phone turned landscape, a foldable opened, then the project on a phone" width="420">
      </picture>
      <br><b>Devices</b><br>
      Put a frame in a phone, tablet, or foldable body, turn it landscape, and open the project on your own phone over the network.
    </td>
  </tr>
  <tr>
    <td width="50%">
      <picture>
        <source media="(prefers-reduced-motion: reduce)" srcset=".github/readme-themes/play.jpg">
        <img src=".github/readme-themes/play.webp" alt="Three sliders tuned on a photo, the values kept" width="420">
      </picture>
      <br><b>Play</b><br>
      Click through a frame like the real app, tune the sliders your agent drew, and keep the values you set.
    </td>
    <td width="50%">
      <picture>
        <source media="(prefers-reduced-motion: reduce)" srcset=".github/readme-themes/images-3d.jpg">
        <img src=".github/readme-themes/images-3d.webp" alt="A potted plant model found, placed, and turned, then a generated image" width="420">
      </picture>
      <br><b>Images and 3D</b><br>
      Find openly licensed images and 3D models, or generate them on your own machine, and each lands with its license.
    </td>
  </tr>
  <tr>
    <td width="50%">
      <picture>
        <source media="(prefers-reduced-motion: reduce)" srcset=".github/readme-themes/kits.jpg">
        <img src=".github/readme-themes/kits.webp" alt="A kit added, then one frame restyled with it" width="420">
      </picture>
      <br><b>Design kits</b><br>
      Start a project from a kit you can preview, then give any frame a kit of its own.
    </td>
    <td width="50%">
      <picture>
        <source media="(prefers-reduced-motion: reduce)" srcset=".github/readme-themes/hand-edits.jpg">
        <img src=".github/readme-themes/hand-edits.webp" alt="Three cards wrapped in a row, spaced, filled, and exported" width="420">
      </picture>
      <br><b>Hand edits</b><br>
      Wrap several elements in a row, set its gap and fills by hand, and export any of it as a PNG.
    </td>
  </tr>
</table>

[Everything you can do on the board](docs/board/index.md)

## For your agent

- Commands print JSON and never prompt, so an agent can run them unattended
- `frameboard check` flags what breaks a frame, such as clipped text or a color set for one theme only
- The Claude Code plugin checks each frame the agent writes and hands it your notes as they arrive
- A claim reserves the frame an agent is about to write, so you see where it is drawing before the file lands
- `frameboard image` and `frameboard model` find or generate assets from the command line, each saved with its license

[The command and check reference](docs/agents/index.md)

## Requirements

Frameboard runs on macOS and Linux, with Node 22 or later or with Bun. Windows support is planned.

`capture`, `frame fit`, `inspect`, and the home view's project thumbnails render in Playwright's headless shell. Without it, the commands print the command that installs it and download nothing, and each home card shows its frames as plain boxes.

## Links

- [How it works](docs/how-it-works.md) for the board folder, tokens, and themes
- [Contributing guide](CONTRIBUTING.md) for setup, tests, and the commit rules
- [Security policy](SECURITY.md) for reporting a vulnerability privately
- [Issue tracker](https://github.com/erclx/frameboard/issues)
- [MIT license](LICENSE)
