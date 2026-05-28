#!/bin/bash
# Replace any installed @standard-software/cclog with the local dev
# version (from this very repo) on every nvm-managed node. Useful when
# testing a fix before publishing.
set -u
NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# Repo path inside WSL (this script lives in <repo>/scripts/)
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo "Repo: $REPO_DIR"

for VDIR in "$NVM_DIR/versions/node"/*/; do
  V=$(basename "$VDIR")
  BIN="$VDIR/bin"
  echo "=== $V ==="
  if [ ! -x "$BIN/npm" ]; then
    echo "  skip: npm not found"
    continue
  fi
  PATH="$BIN:$PATH" "$BIN/npm" rm -g @standard-software/cclog cclog >/dev/null 2>&1 || true
  rm -f "$BIN/cclog" "$BIN/cclog.cmd" 2>/dev/null || true
  PATH="$BIN:$PATH" "$BIN/npm" install -g "$REPO_DIR" 2>&1 | tail -2
  if [ -x "$BIN/cclog" ]; then
    echo "  cclog --version: $(PATH="$BIN:$PATH" "$BIN/cclog" --version 2>&1)"
  else
    echo "  WARN: cclog not present at $BIN/cclog"
  fi
done
