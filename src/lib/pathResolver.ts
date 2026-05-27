import os from 'node:os';
import path from 'node:path';

export function encodeCwd(cwd: string): string {
  return cwd.replaceAll('\\', '-').replaceAll('/', '-').replaceAll(':', '-');
}

export function getClaudeProjectsDir(): string {
  return path.join(os.homedir(), '.claude', 'projects');
}

export function getLogDirForProject(cwd: string): string {
  return path.join(getClaudeProjectsDir(), encodeCwd(cwd));
}
