# cclog

## Version

### 1.9.0
#### 2026/07/21(Tue)
- add the `includeSubdirectories` config option (default `true`): running cclog in a project directory now also collects logs from projects whose cwd is a *subdirectory* of it — e.g. running in `~/work/app` also picks up `~/work/app/frontend` and any deeper nested project. Candidates are found by the encoded log-folder-name prefix and then confirmed against each session's real `cwd`, so same-prefix siblings (e.g. `~/work/app-backup`) are never pulled in. Set to `false` to match only the exact project path (plus `extraCwds` / `extraLogDirs`), as before.
- aggregate output (`cclog.md`) now de-duplicates pairs copied by a resumed or forked session. Claude Code writes the earlier history verbatim into the new session file, so the same turn would otherwise appear once per session file. A pair is dropped when any of its message uuids (question, steering follow-ups, or answer) was already emitted by an earlier pair — the answer's uuid is checked too, since a session-specific extra message can regroup the same shared turn so the question side looks different while the answer is the very same message. Matching is by uuid, so it is lossless (a uuid is unique per message; a hit is always a fork copy, never two distinct turns). Always on. `--per-session` output is intentionally left un-deduplicated so each session file stays a complete transcript.
- remove the `recoverSlashCommandBody` config option: recovering slash-command questions that Claude Code truncated in the log is now always on. The substitution only ever replaced a stored body that is a strict, shorter prefix of the command file's own text, so a complete body is never altered — there was nothing to opt out of. A `recoverSlashCommandBody` key in `cclog.config.json` is now silently ignored.
- fix: template rendering is now a single pass, so a literal placeholder token (e.g. `%SessionName%`) that appears inside the question or answer text is no longer re-substituted after it lands in the output.

### 1.8.1
#### 2026/07/15(Wed)
- bundled templates: add a blank line between `%Question%` and the `<!--` that opens the folded Answer block. Without it, VS Code's Markdown renderer can mis-parse the comment start when it directly follows the question text.

