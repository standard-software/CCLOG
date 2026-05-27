#!/usr/bin/env python3
"""Dump a specific line of a JSONL as pretty-printed JSON."""
import json
import sys


def main() -> None:
    path = sys.argv[1]
    line_no = int(sys.argv[2])
    with open(path, encoding="utf-8") as fh:
        for i, line in enumerate(fh, start=1):
            if i == line_no:
                try:
                    obj = json.loads(line)
                    print(json.dumps(obj, indent=2, ensure_ascii=False))
                except Exception as ex:
                    print(f"parse error: {ex}", file=sys.stderr)
                    print(line)
                return
    print(f"line {line_no} not found", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
