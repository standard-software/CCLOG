#!/bin/bash
# Dump entry summaries for a range of lines in a JSONL.
F="${1:-}"
START="${2:-1}"
END="${3:-50}"
HERE="$(cd "$(dirname "$0")" && pwd)"

if [ -z "$F" ]; then echo "usage: $0 file [start] [end]"; exit 1; fi

echo "total lines in $F: $(wc -l < "$F")"
echo

for ((LN=START; LN<=END; LN++)); do
  L=$(sed -n "${LN}p" "$F")
  if [ -z "$L" ]; then continue; fi
  echo "--- Line $LN ---"
  printf '%s\n' "$L" | python3 "$HERE/dump_entry.py"
  echo
done
