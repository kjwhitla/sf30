#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ARCHIVE="$ROOT/bootstrap/strikeforce30-core.tgz"
TMP="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP"
}
trap cleanup EXIT

if [[ ! -f "$ARCHIVE" ]]; then
  echo "Missing bootstrap archive: $ARCHIVE" >&2
  exit 1
fi

tar -xzf "$ARCHIVE" -C "$TMP"

SRC="$TMP/strikeforce30-playtest-lab"
if [[ ! -d "$SRC" ]]; then
  echo "Bootstrap archive does not contain strikeforce30-playtest-lab/" >&2
  exit 1
fi

cp -R "$SRC"/. "$ROOT"/

echo
echo "Strikeforce30 runnable playtest engine restored into:"
echo "  $ROOT"
echo
echo "Next:"
echo "  cd playtest-lab"
echo "  npm install"
echo "  npm test"
echo "  npm run smoke:synthetic"