### 1.8.0
#### 2026/07/14(Tue)
- add per-pair metadata placeholders pulled from the JSONL: `%Model%` (model that produced the answer, synthetic entries skipped), `%Version%` (Claude Code version), `%GitBranch%`, `%Cwd%`, `%Tokens%` (usage summed over the pair's assistant turns). Bundled templates now show a 3-line metadata block right under the pair header.
- fix: log discovery failed (`No session logs found`) for any project whose path contains `_`, `.`, spaces, etc. — Claude Code encodes EVERY non-alphanumeric character as `-`, but `encodeCwd()` only replaced `\` `/` `:`. Now mirrors Claude Code's rule exactly.
- destructive-rewrite detection keys each block on the `# YYYY/MM/DD Day HH:MM:SS` timestamp prefix only — everything after it on the header line is ignored. Template changes and session renames no longer fire pointless backups; a backup now means pairs actually disappeared. (Known edge: same-second pairs share an identity — see README.)

### 1.7.0
#### 2026/07/11(Sat)
- **breaking**: `backup_CCLOG_md/` folders are no longer pruned. Previously the directory was capped at the 20 most recent folders; older ones were deleted after each backup. But each destructive rewrite (e.g. a session whose jsonl was aged out by Claude Code) drops that session's only surviving snapshot into a single backup folder — so pruning could silently discard the last remaining copy of old history. Backups now accumulate without bound; they are the durable archive.

### 1.6.0
#### 2026/07/10(Fri)
- **breaking**: default output filenames changed — aggregated `CCLOG_ALL.md` → `cclog.md`, per-session prefix `CCLOG_` → `cclog_`. Set `outputAllFileName` / `outputSessionFilePrefix` in `cclog.config.json` to restore the old names (see README).
- redesign bundled templates: single-line header `# %DateTime%   Session:%SessionName%:%SessionId%`, Question visible, Answer (and Progress) folded inside the HTML comment.
- recover slash-command questions truncated in the log: the full body is restored from the Read `tool_result` of the command's own `commands/<name>.md` (prefix-checked, so complete bodies are never altered). Config `recoverSlashCommandBody` (default `true`) disables it.

### 1.5.0
#### 2026/07/06(Mon)
- add `outputAllFileName` / `outputSessionFilePrefix` config options to rename the output (default `CCLOG_ALL.md` / `CCLOG_` prefix; the aggregate file's title follows its basename). Defaults keep existing output unchanged.
- add `--backup-md`: on-demand copy of the exported Markdown into `backup_CCLOG_md/` (same as the automatic pre-rewrite backup), mirroring `--backup-jsonl`.
- add `%SessionName%` template placeholder: the session name from the log's `custom-title` (else `ai-title`, else empty). Opt-in via template.

### 1.4.0
#### 2026/07/02(Thu)
- `backup_CCLOG_md/` no longer fires on every run — only when a rewrite is actually **destructive** (an existing pair identity has vanished from the new body). Streaming completion of the last pair and backdated middle-inserts both preserve every old identity, so they now rewrite without backing up.
  - previous behavior: any non-append rewrite triggered a backup. In aggregate mode (`CCLOG_ALL.md`) where an active session's newest pair often lands mid-sequence (or where the last captured pair grows on the next run), this fired on nearly every run and accumulated indefinitely.
  - identity per block = the `# %DateTime%` line + the `Session: %SessionId%` line. Stable across streaming completion; only differs when a pair genuinely disappears (PC swap that dropped some sessions, deleted jsonl, etc.).
  - trade-off: swapping between the bundled templates (english ↔ japanese ↔ with-progress variants) no longer backs up either, since those two identity lines are identical across bundled templates. Custom templates that change the `# %DateTime%` or `Session:` line format still trigger backup.
- backup folder retention: `backup_CCLOG_md/` is capped at 20 most recent folders; older ones are pruned automatically after each backup so the directory stays bounded.
- fix: `%Question%` and `%Progress%` / `%ProgressFull%` now get the same HTML-comment token defanging that `%Answer%` already had. If a custom template wraps `%Question%` (or `%Progress%`) inside an HTML comment for fold-in-preview, a question that literally contains `-->` (e.g. paste of HTML-comment discussion) no longer closes the comment early and breaks the block.
  - both tokens are defanged: `-->` → `-- >` and `<!--` → `<! --`. The `<!--` side isn't strictly required for correctness (HTML comments don't nest so a nested `<!--` is inert), but defanging it too gives a consistent visual cue that the pair went through sanitization — otherwise a run with raw `<!--` and defanged `-- >` mixed together looks suspicious to a reader.
- destructive-rewrite detector: only blocks whose first line matches the `# YYYY/MM/DD ` timestamp header pattern count as pair identities. Phantom blocks (created when a Q/A body embeds the 40-hyphen SEP line and the splitter over-splits there) are now ignored on both sides — otherwise unrelated content changes (e.g. the new `<!--` / `-->` defanging) would shift the phantom block's body-derived "identity" and spuriously fire the backup.

### 1.3.0
#### 2026/06/09(Tue)
- automatically back up `CCLOG_ALL.md` / `CCLOG_<sessionId>.md` before a **full rewrite** overwrites it
  - the existing file is copied to `<out>/backup_CCLOG_md/<yyyy-mm-dd_hh-mm-ss>_<hostname>/` immediately before the overwrite, so a large non-append change never silently discards the previous Markdown
  - triggers only on the `rewrite` path — i.e. when the regenerated body differs from the existing one somewhere other than a pure tail append. Typical causes: running cclog on a different PC where the synced `.md` no longer matches the local `.jsonl`, or changing the template
  - `create` / `noop` / `append` never back up; the timestamped folder is shared per run and created lazily, so unchanged runs leave no trace

### 1.2.2
#### 2026/06/08(Mon)
- `--backup-jsonl` is now a standalone action: it copies the raw source `.jsonl` logs and exits **without** regenerating `CCLOG_ALL.md` / per-session Markdown
  - rationale: backing up and exporting are separate concerns; the flag is for preserving the raw logs (e.g. before a PC swap), so it no longer also rewrites the Markdown output

### 1.2.1
#### 2026/06/08(Mon)
- `--backup-jsonl` backup folders now embed the machine name: the folder is named `<yyyy-mm-dd_hh-mm-ss>_<hostname>` (via `os.hostname()`, sanitized to a safe path segment) instead of timestamp only, so backups stay attributable to the PC they came from when consolidating logs across machines
  - falls back to `unknown-host` if the hostname is unavailable

### 1.2.0
#### 2026/06/08(Mon)
- **breaking**: removed the `--include-tools` CLI flag. Progress verbosity is now driven entirely by the template, matching how the progress section's presence already worked:
  - `%Progress%` → summarized tool calls (the old default progress output)
  - `%ProgressFull%` → full tool input/output JSON + thinking blocks (the old `--include-tools` output)
  - rationale: it was inconsistent to toggle the progress section via the template but its verbosity via a CLI flag
- add templates `english-with-progress-full.md` / `japanese-with-progress-full.md` (use `%ProgressFull%`)
- add `--backup-jsonl` CLI flag: copies the discovered source `.jsonl` logs into `<out>/backup_jsonl/<yyyy-mm-dd_hh-mm-ss>/` before exporting, then proceeds with the normal Markdown export
  - rationale: the source log location is derived from the (machine-specific) project path encoding, so swapping PCs changes which logs `cclog` sees; this flag preserves the raw session logs locally before that happens
  - backup file names come from the session id, so a plain top-level session keeps its original `<uuid>.jsonl` name; collisions across multiple log dirs are disambiguated with a `__2`, `__3`, … suffix
  - honors `--dry-run` (reports the would-be destination) and `--verbose` (logs each copied file)

### 1.1.2
#### 2026/05/29(Fri)
- fix: answer slot was empty when the assistant chain ended on a non-text block (e.g. session interrupted mid `tool_use`); the most recent text-containing assistant response is now used as the answer instead
  - root cause: `finalAssistantEntry` always took the very last assistant entry in the chain, including thinking-only / tool_use-only ones whose text content is empty

### 1.1.1
#### 2026/05/28(Thu)
- `-v` now prints version (matching `node -v` / `npm -v` convention)
- verbose mode is `--verbose` long form only (no short alias)

### 1.1.0
#### 2026/05/28(Thu)
- add `--version` / `-V` to print version and exit (`-v` remains `--verbose`)

### 1.0.0
#### 2026/05/27(Wed)
- initial release
- export Claude Code session logs (JSONL) to Markdown
  - aggregated `CCLOG_ALL.md` (default)
  - per-session files with `--per-session`
- templates
  - `english.md` (default) / `japanese.md`
  - `english-with-progress.md` / `japanese-with-progress.md`
  - placeholders: `%DateTime%` / `%SessionId%` / `%Question%` / `%Answer%` / `%Progress%`
- configuration via `CCLOG/cclog.config.json`
  - `extraCwds` / `extraLogDirs` to merge logs from other project directories
  - `recursive` to descend into subagent log subdirectories
  - `includeSidechain` to include subagent / sidechain pairs
  - `template` to choose or point at a custom template
- junction / symlink support (resolves real path and merges logs from both encodings)
- smart write
  - no-op when output is unchanged
  - append-only when new content is a strict tail extension
  - full overwrite otherwise
- tool call rendering
  - one-line summaries by default
  - full input/output JSON with `--include-tools` (requires a template containing `%Progress%`)
- `--init-template` to copy the bundled template into the project and rewrite the config to use the local copy
