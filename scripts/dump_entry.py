#!/usr/bin/env python3
import json
import sys


def main() -> None:
    for line in sys.stdin:
        try:
            e = json.loads(line)
        except Exception as ex:
            print(f"PARSE_ERR: {ex}")
            continue
        print(f"  type= {e.get('type')}")
        print(f"  uuid= {(e.get('uuid','') or '')[:8]}")
        print(f"  parentUuid= {(e.get('parentUuid','') or '')[:8]}")
        print(f"  isMeta= {e.get('isMeta')}")
        print(f"  isSidechain= {e.get('isSidechain')}")
        print(f"  timestamp= {e.get('timestamp')}")
        msg = e.get("message", {}) or {}
        content = msg.get("content")
        if isinstance(content, str):
            print(f"  content type=string length={len(content)}")
            head = content[:300].replace("\n", " | ")
            print(f"  content head: {head}")
        elif isinstance(content, list):
            print("  content blocks:")
            for i, b in enumerate(content):
                if not isinstance(b, dict):
                    print(f"    [{i}] (non-dict block)")
                    continue
                bt = b.get("type")
                if bt == "text":
                    t = b.get("text", "") or ""
                    print(f"    [{i}] text len={len(t)}: {t[:200]}")
                elif bt == "tool_result":
                    c = b.get("content", "")
                    if isinstance(c, str):
                        cs = c
                    else:
                        try:
                            cs = json.dumps(c)
                        except Exception:
                            cs = str(c)
                    tu = (b.get("tool_use_id") or "")[:8]
                    print(f"    [{i}] tool_result tool_use_id={tu} head: {cs[:200]}")
                elif bt == "tool_use":
                    print(f"    [{i}] tool_use name={b.get('name')}")
                else:
                    print(f"    [{i}] {bt}")


if __name__ == "__main__":
    main()
