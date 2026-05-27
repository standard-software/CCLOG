# cclog

## Version

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
