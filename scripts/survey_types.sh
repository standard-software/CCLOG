#!/bin/bash
# Tally all distinct entry types across every session JSONL in
# ~/.claude/projects/ (both Windows-side and WSL-side). Helps spot
# anything cclog might still be silently skipping.
ROOTS=(
  "/mnt/c/Users/satoshi/.claude/projects"
  "/home/satoshi/.claude/projects"
)
python3 - "${ROOTS[@]}" <<'PY'
import json, os, sys
from collections import Counter
counts = Counter()
ucontent = Counter()  # for type=user, sub-tally by content kind
attach = Counter()    # for type=attachment, sub-tally by attachment.type
for root in sys.argv[1:]:
    if not os.path.isdir(root):
        continue
    for dirpath, _, files in os.walk(root):
        for fname in files:
            if not fname.endswith('.jsonl'):
                continue
            path = os.path.join(dirpath, fname)
            try:
                with open(path, encoding='utf-8', errors='replace') as fh:
                    for line in fh:
                        try:
                            e = json.loads(line)
                        except Exception:
                            counts['<parse-error>'] += 1
                            continue
                        t = e.get('type', '<no-type>')
                        counts[t] += 1
                        if t == 'user':
                            msg = e.get('message') or {}
                            c = msg.get('content')
                            if isinstance(c, str):
                                ucontent['user/string'] += 1
                            elif isinstance(c, list):
                                kinds = sorted({b.get('type') for b in c if isinstance(b, dict)})
                                ucontent[f"user/list[{','.join(kinds) or '?'}]"] += 1
                            else:
                                ucontent['user/?'] += 1
                        elif t == 'attachment':
                            att = e.get('attachment') or {}
                            attach[att.get('type', '<no-att-type>')] += 1
            except Exception:
                pass

print('=== Entry types across all projects ===')
for k, n in counts.most_common():
    print(f'  {n:>7}  {k}')
print()
print('=== user content sub-types ===')
for k, n in ucontent.most_common():
    print(f'  {n:>7}  {k}')
print()
print('=== attachment.type sub-types ===')
for k, n in attach.most_common():
    print(f'  {n:>7}  {k}')
PY
