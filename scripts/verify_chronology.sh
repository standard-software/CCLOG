#!/bin/bash
# Run cclog --rebuild and verify pairs in CCLOG_ALL.md are chronological
# across sessions.
set -e
OUT=/tmp/cclog_chrono
rm -rf "$OUT"
cclog /home/satoshi/workspace/polyrhythm/ipstation --out "$OUT" --rebuild >/dev/null

FILE="$OUT/CCLOG_ALL.md"
echo "=== first 5 pairs (date + session) ==="
paste <(grep -n "^# [0-9]" "$FILE" | head -5) <(grep -n "^Session: " "$FILE" | head -5)
echo
echo "=== last 5 pairs ==="
paste <(grep -n "^# [0-9]" "$FILE" | tail -5) <(grep -n "^Session: " "$FILE" | tail -5)
echo
echo "=== total pair blocks ==="
grep -c "^# [0-9]" "$FILE"
echo
echo "=== sessions interleaved? (10 random sample rows from beginning) ==="
grep -n "^Session: " "$FILE" | head -20 | awk '{print $1, substr($3, 1, 8)}'
echo
echo "=== chronology check (any out-of-order timestamps?) ==="
grep -E "^# [0-9]{4}/" "$FILE" | awk '
  {
    # Convert "# 2026/05/12 Tue 23:57:30" -> sortable "20260512235730"
    gsub(/[# \/:]/, "", $0)
    gsub(/Sun|Mon|Tue|Wed|Thu|Fri|Sat/, "", $0)
    gsub(/ /, "", $0)
    if (NR > 1 && $0 < prev) {
      bad++
    }
    prev = $0
  }
  END { print "out-of-order pairs:", bad+0 }
'
