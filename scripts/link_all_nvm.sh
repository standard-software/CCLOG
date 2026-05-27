#!/bin/bash
# Link cclogtofile globally for every nvm-managed node version.
set -u
PKG_DIR="/mnt/c/MyFolder/MyData/Programming/ClaudeCodeTools/CCLogToFile"
NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

if [ ! -d "$NVM_DIR/versions/node" ]; then
  echo "ERROR: nvm node versions dir not found: $NVM_DIR/versions/node"
  exit 1
fi

cd "$PKG_DIR" || { echo "ERROR: cd to $PKG_DIR failed"; exit 1; }

for VDIR in "$NVM_DIR/versions/node"/*/; do
  V=$(basename "$VDIR")
  BIN="$VDIR/bin"
  echo "=== $V ==="
  if [ ! -x "$BIN/npm" ]; then
    echo "  skip: npm not found at $BIN/npm"
    continue
  fi
  # Remove any stale link from the previous name (cclogtofile) so we don't
  # leave dangling commands around. Ignore errors if the link is absent.
  PATH="$BIN:$PATH" "$BIN/npm" rm -g cclogtofile >/dev/null 2>&1 || true
  PATH="$BIN:$PATH" "$BIN/npm" link 2>&1 | sed 's/^/  /' | tail -3
  if [ -L "$BIN/cclog" ] || [ -f "$BIN/cclog" ]; then
    echo "  ok: $BIN/cclog"
  else
    echo "  WARN: cclog not linked into $BIN"
  fi
done

echo "Done."
