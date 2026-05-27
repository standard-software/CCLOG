#!/bin/bash
# Verify cclog works under every nvm-managed node.
NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
for VDIR in "$NVM_DIR/versions/node"/*/; do
  V=$(basename "$VDIR")
  BIN="$VDIR/bin"
  echo "=== $V ==="
  if [ ! -x "$BIN/cclog" ]; then
    echo "  not linked"
    continue
  fi
  PATH="$BIN:$PATH" "$BIN/cclog" --help 2>&1 | head -2
done
