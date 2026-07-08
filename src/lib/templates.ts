// Default pair-block template, built into the binary so cclog runs
// without any config file. Users override per-project via
// cclog.config.json's "template" field (relative paths resolve first
// against the cclog package dir, then the config file's directory).
//
// Placeholders (case-sensitive, surrounded by %):
//   %DateTime%   formatted timestamp ("2026/05/23 Sat 12:34:56")
//   %SessionId%  full session UUID (always populated, even in
//                --per-session mode where it duplicates the filename)
//   %SessionName% human-readable session name — the user's custom title if
//                set, otherwise Claude Code's auto-generated title, else
//                empty (older logs that predate the title feature)
//   %Question%   the user's text
//   %Progress%   bullet list of tool calls / intermediate assistant
//                turns, summarized (tool name + one key arg, result
//                head only, thinking omitted).
//   %ProgressFull%  same list, but with full tool input/output JSON and
//                thinking blocks included. Use this OR %Progress%, not
//                both.
//   %Answer%     the last assistant text block (already escaped so
//                "-->" sequences won't close the HTML comment early)
//
// Whether — and how verbosely — progress is rendered is decided purely
// by which placeholder the template contains: none -> no progress,
// %Progress% -> summarized, %ProgressFull% -> full dump. There is no CLI
// flag for this.
//
// The shipped templates/{english,japanese}{,-with-progress,-with-progress-full}.md
// are drop-in alternatives; the in-code default below matches
// templates/english.md and is the fallback when nothing else loads.

export const DEFAULT_TEMPLATE = `# %DateTime%   Session:%SessionName%:%SessionId%
## Question
%Question%
<!--
## Answer
%Answer%
-->

----------------------------------------

`;

export const PROGRESS_PLACEHOLDER = '%Progress%';
export const PROGRESS_FULL_PLACEHOLDER = '%ProgressFull%';

export type ProgressMode = 'none' | 'summary' | 'full';

/**
 * Decide how the progress section should be rendered from the template
 * alone. %ProgressFull% wins if both happen to be present.
 */
export function progressMode(tpl: string): ProgressMode {
  if (tpl.includes(PROGRESS_FULL_PLACEHOLDER)) return 'full';
  if (tpl.includes(PROGRESS_PLACEHOLDER)) return 'summary';
  return 'none';
}

export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  let out = tpl;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`%${k}%`, v);
  }
  return out;
}
