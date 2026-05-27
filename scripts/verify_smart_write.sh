#!/bin/bash
# Verify the create / noop / append / rewrite cycle of smartWrite.
set -e
source "$HOME/.nvm/nvm.sh"

PROJ=/home/satoshi/workspace/rimo/rimo-frontend
OUT="$PROJ/CCLOG"
TARGET="$OUT/CCLOG_ALL.md"

echo "=== check legacy state file presence BEFORE ==="
ls -la "$OUT"/.cclog-state.json 2>&1 || echo "  (none)"

echo
echo "=== run 1: cold (rm -rf CCLOG first) ==="
rm -rf "$OUT"
cclog "$PROJ" 2>&1 | tail -2
ls -la "$TARGET" | awk '{print "  mtime:", $6, $7, $8, "size:", $5}'

echo
echo "=== run 2: should report noop ==="
MTIME_BEFORE=$(stat -c %Y "$TARGET")
sleep 1
cclog "$PROJ" 2>&1 | tail -2
MTIME_AFTER=$(stat -c %Y "$TARGET")
if [ "$MTIME_BEFORE" = "$MTIME_AFTER" ]; then
  echo "  mtime preserved: OK"
else
  echo "  mtime changed unexpectedly!  $MTIME_BEFORE -> $MTIME_AFTER"
fi

echo
echo "=== prepare append test: trim last 50 lines of CCLOG_ALL.md ==="
LINES=$(wc -l < "$TARGET")
echo "  original lines: $LINES"
head -n $((LINES - 50)) "$TARGET" > "$TARGET.trim"
mv "$TARGET.trim" "$TARGET"
TRIM_LINES=$(wc -l < "$TARGET")
echo "  after trim: $TRIM_LINES"

echo
echo "=== run 3: should report append (re-add the trimmed tail) ==="
SIZE_BEFORE=$(stat -c %s "$TARGET")
cclog "$PROJ" 2>&1 | tail -2
SIZE_AFTER=$(stat -c %s "$TARGET")
echo "  size: $SIZE_BEFORE -> $SIZE_AFTER (delta: $((SIZE_AFTER - SIZE_BEFORE)))"
NEW_LINES=$(wc -l < "$TARGET")
echo "  lines: $TRIM_LINES -> $NEW_LINES"

echo
echo "=== run 4: should be noop again ==="
MTIME_BEFORE=$(stat -c %Y "$TARGET")
sleep 1
cclog "$PROJ" 2>&1 | tail -2
MTIME_AFTER=$(stat -c %Y "$TARGET")
if [ "$MTIME_BEFORE" = "$MTIME_AFTER" ]; then
  echo "  mtime preserved: OK"
else
  echo "  mtime changed!  $MTIME_BEFORE -> $MTIME_AFTER"
fi

echo
echo "=== legacy state file check AFTER (should be absent) ==="
ls -la "$OUT"/.cclog-state.json 2>&1 || echo "  (none — good)"

echo
echo "=== header sanity check ==="
head -8 "$TARGET"
