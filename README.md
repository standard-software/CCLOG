# cclog

**Language:** [Japanese/日本語](README_Japanese.md)

> ### 📦 cclog is moving to `ccxlog` — please migrate
>
> **[`@standard-software/ccxlog`](https://www.npmjs.com/package/@standard-software/ccxlog)** is the successor to cclog. Where **cclog handles Claude Code logs only**, **ccxlog exports both Claude Code and Codex CLI logs** from a single command — and can merge them into one timeline.
>
> - `ccxlog -cc` (Claude Code only) is (near-)equivalent to `cclog`.
> - `ccxlog -cx` handles Codex; the default merges both.
>
> Active development continues on **ccxlog**, so please switch over from cclog:
>
> ```bash
> npm install -g @standard-software/ccxlog
> ```

Export Claude Code session logs (JSONL) to a single readable Markdown file.

`cclog` reads the JSONL session logs that Claude Code writes under
`~/.claude/projects/<encoded project path>/` and renders them as `cclog.md`
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

This writes `CCLOG/cclog.md` with every Q&A pair from every session
for that project, sorted chronologically.

### Options

```
cclog [project-path] [options]

Arguments:
  project-path           Project directory (defaults to the current directory).

Options:
  --out <dir>            Output directory (default: <project-path>/CCLOG).
  --per-session          Write one file per session (cclog_<sessionId>.md)
                         instead of the aggregated cclog.md.
  --init-template        Copy the bundled template into <out>/templates/ and
                         rewrite cclog.config.json to use the local copy
                         (lets you edit it without touching the global install).
  --backup-jsonl         Back up only: copy the discovered source .jsonl logs
                         into <out>/backup_jsonl/<yyyy-mm-dd_hh-mm-ss>_<hostname>/
                         and exit WITHOUT writing cclog.md / per-session
                         files (preserves the raw logs locally — e.g. before
                         swapping PCs, since the source log location is derived
                         from the machine-specific project path). The folder
                         name embeds the machine name (os.hostname()) so
                         backups stay attributable per PC.
  --backup-md            Back up only: copy the already-exported Markdown (the
                         aggregated file and any per-session files in <out>)
                         into <out>/backup_CCLOG_md/<yyyy-mm-dd_hh-mm-ss>_<host>/
                         and exit WITHOUT regenerating anything. On-demand
                         trigger of the same backup cclog makes automatically
                         before a destructive rewrite (e.g. to snapshot the
                         current output before editing the config or template).
  --dry-run              Don't write files; report what would be written.
  --verbose              Verbose logging.
  -v, -V, --version      Show version and exit.
  -h, --help             Show this help.
```

### Backing up the raw JSONL logs

The source logs Claude Code writes under `~/.claude/projects/` live in a
folder whose name is derived from the project's absolute path. Move to a
different machine (or a different path) and that folder name changes, so
`cclog` no longer sees the old sessions. To keep a local copy of the raw
logs before that happens:

```bash
cclog --backup-jsonl
```

This copies every discovered `.jsonl` into
`CCLOG/backup_jsonl/<yyyy-mm-dd_hh-mm-ss>_<hostname>/` (a new timestamped
folder per run, with the machine name from `os.hostname()` appended so
backups stay attributable per PC). `--backup-jsonl` is a **standalone
action**: it backs up only and exits, so it does **not** (re)write
`cclog.md` or the per-session files — run `cclog` without the flag for
that. Each backup keeps the session's original `<uuid>.jsonl` filename, so
the files can be re-used later. Combine with
`--dry-run` to preview the destination without copying, or `--verbose` to
see each copied file. The `CCLOG/` output directory (and thus
`backup_jsonl/`) is typically git-ignored, so backups won't pollute your
repository.

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
  "includeSubdirectories": true,
  "outputAllFileName": "cclog.md",
  "outputSessionFilePrefix": "cclog_",
  "template": "templates/japanese.md"
}
```

Use backslash-escaped paths on Windows (`C:\\Users\\...`) and forward-slash
paths on Ubuntu/macOS (`/home/you/...`).

| Field                     | Description                                                                 |
|---------------------------|-----------------------------------------------------------------------------|
| `extraCwds`               | Additional project directories whose logs should be merged into the output. |
| `extraLogDirs`            | Additional raw `~/.claude/projects/...` directories to read verbatim.       |
| `recursive`               | If `true`, descend into subdirectories of each log dir (e.g. subagent logs).|
| `includeSidechain`        | If `true`, include subagent / sidechain pairs in the output.                |
| `includeSubdirectories`   | If `true` (default), also collect logs from projects whose cwd is a *subdirectory* of the project cclog runs in (e.g. running in `~/work/app` also gathers `~/work/app/frontend`). Nested candidates are verified against each session's real cwd, so same-prefix siblings like `~/work/app-backup` are never included. Set `false` to match only the exact project path (plus `extraCwds` / `extraLogDirs`). |
| `outputAllFileName`       | Filename for the aggregated output. Default `cclog.md`. The title inside the file is derived from the basename (e.g. setting `mylog.md` also changes the header to `# mylog`). |
| `outputSessionFilePrefix` | Prefix for per-session filenames (used with `--per-session`). Default `cclog_`, so files are `cclog_<sessionId>.md`. Empty string means no prefix. |
| `template`                | Path to a Markdown template. Resolved against cclog's own `templates/` dir first, then your CCLOG dir. |

