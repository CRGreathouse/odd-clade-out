#!/bin/bash
set -e
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
HOOK="$REPO_ROOT/.git/hooks/pre-commit"
cp "$REPO_ROOT/pre-commit.sh" "$HOOK"
chmod +x "$HOOK"
echo "Installed pre-commit hook at $HOOK"
