#!/bin/bash
# Install @standard-software/cclog globally for every nvm-managed node
# version. Cleans up any prior link / install first.
set -u
NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

if [ ! -d "$NVM_DIR/versions/node" ]; then
  echo "ERROR: nvm node versions dir not found: $NVM_DIR/versions/node"
  exit 1
fi

for VDIR in "$NVM_DIR/versions/node"/*/; do
  V=$(basename "$VDIR")
  BIN="$VDIR/bin"
  echo "=== $V ==="
  if [ ! -x "$BIN/npm" ]; then
    echo "  skip: npm not found at $BIN/npm"
    continue
  fi
  # Remove any dangling/stale entry first
  rm -f "$BIN/cclog" "$BIN/cclog.cmd" 2>/dev/null || true
  PATH="$BIN:$PATH" "$BIN/npm" rm -g cclog @standard-software/cclog >/dev/null 2>&1 || true
  # Fresh install from npm registry
  PATH="$BIN:$PATH" "$BIN/npm" install -g @standard-software/cclog 2>&1 | tail -2
  if [ -x "$BIN/cclog" ]; then
    echo "  cclog --version: $("$BIN/cclog" --version 2>&1)"
  else
    echo "  WARN: cclog not present at $BIN/cclog"
  fi
done
