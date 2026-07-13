import os from 'node:os';
import path from 'node:path';

// Mirror Claude Code's project-directory encoding: EVERY character outside
// [a-zA-Z0-9] becomes '-' — not just path separators. '_' '.' spaces and
// non-ASCII all collapse to '-' (e.g. "C:\Work\2026-06-23_Malme_Hajimari"
// -> "C--Work-2026-06-23-Malme-Hajimari"). Replacing only \ / : made cclog
// look for a folder that doesn't exist whenever the path contained any
// other symbol, and discovery returned zero sessions.
export function encodeCwd(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-');
}

export function getClaudeProjectsDir(): string {
  return path.join(os.homedir(), '.claude', 'projects');
}

export function getLogDirForProject(cwd: string): string {
  return path.join(getClaudeProjectsDir(), encodeCwd(cwd));
}
