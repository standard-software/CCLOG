# cclog

## Version

### 1.5.0-beta.3
#### 2026/07/06(Mon)
- add `%SessionName%` template placeholder: the human-readable session name Claude Code shows in its resume list
  - resolved from the log's `custom-title` (user-set) entry if present, otherwise the `ai-title` (auto-generated) entry, otherwise empty for sessions that predate the title feature
  - the last title entry wins (titles are re-emitted as they are refined); a user-set custom title always takes precedence over the AI one
  - opt-in: add `%SessionName%` to your template. The bundled templates and the built-in default are unchanged, so existing output is unaffected

### 1.5.0-beta.2
#### 2026/07/06(Mon)
- add `--backup-md` CLI flag: a standalone action (mirroring `--backup-jsonl`) that copies the already-exported Markdown (the aggregated file plus any per-session files in `<out>`) into `<out>/backup_CCLOG_md/<yyyy-mm-dd_hh-mm-ss>_<hostname>/` and exits without regenerating anything
  - same folder cclog auto-populates before a destructive rewrite, but triggered on demand — e.g. to snapshot the current output before editing the config or switching template
  - honors `--dry-run` (reports the destination) and `--verbose` (logs each copied file); old folders are pruned to the most recent 20 (shared with the automatic backups)

### 1.5.0-beta.1
#### 2026/07/06(Mon)
- add `outputAllFileName` and `outputSessionFilePrefix` config options in `cclog.config.json`
  - `outputAllFileName` (default `"CCLOG_ALL.md"`): filename for the aggregated Markdown output
  - `outputSessionFilePrefix` (default `"CCLOG_"`): prefix for per-session Markdown files (`--per-session`); the file name becomes `<prefix><sessionId>.md`. Empty string is allowed (no prefix)
  - the title inside the aggregated file (`# CCLOG_ALL`) is now derived from `outputAllFileName` (basename without `.md`); the default filename keeps the existing `# CCLOG_ALL` title unchanged
  - existing installs continue to write `CCLOG_ALL.md` / `CCLOG_<sessionId>.md` with no config changes

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
