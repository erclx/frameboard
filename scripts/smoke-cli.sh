#!/usr/bin/env bash
set -euo pipefail

# Smokes a built Frameboard CLI. Takes the dist folder as its one argument and
# runs a copy of it from an empty folder outside the checkout and any
# repository, so the bundle cannot lean on node_modules and serve has to create
# its own .frameboard. Stops the server it starts on every exit path.

dist="${1:-}"
if [[ ! -f "$dist/cli.js" ]]; then
  echo "smoke-cli: usage: smoke-cli.sh <dist folder holding cli.js>" >&2
  exit 2
fi

repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
work=$(mktemp -d)
server=

cleanup() {
  if [[ -n "$server" ]]; then
    kill "$server" 2>/dev/null || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT

cp -R "$dist" "$work/frameboard-dist"
cli="$work/frameboard-dist/cli.js"
mkdir "$work/smoke"
cd "$work/smoke"

field() {
  node -p "JSON.parse(require('fs').readFileSync('$1', 'utf8')).data.$2"
}

expected=$(node -p "require('$repo/package.json').version")
test "$(node "$cli" --version)" = "$expected"

node "$cli" serve --no-open --json >serve.json 2>serve.err &
server=$!

url=
for _ in $(seq 1 60); do
  kill -0 "$server" || {
    cat serve.err
    echo "smoke-cli: serve exited early" >&2
    exit 1
  }
  url=$(field serve.json url 2>/dev/null) && break
  sleep 0.5
done
test -n "$url" || {
  cat serve.err
  echo "smoke-cli: serve never printed an address" >&2
  exit 1
}

# realpath both sides, since a temp folder on macOS sits under the /var symlink.
test "$(field serve.json root)" = "$(pwd -P)/.frameboard"
curl --fail --silent "$url" | grep -q '<title>Frameboard</title>'

node "$cli" page add home --json >page.json
node "$cli" frame add home/hero --json >frame.json
printf '%s\n' '<!doctype html><html><head><title>Hero</title></head><body style="font-family: Georgia, serif"><p>Hello</p></body></html>' >"$(field frame.json path)"

node "$cli" check --json >check.json
test "$(field check.json findings.length)" = "0"
node "$cli" list --json | grep -q '"ref": "untitled/home/hero"'

echo "smoke-cli: ok"
