#!/bin/bash
# Verify @standard-software/cclog works under every nvm-managed node
# version (correctly sets PATH so the env-shebang finds node).
NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
for VDIR in "$NVM_DIR/versions/node"/*/; do
  V=$(basename "$VDIR")
  BIN="$VDIR/bin"
  if [ -x "$BIN/cclog" ]; then
    VERSION=$(PATH="$BIN:$PATH" "$BIN/cclog" --version 2>&1)
    echo "$V: $VERSION"
  else
    echo "$V: NOT INSTALLED"
  fi
done
