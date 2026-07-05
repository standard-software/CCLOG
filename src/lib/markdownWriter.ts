import fs from 'node:fs/promises';
import path from 'node:path';
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
import { DEFAULT_TEMPLATE, renderTemplate, progressMode } from './templates.js';
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
  /**
   * Pair-block template. Whether the progress section is rendered — and
   * how verbosely — is determined entirely by which placeholder this
   * string contains: %Progress% (summary), %ProgressFull% (full tool
   * dump + thinking), or neither (no progress). There is no separate
   * flag.
   */
  template?: string;
}

export function formatPair(
  pair: Pair,
  opts: FormatOptions,
  sessionId?: string,
  sessionName?: string,
): string {
  const tpl = opts.template ?? DEFAULT_TEMPLATE;
  const mode = progressMode(tpl);
  const wantProgress = mode !== 'none';
  const includeFull = mode === 'full';

  const ts = formatTimestamp(pair.questionEntry.timestamp);

  const qParts: string[] = [];
  qParts.push(formatUserText(pair.questionEntry.message.content));
  for (const extra of pair.additionalQuestionEntries) {
    const t = formatUserText(extra.message.content);
    if (t) qParts.push(t);
  }
  const questionText = qParts.filter(Boolean).join('\n\n');
  // Defang HTML-comment tokens so a template wrapping %Question% inside
  // `<!-- ... -->` (some users do this so both sides fold in previews)
  // isn't broken by a literal `-->` in the question. `<!--` isn't strictly
  // dangerous (HTML comments don't nest so a nested `<!--` is inert), but
  // we defang it too so readers of the output can visually tell "this was
  // sanitized" — otherwise mixed raw `<!--` and defanged `-- >` look
  // suspicious. See VERSION.md 1.4.0.
  const safeQuestion = questionText.replaceAll('-->', '-- >').replaceAll('<!--', '<! --');

  const progressLines: string[] = [];
  if (wantProgress) {
    for (const entry of pair.progressEntries) {
      progressLines.push(...progressLinesFor(entry, includeFull));
    }
    if (pair.finalAssistantEntry) {
      const fa = pair.finalAssistantEntry;
      for (const t of extractNonFinalAssistantTexts(fa.message.content)) {
        const line = oneLine(t);
        if (line) progressLines.push(`- (assistant) ${line}`);
      }
      for (const tu of extractToolUses(fa.message.content)) {
        progressLines.push(`- ${formatToolUseSummary(tu, includeFull)}`);
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
  const safeAnswer = answerText.replaceAll('-->', '-- >').replaceAll('<!--', '<! --');

  // The template contains at most one of %Progress% / %ProgressFull%;
  // providing both vars (same rendered text) means whichever is present
  // gets filled and the other key is simply a no-op.
  // Progress rendering includes tool_use / tool_result / assistant text
  // that can contain a literal `-->` — same defanging as Question/Answer
  // so a template wrapping %Progress% in a comment stays intact.
  const progressText = progressLines.join('\n').replaceAll('-->', '-- >').replaceAll('<!--', '<! --');
  return renderTemplate(tpl, {
    DateTime: ts,
    SessionId: sessionId ?? '',
    SessionName: sessionName ?? '',
    Question: safeQuestion,
    Progress: progressText,
    ProgressFull: progressText,
    Answer: safeAnswer,
  });
}

function progressLinesFor(entry: UserEntry | AssistantEntry, includeFull: boolean): string[] {
  const lines: string[] = [];
  const content = entry.message?.content;
  if (content === undefined || content === null) return lines;

  if (entry.type === 'user') {
    for (const tr of extractToolResults(content)) {
      lines.push(`- ${formatToolResultSummary(tr, includeFull)}`);
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
      lines.push(`- ${formatToolUseSummary(b, includeFull)}`);
    } else if (b.type === 'tool_result') {
      lines.push(`- ${formatToolResultSummary(b, includeFull)}`);
    } else if (b.type === 'image') {
      lines.push('- [Image]');
    } else if (b.type === 'thinking') {
      if (includeFull) {
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

export function buildAllInOneFileHeader(projectPath: string, fileName: string): string {
  // Title inside the file mirrors the output filename (basename without
  // its extension) so a custom `outputAllFileName` in cclog.config.json is
  // reflected in the header too. Empty basename falls back to CCLOG_ALL.
  const base = path.basename(fileName, path.extname(fileName));
  const title = base || 'CCLOG_ALL';
  return [
    NOTICE,
    `# ${title}`,
    '',
    `- Project: ${projectPath}`,
    '',
    SEP,
    '',
    '',
  ].join('\n');
}

export type WriteResult = 'create' | 'noop' | 'append' | 'rewrite';

export interface SmartWriteOutcome {
  result: WriteResult;
  backedUp: boolean;
}

function splitHeaderBody(s: string): { header: string; body: string } | null {
  // The body starts after the first "\n----...----\n" line. Anything before
  // (the notice, the title, the project metadata) is the header.
  const marker = '\n' + SEP + '\n';
  const idx = s.indexOf(marker);
  if (idx === -1) return null;
  return { header: s.slice(0, idx + 1), body: s.slice(idx + 1) };
}

// Copy the about-to-be-overwritten file into backupDir (created lazily,
// so no empty folder appears when nothing is rewritten). Used only on the
// 'rewrite' path; create/noop/append never destroy existing content.
async function backupBeforeOverwrite(filePath: string, backupDir: string): Promise<void> {
  await fs.mkdir(backupDir, { recursive: true });
  await fs.copyFile(filePath, path.join(backupDir, path.basename(filePath)));
}

// Timestamp header rendered from %DateTime% by every bundled template:
// `# YYYY/MM/DD `. Anchors extractBlockIdentity so a real pair block is
// distinguished from a phantom block created when a Q/A body happens to
// contain the 40-hyphen SEP line and our splitter over-splits there.
const TS_HEADER_PATTERN = /^# \d{4}\/\d{2}\/\d{2} /;

// Extract a stable per-block identity — lines that don't drift as the
// answer text is streamed to completion. All bundled templates put the
// question timestamp on a line matching TS_HEADER_PATTERN and the session
// id on a line starting with 'Session:'. Together these uniquely identify
// a Q&A pair. Returns null when the block has no timestamp header — a
// phantom created by a body-embedded SEP line — so isDestructiveRewrite
// can skip it instead of turning body content into a spurious identity.

function extractBlockIdentity(block: string): string | null {
  const lines = block.split('\n');
  let dt = '';
  let sid = '';
  for (const line of lines) {
    if (!dt && TS_HEADER_PATTERN.test(line)) dt = line;
    else if (!sid && line.startsWith('Session:')) sid = line;
    if (dt && sid) break;
  }
  if (!dt) return null;
  return `${dt}${sid}`;
}

// A "rewrite" is destructive only when the new body has dropped at least
// one identity present in the old body. Streaming completion of the last
// pair or a backdated middle-insert both keep every old pair identity —
// no data is lost, so the backup can be skipped. Phantom blocks (identity
// === null) are dropped on both sides so a Q/A body embedding a 40-hyphen
// line doesn't turn subsequent unrelated body-content edits (e.g. this
// version's `<!--` → `<! --` defanging) into false destructive detections.
function isDestructiveRewrite(oldBody: string, newBody: string): boolean {
  const sep = '\n' + SEP + '\n';
  const oldBlocks = oldBody.split(sep).filter(b => b.length > 0);
  const newBlocks = newBody.split(sep).filter(b => b.length > 0);
  const newIds = new Set<string>();
  for (const b of newBlocks) {
    const id = extractBlockIdentity(b);
    if (id !== null) newIds.add(id);
  }
  for (const b of oldBlocks) {
    const id = extractBlockIdentity(b);
    if (id === null) continue;
    if (!newIds.has(id)) return true;
  }
  return false;
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
 *
 * When `backupDir` is given, the existing file is copied there (under its
 * original name) immediately before a *destructive* rewrite overwrites it
 * — meaning the new body has dropped at least one pair identity that the
 * old body had. Non-destructive rewrites (streaming completion of the last
 * pair, or a backdated middle-insert that just reorders/extends without
 * dropping anything) do not back up, because no prior content is being
 * lost. create/noop/append do not back up either.
 */
export async function smartWrite(
  filePath: string,
  newContent: string,
  backupDir?: string,
): Promise<SmartWriteOutcome> {
  let existing: string;
  try {
    existing = await fs.readFile(filePath, 'utf-8');
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      await fs.writeFile(filePath, newContent, 'utf-8');
      return { result: 'create', backedUp: false };
    }
    throw e;
  }

  const eParts = splitHeaderBody(existing);
  const nParts = splitHeaderBody(newContent);
  if (!eParts || !nParts) {
    let backedUp = false;
    if (backupDir) { await backupBeforeOverwrite(filePath, backupDir); backedUp = true; }
    await fs.writeFile(filePath, newContent, 'utf-8');
    return { result: 'rewrite', backedUp };
  }

  if (eParts.body === nParts.body) {
    return { result: 'noop', backedUp: false };
  }
  if (nParts.body.startsWith(eParts.body)) {
    const tail = nParts.body.slice(eParts.body.length);
    await fs.appendFile(filePath, tail, 'utf-8');
    return { result: 'append', backedUp: false };
  }
  let backedUp = false;
  if (backupDir && isDestructiveRewrite(eParts.body, nParts.body)) {
    await backupBeforeOverwrite(filePath, backupDir);
    backedUp = true;
  }
  await fs.writeFile(filePath, newContent, 'utf-8');
  return { result: 'rewrite', backedUp };
}
