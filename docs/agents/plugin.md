---
title: Plugin
description: The Claude Code plugin, its checks after each write, its note monitor, and the draw skill
---

# Plugin

The Claude Code plugin in `plugins/frameboard/` runs the static checks after each agent write and hands the findings back in the same turn.

- Its monitor runs `inbox --follow` for the session, so a sent note reaches the agent at once
- Its skill is `frameboard:draw`, and a session hook warns the agent when the installed CLI and the plugin are different versions
