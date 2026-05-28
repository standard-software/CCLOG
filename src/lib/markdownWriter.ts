import fs from 'node:fs/promises';
import {
  formatUserText,
  extractLastAssistantText,
  extractNonFinalAssistantTexts,
  extractToolUses,
  extractToolResults,
  formatToolUseSummary,
  formatToolResultSummary,
  toBlocks,
} from './contentFormatter.js';
import { DEFAULT_TEMPLATE, renderTemplate, templateUsesProgress } from './templates.js';
import type { Pair, UserEntry, AssistantEntry, ContentBlock } from './types.js';

const SEP = '----------------------------------------';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad2(n: number): string { return n < 10 ? '0' + n : '' + n; }

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const wd = WEEKDAYS[d.getDay()];
  const hh = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return `${yyyy}/${mm}/${dd} ${wd} ${hh}:${mi}:${ss}`;
}

export interface FormatOptions {
  includeTools: boolean;
  /**
   * Pair-block template. Whether the progress section is rendered is
   * determined by whether this string contains the %Progress%
   * placeholder — no separate flag.
   */
  template?: string;
}

export function formatPair(pair: Pair, opts: FormatOptions, sessionId?: string): string {
  const tpl = opts.template ?? DEFAULT_TEMPLATE;
  const wantProgress = templateUsesProgress(tpl);

  const ts = formatTimestamp(pair.questionEntry.timestamp);

  const qParts: string[] = [];
  qParts.push(formatUserText(pair.questionEntry.message.content));
  for (const extra of pair.additionalQuestionEntries) {
    const t = formatUserText(extra.message.content);
    if (t) qParts.push(t);
  }
  const questionText = qParts.filter(Boolean).join('\n\n');

  const progressLines: string[] = [];
  if (wantProgress) {
    for (const entry of pair.progressEntries) {
      progressLines.push(...progressLinesFor(entry, opts));
    }
    if (pair.finalAssistantEntry) {
      const fa = pair.finalAssistantEntry;
      for (const t of extractNonFinalAssistantTexts(fa.message.content)) {
        const line = oneLine(t);
        if (line) progressLines.push(`- (assistant) ${line}`);
      }
      for (const tu of extractToolUses(fa.message.content)) {
        progressLines.push(`- ${formatToolUseSummary(tu, opts.includeTools)}`);
      }
    }
  }

  let answerText = '';
  if (pair.finalAssistantEntry) {
    answerText = extractLastAssistantText(pair.finalAssistantEntry.message.content) ?? '';
  }
  // The chain may end with a non-text assistant block (tool_use or
  // thinking only) — e.g. the session was interrupted mid tool call.
  // Fall back to the most recent assistant entry in progressEntries
  // that actually had a text response so the answer slot isn't empty.
  if (!answerText) {
    for (let i = pair.progressEntries.length - 1; i >= 0; i--) {
      const entry = pair.progressEntries[i];
      if (entry.type !== 'assistant') continue;
      const t = extractLastAssistantText(entry.message.content);
      if (t) {
        answerText = t;
        break;
      }
    }
  }
  const safeAnswer = answerText.replaceAll('-->', '-- >');

  return renderTemplate(tpl, {
    DateTime: ts,
    SessionId: sessionId ?? '',
    Question: questionText,
    Progress: progressLines.join('\n'),
    Answer: safeAnswer,
  });
}

function progressLinesFor(entry: UserEntry | AssistantEntry, opts: FormatOptions): string[] {
  const lines: string[] = [];
  const content = entry.message?.content;
  if (content === undefined || content === null) return lines;

  if (entry.type === 'user') {
    for (const tr of extractToolResults(content)) {
      lines.push(`- ${formatToolResultSummary(tr, opts.includeTools)}`);
    }
    return lines;
  }

  // Assistant (demoted-to-progress): emit text, tool_use, tool_result, etc.
  const blocks: ContentBlock[] = toBlocks(content);
  for (const b of blocks) {
    if (b.type === 'text' && typeof (b as { text?: unknown }).text === 'string') {
      const line = oneLine((b as { text: string }).text);
      if (line) lines.push(`- (assistant) ${line}`);
    } else if (b.type === 'tool_use') {
      lines.push(`- ${formatToolUseSummary(b, opts.includeTools)}`);
    } else if (b.type === 'tool_result') {
      lines.push(`- ${formatToolResultSummary(b, opts.includeTools)}`);
    } else if (b.type === 'image') {
      lines.push('- [Image]');
    } else if (b.type === 'thinking') {
      if (opts.includeTools) {
        const t = (b as { thinking?: unknown }).thinking;
        lines.push(`- [Thinking] ${oneLine(typeof t === 'string' ? t : '')}`);
      }
    } else {
      lines.push(`- [${b.type}]`);
    }
  }
  return lines;
}

function oneLine(s: string): string {
  const stripped = s.replace(/\s+/g, ' ').trim();
  return stripped.length > 200 ? stripped.slice(0, 200) + '...' : stripped;
}

const HEADER_PREFIX = '# CCLog: ';
const NOTICE = '<!-- Generated by cclog. Do not edit (regenerated on each run). -->';
export const ALL_IN_ONE_FILE = 'CCLOG_ALL.md';

export function buildSessionFileHeader(
  sessionId: string,
  jsonlPath: string,
  projectPath: string,
): string {
  return [
    NOTICE,
    `${HEADER_PREFIX}${sessionId}`,
    '',
    `- Project: ${projectPath}`,
    `- Source: ${jsonlPath}`,
    '',
    SEP,
    '',
    '',
  ].join('\n');
}

export function buildAllInOneFileHeader(projectPath: string): string {
  return [
    NOTICE,
    '# CCLOG_ALL',
    '',
    `- Project: ${projectPath}`,
    '',
    SEP,
    '',
    '',
  ].join('\n');
}

export type WriteResult = 'create' | 'noop' | 'append' | 'rewrite';

function splitHeaderBody(s: string): { header: string; body: string } | null {
  // The body starts after the first "\n----...----\n" line. Anything before
  // (the notice, the title, the project metadata) is the header.
  const marker = '\n' + SEP + '\n';
  const idx = s.indexOf(marker);
  if (idx === -1) return null;
  return { header: s.slice(0, idx + 1), body: s.slice(idx + 1) };
}

/**
 * Write file content with minimal disturbance:
 *   - no existing file        -> create
 *   - body identical          -> noop (file untouched, mtime preserved)
 *   - new body extends old    -> appendFile of the new tail only
 *   - body differs in middle  -> full rewrite
 *
 * The header (everything before the first SEP line) is intentionally
 * ignored for comparison so that volatile fields like timestamps don't
 * force rewrites.
 */
export async function smartWrite(filePath: string, newContent: string): Promise<WriteResult> {
  let existing: string;
  try {
    existing = await fs.readFile(filePath, 'utf-8');
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      await fs.writeFile(filePath, newContent, 'utf-8');
      return 'create';
    }
    throw e;
  }

  const eParts = splitHeaderBody(existing);
  const nParts = splitHeaderBody(newContent);
  if (!eParts || !nParts) {
    await fs.writeFile(filePath, newContent, 'utf-8');
    return 'rewrite';
  }

  if (eParts.body === nParts.body) {
    return 'noop';
  }
  if (nParts.body.startsWith(eParts.body)) {
    const tail = nParts.body.slice(eParts.body.length);
    await fs.appendFile(filePath, tail, 'utf-8');
    return 'append';
  }
  await fs.writeFile(filePath, newContent, 'utf-8');
  return 'rewrite';
}
