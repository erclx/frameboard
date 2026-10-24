# Contributing to Frameboard

This page covers getting a working checkout, where things live, how to test a change, and the commit and pull request rules the hooks enforce.

## Setup

You need [Bun](https://bun.sh), Node 22 or later, and the `canon` CLI, since the pre-commit hook runs `canon indexes regen` on staged markdown.

```bash
bun add -g @erclx/canon
git clone https://github.com/erclx/frameboard.git
cd frameboard
bun install
bunx playwright install chromium
bun run check
```

`bun install` also activates the git hooks through husky. `bun run check` runs the same gate as the `pre-push` hook, being typecheck, lint, format check, unit tests, build, and the markdown bans. It writes nothing, so run `bun run format` when it reports formatting drift.

## Layout

| Path                  | What it holds                                                                     |
| --------------------- | --------------------------------------------------------------------------------- |
| `src/cli/`            | The `frameboard` command, which rolldown bundles into `dist/cli.js`               |
| `src/server/`         | The Hono app and the loopback server that serves the built client                 |
| `src/client/`         | The React board UI, its shadcn kit under `components/ui/`, and the token styles   |
| `src/shared/`         | Code both the CLI and the server import                                           |
| `e2e/`                | Playwright specs, the screenshot harness and its cases, and the evidence baseline |
| `plugins/frameboard/` | The Claude Code plugin, listed by `.claude-plugin/marketplace.json`               |
| `scripts/`            | The verify runner and the shell scripts the package scripts call                  |
| `canon/`              | Requirements, design intent, and per-domain context for contributors and agents   |

## Running the plugin locally

Load the plugin from your checkout instead of the marketplace, so edits under `plugins/frameboard/` take effect on the next session:

```bash
claude --plugin-dir ./plugins/frameboard
```

Inside the checkout, the check hook and the inbox monitor run your own `dist/`, so run `bun run build` after a change to the CLI or the checks.

After changing a manifest, check it. `claude plugin validate .` reads the marketplace and `claude plugin validate ./plugins/frameboard` reads the plugin.

## Tests

- `bun run test:run` runs Vitest once across two projects. The `node` project covers `src/cli/`, `src/server/`, and `src/shared/`, and the `browser` project runs `src/client/` in headless Chromium.
- `bun run test:e2e` builds the CLI and runs Playwright against it
- `bun run check:full` runs the whole gate followed by the end to end suite

Frameboard ships one CLI that runs on Node and on Bun, so a change to `src/cli/` or `src/server/` should start under both. After `bun run build`, run `node dist/cli.js serve` and `bun dist/cli.js serve` and open the board each time.

`canon/context/development/local.md` lists every script and the hooks in full.

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org), and the `commit-msg` hook runs commitlint on each one. It refuses a message that breaks any of these rules:

- The header reads `<type>(<scope>): <subject>`, such as `fix(server): close the socket on shutdown`
- The header is at most 72 characters
- The first word of the subject is lowercase. Later words may carry capitals, so a proper noun past the first word is fine.
- The scope is lowercase, and the subject ends with no period
- No `Co-authored-by` trailer may credit Claude or Anthropic, by name or by address

The types are the conventional set of `feat`, `fix`, `refactor`, `docs`, `chore`, `perf`, `test`, `style`, `build`, `ci`, and `revert`.

## Pull requests

Branch from `main` and open the pull request against it. The template asks for three sections:

- **Summary:** one sentence on what the change does and why
- **Key changes:** the files or components touched, with a reason where it is not obvious
- **Testing:** the commands you ran and the cases you checked

CI runs the static checks, unit tests, build, and end to end tests on every pull request, and a pull request merges once they pass. Keep each one to a single concern. A refactor that a feature needs reads better as its own pull request ahead of the feature.

## Releases

release-please cuts every release from the conventional commits on `main`. Each push to `main` keeps one release pull request open, holding the next version, its `CHANGELOG.md` entry, and the matching `version` in `package.json` and `plugins/frameboard/.claude-plugin/plugin.json`. Merging that pull request tags the release, and the same workflow builds the tag and publishes `frameboard` to npm.

The workflow needs two repository secrets. `NPM_TOKEN` is an npm token allowed to publish `frameboard`, and `RELEASE_PLEASE_TOKEN` is a GitHub token that opens the release pull request so CI runs on it. Until both are set, the workflow fails on every push to `main` before it cuts anything.

When a release exists on GitHub and npm does not serve it, the Publish Check job fails and names the tag. Publish that tag again with:

```bash
gh workflow run release-please.yml -f tag=<tag>
```

## AI-assisted contributions

Contributions written with a coding agent are welcome. You are the author of what you submit, so read every line before you open the pull request and be ready to explain it. Credit yourself in the commit, since the hook refuses a Claude or Anthropic co-author trailer.

The repository's `CLAUDE.md` and the `canon/` folder carry the conventions agents follow here. Point your agent at them rather than restating the rules in a prompt.
