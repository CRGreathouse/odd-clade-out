#!/usr/bin/env bash
# Checks that build.py runs without error and produces a valid self-contained
# bundle.  Mirrors the OK/WARN/ERROR conventions of the other checks.
#
# Usage: bash checks/build.sh
# Exit code: 1 if any ERROR, 0 otherwise.

set -euo pipefail
cd "$(dirname "$0")/.."

TMP=$(mktemp /tmp/cladogame-bundle-XXXXXX.html)
trap 'rm -f "$TMP"' EXIT

errors=0

# ── 1. build.py must run without crashing ────────────────────────────────────
if python3 build.py "$TMP" 2>/tmp/build-stderr.txt; then
  echo "OK:    build.py exited 0"
else
  echo "ERROR: build.py exited with non-zero status" >&2
  cat /tmp/build-stderr.txt >&2
  errors=$((errors + 1))
fi

if [ -s "$TMP" ]; then
  echo "OK:    output file is non-empty"
else
  echo "ERROR: output file is empty or missing" >&2
  errors=$((errors + 1))
fi

# ── 2. All <script src="…"> tags must have been replaced ─────────────────────
if grep -q '<script src=' "$TMP"; then
  echo "ERROR: bundle still contains <script src=…> — JS not fully inlined" >&2
  errors=$((errors + 1))
else
  echo "OK:    no <script src=…> tags (all JS inlined)"
fi

# ── 3. CSS link tag must have been replaced ───────────────────────────────────
if grep -q 'href="cladogame\.css"' "$TMP"; then
  echo "ERROR: bundle still contains cladogame.css link — CSS not inlined" >&2
  errors=$((errors + 1))
else
  echo "OK:    cladogame.css inlined"
fi

# ── 4. At least one image must be a data URI ──────────────────────────────────
if grep -q 'data:image/png;base64,' "$TMP"; then
  echo "OK:    at least one image inlined as data URI"
else
  echo "ERROR: no data URI images found in bundle" >&2
  errors=$((errors + 1))
fi

# ── 5. build.py must not print any warnings ───────────────────────────────────
if [ -s /tmp/build-stderr.txt ]; then
  echo "WARN:  build.py printed to stderr:" >&2
  cat /tmp/build-stderr.txt >&2
fi

echo ""
echo "${errors} error(s)"
exit $((errors > 0 ? 1 : 0))
