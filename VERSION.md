# cclog

## Version

### 1.2.0-beta.0
#### 2026/06/08(Mon)
- **breaking**: removed the `--include-tools` CLI flag. Progress verbosity is now driven entirely by the template, matching how the progress section's presence already worked:
  - `%Progress%` → summarized tool calls (the old default progress output)
  - `%ProgressFull%` → full tool input/output JSON + thinking blocks (the old `--include-tools` output)
  - rationale: it was inconsistent to toggle the progress section via the template but its verbosity via a CLI flag
- add templates `english-with-progress-full.md` / `japanese-with-progress-full.md` (use `%ProgressFull%`)

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
