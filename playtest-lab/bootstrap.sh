#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PART_DIR="$ROOT/bootstrap"
EXPECTED_PARTS=35
EXPECTED_BYTES=78445
EXPECTED_SHA256="bc229b86057aa3f52a879dbc6fd67b4025228a0de498612290e9c7750785e69b"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

shopt -s nullglob
PARTS=("$PART_DIR"/core.b64.part-*)
shopt -u nullglob

if [[ ${#PARTS[@]} -ne $EXPECTED_PARTS ]]; then
  echo "ERROR: expected $EXPECTED_PARTS payload parts, found ${#PARTS[@]}. Run git pull origin playtest-lab-v0.2 and retry." >&2
  exit 1
fi

cat "${PARTS[@]}" > "$TMP/core.b64"

python3 - "$TMP/core.b64" "$TMP/strikeforce30-core.tgz" <<'PY'
import base64, pathlib, sys
src=pathlib.Path(sys.argv[1])
dst=pathlib.Path(sys.argv[2])
try:
    dst.write_bytes(base64.b64decode(src.read_bytes(), validate=True))
except Exception as exc:
    raise SystemExit(f"ERROR: payload base64 validation failed: {exc}")
PY

ACTUAL_BYTES="$(python3 - "$TMP/strikeforce30-core.tgz" <<'PY'
import pathlib, sys
print(pathlib.Path(sys.argv[1]).stat().st_size)
PY
)"
ACTUAL_SHA256="$(python3 - "$TMP/strikeforce30-core.tgz" <<'PY'
import hashlib, pathlib, sys
print(hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest())
PY
)"

if [[ "$ACTUAL_BYTES" != "$EXPECTED_BYTES" ]]; then
  echo "ERROR: reconstructed payload size mismatch: expected $EXPECTED_BYTES, got $ACTUAL_BYTES." >&2
  exit 1
fi
if [[ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]]; then
  echo "ERROR: reconstructed payload SHA-256 mismatch." >&2
  echo "expected: $EXPECTED_SHA256" >&2
  echo "actual:   $ACTUAL_SHA256" >&2
  exit 1
fi

tar -tzf "$TMP/strikeforce30-core.tgz" >/dev/null
tar -xzf "$TMP/strikeforce30-core.tgz" -C "$TMP"
SRC="$TMP/strikeforce30-playtest-lab"
if [[ ! -f "$SRC/package.json" || ! -d "$SRC/src" || ! -d "$SRC/test" ]]; then
  echo "ERROR: verified archive is missing the runnable engine tree." >&2
  exit 1
fi

cp -R "$SRC"/. "$ROOT"/

echo "Strikeforce30 engine restored and checksum-verified."
echo "SHA-256: $EXPECTED_SHA256"
echo "Next: cd playtest-lab && npm install && npm test && npm run smoke:synthetic"
