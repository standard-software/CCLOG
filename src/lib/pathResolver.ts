import fs from 'node:fs/promises';
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

/**
 * True when `child` is `base` itself or a path nested under it. Tolerant of
 * separator style (`\` vs `/`) and, on Windows, of case — the cwd stored in a
 * log and the path cclog is run from can differ in both. Used to confirm that
 * a subdirectory log-dir candidate really belongs under the project.
 */
export function isPathWithin(child: string, base: string): boolean {
  const norm = (s: string): string => {
    let r = s.replace(/\\/g, '/').replace(/\/+$/, '');
    if (process.platform === 'win32') r = r.toLowerCase();
    return r;
  };
  const c = norm(child);
  const b = norm(base);
  return c === b || c.startsWith(b + '/');
}

/**
 * List log-dir candidates for projects nested UNDER any of `projectPaths`.
 *
 * Claude Code stores each project at `~/.claude/projects/<encoded cwd>/`, and a
 * subdirectory's encoded name is always `<encoded parent>-<rest>` (the '/'
 * separator collapses to '-' like every other non-alphanumeric char). So every
 * nested project's folder name begins with `encodeCwd(project) + '-'`, and we
 * find them by that prefix. IMPORTANT: because the same encoding also turns a
 * literal '-' or '/' in a SIBLING path into '-', this prefix test also matches
 * siblings such as `<project>-backup`. Callers MUST confirm each returned
 * folder's real cwd (read from the log content) with `isPathWithin` before
 * treating it as a genuine subdirectory.
 *
 * Returns absolute directory paths, excluding the exact project folders
 * themselves (those are discovered separately).
 */
export async function findSubdirLogDirCandidates(projectPaths: string[]): Promise<string[]> {
  const projectsDir = getClaudeProjectsDir();
  const exact = new Set(projectPaths.map(p => encodeCwd(p)));
  const prefixes = projectPaths.map(p => encodeCwd(p) + '-');
  let names: string[];
  try {
    names = await fs.readdir(projectsDir);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const name of names) {
    if (exact.has(name)) continue;
    if (!prefixes.some(pre => name.startsWith(pre))) continue;
    const full = path.join(projectsDir, name);
    try {
      if ((await fs.stat(full)).isDirectory()) out.push(full);
    } catch {
      // vanished between readdir and stat — skip
    }
  }
  return out.sort();
}
