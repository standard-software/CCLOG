// Default pair-block template, built into the binary so cclog runs
// without any config file. Users override per-project via
// cclog.config.json's "template" field (relative paths resolve first
// against the cclog package dir, then the config file's directory).
//
// Placeholders (case-sensitive, surrounded by %):
//   %DateTime%   formatted timestamp ("2026/05/23 Sat 12:34:56")
//   %SessionId%  full session UUID (always populated, even in
//                --per-session mode where it duplicates the filename)
//   %Question%   the user's text
//   %Progress%   bullet list of tool calls / intermediate assistant
//                turns. Whether progress is rendered at all is decided
//                by whether the template contains this placeholder —
//                no extra CLI flag needed.
//   %Answer%     the last assistant text block (already escaped so
//                "-->" sequences won't close the HTML comment early)
//
// The shipped templates/{english,japanese}{,-with-progress}.md are
// drop-in alternatives; the in-code default below matches
// templates/english.md and is the fallback when nothing else loads.

export const DEFAULT_TEMPLATE = `# %DateTime%

Session: %SessionId%

## Question

%Question%

## Answer
<!--
%Answer%
-->

----------------------------------------

`;

export const PROGRESS_PLACEHOLDER = '%Progress%';

export function templateUsesProgress(tpl: string): boolean {
  return tpl.includes(PROGRESS_PLACEHOLDER);
}

export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  let out = tpl;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`%${k}%`, v);
  }
  return out;
}
