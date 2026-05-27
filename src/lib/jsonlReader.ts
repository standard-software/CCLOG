import fs from 'node:fs/promises';
import type { LogEntry } from './types.js';

export interface ReadResult {
  entries: LogEntry[];
  skippedLines: number;
  fileSize: number;
}

export async function readJsonl(filePath: string): Promise<ReadResult> {
  const stat = await fs.stat(filePath);
  const data = await fs.readFile(filePath, 'utf-8');
  const lines = data.split('\n');
  const entries: LogEntry[] = [];
  let skipped = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as LogEntry);
    } catch {
      skipped++;
    }
  }
  return { entries, skippedLines: skipped, fileSize: stat.size };
}