To keep the pre-1.6.0 output names (`CCLOG_ALL.md` and `CCLOG_<sessionId>.md`),
set:

```json
{
  "outputAllFileName": "CCLOG_ALL.md",
  "outputSessionFilePrefix": "CCLOG_"
}
```

### Templates

Six templates ship out of the box:

- `templates/english.md` (default)
- `templates/japanese.md`
- `templates/english-with-progress.md`
- `templates/japanese-with-progress.md`
- `templates/english-with-progress-full.md`
- `templates/japanese-with-progress-full.md`

A template can use the following placeholders:

| Placeholder       | Replaced with                                            |
|-------------------|----------------------------------------------------------|
| `%DateTime%`      | Question timestamp (`YYYY/MM/DD Day HH:MM:SS`)            |
| `%SessionId%`     | The session UUID                                          |
| `%SessionName%`   | Human-readable session name — the custom title if set, else Claude Code's auto-generated title, else empty |
| `%Question%`      | The user's message                                       |
| `%Answer%`        | Claude's reply                                            |
| `%Progress%`      | (optional) Tool calls between Q and A, **summarized**     |
| `%ProgressFull%`  | (optional) Same, but full tool input/output JSON + thinking |
| `%Model%`         | Model that produced the answer (`claude-opus-4-8`); synthetic entries are skipped |
| `%Version%`       | Claude Code version the pair ran under (`2.1.205`)       |
| `%GitBranch%`     | Git branch at the time of the question                    |
| `%Cwd%`           | Working directory at the time of the question             |
| `%Tokens%`        | Token usage summed over the pair's assistant turns (`in 6, out 33, cache read 21,758, cache write 8,730`) |

Whether — and how verbosely — the progress section is rendered is decided
entirely by the template:

- contains neither → tool calls are omitted;
- contains `%Progress%` → summarized (tool name + key arg, result head only);
- contains `%ProgressFull%` → full input/output JSON and thinking blocks.

Use one of the two progress placeholders, not both. (There is no CLI flag
for this — verbosity follows the template.)

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

> **⚠️ Keep the first line starting with `# %DateTime%`.**
> The automatic pre-overwrite backup (see Notes below) identifies each
> Q&A block solely by the `# YYYY/MM/DD Day HH:MM:SS` prefix of its
> header line — everything after the timestamp on that line is ignored.
> The question timestamp never changes for a given pair, so template
> changes (even to the rest of the header line) and session renames
> never trigger a backup; a rewrite backs up the old file only when one
> of those timestamps would *disappear*, i.e. when a pair is actually
> being lost. If your custom template doesn't render a line starting
> with `# %DateTime%`, no block has an identity anymore and the
> detector goes blind: **the backup will never fire again**, even when
> sessions genuinely vanish from the output (e.g. their `.jsonl` was
> deleted). All six bundled templates keep this form — if you customize,
> change anything you like after the `%DateTime%` (same line or below),
> but start the block with `# %DateTime%`.

## Output format

`cclog.md` is a flat chronological sequence of Q&A blocks. Each
block is rendered from the template. By default (English template):

```markdown
# 2026/05/27 Wed 11:03:49   Session:My first session:ec5e9974-80a6-4baa-a701-0e29589674da
Model=claude-opus-4-7 Version=2.1.152
Branch=main Cwd=C:\Users\satoshi\projects\my-app
Tokens=in 6, out 33, cache read 21,758, cache write 8,730
## Question
Hello, can you help me with X?

<!--
## Answer
Sure, here's how...
-->

----------------------------------------
```

The session name between the two colons comes from `%SessionName%` — the
custom title if you set one in Claude Code, otherwise the auto-generated
title, otherwise empty (`Session::<uuid>`).

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
  from `cclog.md` on the next run.
- **Pre-overwrite backup of the Markdown.** When a run would rewrite an
  existing output `.md` *destructively* — at least one Q&A block present
  in the old file is missing from the new content (its
  `# YYYY/MM/DD Day HH:MM:SS` timestamp prefix no longer appears on any
  header line; e.g. a session's `.jsonl` was deleted, or you ran cclog
  on a different PC that doesn't see some sessions) —
  the existing file is first copied to
  `CCLOG/backup_CCLOG_md/<yyyy-mm-dd_hh-mm-ss>_<hostname>/` so the
  previous version is never lost. Backup folders accumulate and are never
  pruned. A plain append (the normal case), an unchanged run, a
  first-time create, or a rewrite that keeps every block (e.g. a template
  change below the header line) never produces a backup, so these folders
  only appear when content actually disappeared. This detection relies on
  the template's header line — see the warning in *Customizing a
  template*.
  One accepted edge case: two pairs stamped in the same second share one
  identity. The two coexisting is harmless — both are exported and no
  spurious backup fires. The only theoretical miss is when one of the
  same-second twins vanishes while the other survives: the survivor still
  holds that timestamp, so the loss goes undetected and no backup is
  taken. Second-level collisions where exactly one twin disappears are
  rare enough that this is accepted in exchange for predictable backups.

## License

MIT
