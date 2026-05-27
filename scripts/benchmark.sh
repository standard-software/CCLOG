#!/bin/bash
# Benchmark cclog: default (incremental append) vs --rebuild.
# Runs are logged with wall time; the final invocation is --rebuild so the
# project's CCLOG/CCLOG_ALL.md is left in a fully-regenerated state.
#
# Usage: bash scripts/benchmark.sh [project-path]

set -e
PROJ="${1:-/home/satoshi/workspace/rimo/rimo-frontend}"
OUT="$PROJ/CCLOG"
TMPLOG=/tmp/cclog_bench_out.txt

run_timed() {
  local label="$1"
  shift
  local t1
  local t2
  local elapsed
  local pairs
  local jsonl_size
  t1=$(date +%s.%N)
  cclog "$@" > "$TMPLOG" 2>&1
  t2=$(date +%s.%N)
  elapsed=$(awk "BEGIN { printf \"%.3f\", $t2 - $t1 }")
  pairs=$(grep -oE 'Appended [0-9]+ pair' "$TMPLOG" | grep -oE '[0-9]+' || true)
  pairs=${pairs:-?}
  printf "  %-22s %7ss   appended=%s\n" "$label" "$elapsed" "$pairs"
}

echo "=== project: $PROJ ==="
echo "=== sessions in JSONL log dir ==="
LOG_DIR="$HOME/.claude/projects/$(echo "$PROJ" | sed 's|/|-|g; s|^|-|; s|--|-|; s|^-||')"
# fallback: try simpler encoding (replace / with -)
if [ ! -d "$LOG_DIR" ]; then
  LOG_DIR="$HOME/.claude/projects/$(echo "$PROJ" | sed 's|/|-|g; s|^-||')"
fi
echo "  log dir: $LOG_DIR"
if [ -d "$LOG_DIR" ]; then
  count=$(ls "$LOG_DIR"/*.jsonl 2>/dev/null | wc -l)
  total=$(du -ch "$LOG_DIR"/*.jsonl 2>/dev/null | tail -1 | awk '{print $1}')
  echo "  sessions: $count files, total size: $total"
fi

echo
echo "=== fresh start: rm -rf CCLOG dir ==="
rm -rf "$OUT"

echo
echo "=== Phase 1: cold-cache rebuild ==="
run_timed "cold-rebuild" "$PROJ" --rebuild

echo
echo "=== Phase 2: default (no option) when state already up-to-date ==="
run_timed "default-noop-1" "$PROJ"
run_timed "default-noop-2" "$PROJ"
run_timed "default-noop-3" "$PROJ"

echo
echo "=== Phase 3: warm-cache rebuild (FS cache loaded) ==="
run_timed "warm-rebuild-1" "$PROJ" --rebuild
run_timed "warm-rebuild-2" "$PROJ" --rebuild
run_timed "warm-rebuild-3" "$PROJ" --rebuild

echo
echo "=== Phase 4: final --rebuild (leave clean state) ==="
run_timed "final-rebuild" "$PROJ" --rebuild

echo
echo "=== output file info ==="
if [ -f "$OUT/CCLOG_ALL.md" ]; then
  ls -la "$OUT/CCLOG_ALL.md"
  echo "  lines: $(wc -l < "$OUT/CCLOG_ALL.md")"
fi
