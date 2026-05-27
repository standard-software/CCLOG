#!/bin/bash
# Run cclog on the ipstation project into /tmp, then check whether the
# slash command body is now present in the output.
set -e
OUT=/tmp/cclog_verify
rm -rf "$OUT"
cclog /home/satoshi/workspace/polyrhythm/ipstation --out "$OUT" --rebuild >/dev/null
echo "=== file: $OUT/CCLOG_ALL.md ==="
echo "lines: $(wc -l < "$OUT/CCLOG_ALL.md")"
echo
echo "=== first /my-todo2 block ==="
# Print 25 lines starting from the first line that mentions /my-todo2.
awk '
  /\/my-todo2/ { hit=1 }
  hit { print; count++; if (count >= 25) exit }
' "$OUT/CCLOG_ALL.md"
