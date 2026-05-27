# cclog

**Language:** [Japanese/日本語](README_Japanese.md)

Export Claude Code session logs (JSONL) to a single readable Markdown file.

`cclog` reads the JSONL session logs that Claude Code writes under
`~/.claude/projects/<encoded project path>/` and renders them as `CCLOG_ALL.md`
(or one file per session) in your project. The output is regenerated
on every run, but the file is only modified when its content would
actually change — and when the new content is a strict append, only
the tail is appended so editors don't reload from the top.

## Install

```bash
npm install -g @standard-software/cclog
```

The package is published on npm as
[`@standard-software/cclog`](https://www.npmjs.com/package/@standard-software/cclog).
The installed CLI command is just `cclog`.

## Usage

Run it inside any project directory that you've used with Claude Code:

```bash
cd /path/to/your/project
cclog
```

This writes `CCLOG/CCLOG_ALL.md` with every Q&A pair from every session
for that project, sorted chronologically.

### Options

```
cclog [project-path] [options]

Arguments:
  project-path           Project directory (defaults to the current directory).

Options:
  --out <dir>            Output directory (default: <project-path>/CCLOG).
  --per-session          Write one file per session (CCLOG_<sessionId>.md)
                         instead of the aggregated CCLOG_ALL.md.
  --include-tools        Dump tool input/output as full JSON (requires a
                         template that contains %Progress%).
  --init-template        Copy the bundled template into <out>/templates/ and
                         rewrite cclog.config.json to use the local copy
                         (lets you edit it without touching the global install).
  --dry-run              Don't write files; report what would be written.
  -v, --verbose          Verbose logging.
  -h, --help             Show this help.
```

## Configuration

Drop a `cclog.config.json` in the output directory (`<project>/CCLOG/cclog.config.json`)
to customize behavior:

```json
{
  "extraCwds": [
    "C:\\Users\\you\\projects\\another-project",
    "/home/you/projects/another-project"
  ],
  "extraLogDirs": [],
  "recursive": false,
  "includeSidechain": false,
  "template": "templates/japanese.md"
}
```

Use backslash-escaped paths on Windows (`C:\\Users\\...`) and forward-slash
paths on Ubuntu/macOS (`/home/you/...`).

| Field              | Description                                                                 |
|--------------------|-----------------------------------------------------------------------------|
| `extraCwds`        | Additional project directories whose logs should be merged into the output. |
| `extraLogDirs`     | Additional raw `~/.claude/projects/...` directories to read verbatim.       |
| `recursive`        | If `true`, descend into subdirectories of each log dir (e.g. subagent logs).|
| `includeSidechain` | If `true`, include subagent / sidechain pairs in the output.                |
| `template`         | Path to a Markdown template. Resolved against cclog's own `templates/` dir first, then your CCLOG dir. |

### Templates

Four templates ship out of the box:

- `templates/english.md` (default)
- `templates/japanese.md`
- `templates/english-with-progress.md`
- `templates/japanese-with-progress.md`

A template can use the following placeholders:

| Placeholder    | Replaced with                              |
|----------------|--------------------------------------------|
| `%DateTime%`   | Question timestamp (`YYYY/MM/DD Day HH:MM:SS`) |
| `%SessionId%`  | The session UUID                           |
| `%Question%`   | The user's message                         |
| `%Answer%`     | Claude's reply                             |
| `%Progress%`   | (optional) Tool calls between Q and A      |

If your template contains `%Progress%`, the section is rendered;
otherwise tool calls are omitted.

#### Customizing a template

To edit a template without touching the globally-installed cclog files,
run:

```bash
cclog --init-template
```

This copies the template currently set in `cclog.config.json` (or the
English default if no config exists) into `CCLOG/templates/` and rewrites
the config to point at the local copy:

```diff
- "template": "templates/japanese.md"
+ "template": "CCLOG/templates/japanese.md"
```

After that, edit `CCLOG/templates/japanese.md` directly. Re-running
`--init-template` when the destination already exists prints an error
and does not overwrite, but still re-applies the config rewrite.

## Output format

`CCLOG_ALL.md` is a flat chronological sequence of Q&A blocks. Each
block is rendered from the template. By default (English template):

```markdown
# 2026/05/27 Wed 11:03:49

Session: ec5e9974-80a6-4baa-a701-0e29589674da

## Question

Hello, can you help me with X?

## Answer
<!--
Sure, here's how...
-->

----------------------------------------
```

The `<!-- -->` around the answer is mainly there because Claude's reply
often contains its own Markdown formatting (headings, lists, code blocks)
that would otherwise collide with the template's Markdown structure;
wrapping it as a comment keeps the surrounding template intact. As a side
effect, Markdown viewers also collapse the answer so long replies don't
dominate the preview. Remove it from your template if you'd rather see
answers expanded by default.

## Notes

- The output is fully regenerated on every run; if you delete a session
  log under `~/.claude/projects/...`, the corresponding pairs disappear
  from `CCLOG_ALL.md` on the next run.

## License

MIT
