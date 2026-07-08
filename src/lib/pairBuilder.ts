import { contentHasOnlyToolResults } from './contentFormatter.js';
import type {
  LogEntry,
  UserEntry,
  AssistantEntry,
  Pair,
  MessageContent,
} from './types.js';

function isUserEntry(e: LogEntry): e is UserEntry {
  return e.type === 'user' && !!(e as UserEntry).message;
}

function isAssistantEntry(e: LogEntry): e is AssistantEntry {
  return e.type === 'assistant' && !!(e as AssistantEntry).message;
}

/**
 * When the user types a message while the assistant is still responding,
 * Claude Code stores it as type=attachment with attachment.type=
 * "queued_command". The prompt text lives in attachment.prompt. Such an
 * entry is functionally a new user question — treat it as one.
 */
function asQueuedPromptUser(e: LogEntry): UserEntry | null {
  if (e.type !== 'attachment') return null;
  const att = (e as { attachment?: unknown }).attachment;
  if (!att || typeof att !== 'object') return null;
  const a = att as { type?: unknown; prompt?: unknown; commandMode?: unknown };
  if (a.type !== 'queued_command') return null;
  if (typeof a.prompt !== 'string') return null;
  if (a.commandMode !== undefined && a.commandMode !== 'prompt') return null;
  const re = e as { uuid?: string; parentUuid?: string | null; timestamp?: string; isSidechain?: boolean };
  return {
    type: 'user',
    message: { role: 'user', content: a.prompt },
    uuid: re.uuid ?? '',
    parentUuid: re.parentUuid ?? null,
    timestamp: re.timestamp ?? '',
    isSidechain: re.isSidechain ?? false,
  };
}

function getContentText(content: MessageContent): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const b of content) {
      if (b.type === 'text' && typeof (b as { text?: unknown }).text === 'string') {
        parts.push((b as { text: string }).text);
      }
    }
    return parts.join('\n');
  }
  return '';
}

function isSystemNoiseContent(content: MessageContent): boolean {
  const t = getContentText(content).trimStart();
  return (
    t.startsWith('<local-command-caveat>') ||
    t.startsWith('<local-command-stdout>') ||
    t.startsWith('<system-reminder>')
  );
}

function belongsToCurrentQuestion(e: UserEntry, current: Pair): boolean {
  if (!e.parentUuid) return false;
  if (e.parentUuid === current.questionEntry.uuid) return true;
  for (const extra of current.additionalQuestionEntries) {
    if (e.parentUuid === extra.uuid) return true;
  }
  return false;
}

/**
 * The human-readable session name Claude Code shows in its resume list.
 * Stored in the log as standalone entries:
 *   {"type":"ai-title","aiTitle":"...","sessionId":"..."}       auto-generated
 *   {"type":"custom-title","customTitle":"...","sessionId":"..."} user-set
 * Both can appear many times (re-emitted as the title is refined); the last
 * one wins. A user-set custom title takes precedence over the AI one.
 * Returns '' when the session has no title (e.g. older logs that predate the
 * feature) so a %SessionName% placeholder simply renders empty.
 */
export function extractSessionName(entries: LogEntry[]): string {
  let aiTitle = '';
  let customTitle = '';
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    if (e.type === 'custom-title') {
      const v = (e as { customTitle?: unknown }).customTitle;
      if (typeof v === 'string' && v.trim() !== '') customTitle = v;
    } else if (e.type === 'ai-title') {
      const v = (e as { aiTitle?: unknown }).aiTitle;
      if (typeof v === 'string' && v.trim() !== '') aiTitle = v;
    }
  }
  return customTitle || aiTitle;
}

// Extract the slash-command name from a pair's question text, e.g.
// "<command-name>/my-todo1</command-name>" -> "my-todo1". For a namespaced
// command ("/plugin:cmd") the last segment is used, matching how the command
// file is named. Returns null when the question isn't a slash command.
const COMMAND_NAME_RE = /<command-name>\s*\/?([^<\s]+)\s*<\/command-name>/;

function slashCommandName(pair: Pair): string | null {
  const entries = [pair.questionEntry, ...pair.additionalQuestionEntries];
  for (const e of entries) {
    const t = getContentText(e.message?.content ?? '');
    const m = COMMAND_NAME_RE.exec(t);
    if (m) {
      const seg = m[1].split(/[/:]/).filter(Boolean).pop();
      if (seg) return seg;
    }
  }
  return null;
}

// Find, among a pair's progress entries, the full text of the command's source
// file — recorded as a Read tool_result whose toolUseResult.file points at
// "…/commands/<name>.md". Returns that raw content, or null if no such read.
function commandFileContent(pair: Pair, name: string): string | null {
  const wantBase = `${name}.md`.toLowerCase();
  for (const e of pair.progressEntries) {
    const tur = (e as unknown as Record<string, unknown>).toolUseResult;
    if (!tur || typeof tur !== 'object') continue;
    const file = (tur as { file?: unknown }).file;
    if (!file || typeof file !== 'object') continue;
    const fp = (file as { filePath?: unknown }).filePath;
    const content = (file as { content?: unknown }).content;
    if (typeof fp !== 'string' || typeof content !== 'string') continue;
    const base = fp.replace(/\\/g, '/').split('/').pop()?.toLowerCase();
    if (base === wantBase && /[\\/]commands[\\/]/i.test(fp)) {
      return content;
    }
  }
  return null;
}

// Claude Code sometimes records a custom slash command's injected body only
// partially in the (isMeta) user entry, while the full body survives in the
// tool_result of the Read it does on the command's own .md file. When that
// happens the exported "Question" is silently truncated. Detect the pattern —
// a question with <command-name>/X</command-name>, a Read of commands/X.md in
// the same pair, and an injected-body entry whose text is a strict prefix of
// that file's content — and swap the truncated body for the full file content.
// Conservative: only replaces when the body is a genuine prefix AND shorter,
// so a complete body is never altered and unrelated pairs are never touched.
export function recoverSlashCommandBodies(pairs: Pair[]): void {
  for (const pair of pairs) {
    const name = slashCommandName(pair);
    if (!name) continue;
    const full = commandFileContent(pair, name);
    if (!full) continue;
    const fullKey = full.replace(/\s+$/g, '');
    for (const extra of pair.additionalQuestionEntries) {
      const t = getContentText(extra.message?.content ?? '');
      if (!t) continue;
      const tKey = t.replace(/\s+$/g, '');
      if (tKey.length < fullKey.length && fullKey.startsWith(tKey)) {
        extra.message.content = full;
        break;
      }
    }
  }
}

export interface BuildPairsOptions {
  includeSidechain?: boolean;
  recoverSlashCommandBody?: boolean;
}

export function buildPairs(entries: LogEntry[], options: BuildPairsOptions = {}): Pair[] {
  const { includeSidechain = false, recoverSlashCommandBody = true } = options;
  const pairs: Pair[] = [];
  let current: Pair | null = null;

  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;

    // Queued-prompt attachment: a user message typed while the assistant
    // was busy. Synthesize a UserEntry and feed it through the regular
    // "real human question" path.
    const queued = asQueuedPromptUser(e);
    if (queued) {
      if (queued.isSidechain && !includeSidechain) continue;
      if (current && current.finalAssistantEntry) {
        pairs.push(current);
        current = null;
      }
      if (current === null) {
        current = {
          questionEntry: queued,
          additionalQuestionEntries: [],
          progressEntries: [],
          finalAssistantEntry: null,
        };
      } else {
        current.additionalQuestionEntries.push(queued);
      }
      continue;
    }

    if (isUserEntry(e)) {
      if (e.isSidechain && !includeSidechain) continue;
      const content = e.message?.content;
      if (content === undefined || content === null) continue;

      if (e.isMeta) {
        // Include only when this is the expansion of the current pair's
        // slash command (parentUuid links it to the question entry) AND
        // the assistant hasn't responded yet. Skip system noise like
        // <local-command-caveat> / <system-reminder>.
        if (
          current &&
          !current.finalAssistantEntry &&
          !isSystemNoiseContent(content) &&
          belongsToCurrentQuestion(e, current)
        ) {
          current.additionalQuestionEntries.push(e);
        }
        continue;
      }

      if (contentHasOnlyToolResults(content)) {
        if (current) current.progressEntries.push(e);
        continue;
      }

      // Real human question.
      if (current && current.finalAssistantEntry) {
        pairs.push(current);
        current = null;
      }

      if (current === null) {
        current = {
          questionEntry: e,
          additionalQuestionEntries: [],
          progressEntries: [],
          finalAssistantEntry: null,
        };
      } else if (e.parentUuid && e.parentUuid === current.questionEntry.parentUuid) {
        // Cancellation + retype: when the user ESCs out of one prompt
        // and types a fresh one, the new user entry forks from the
        // SAME parent as the cancelled one (siblings), instead of
        // chaining (new.parentUuid === old.uuid). Drop the cancelled
        // text and treat the new entry as the question.
        current.questionEntry = e;
        current.additionalQuestionEntries = [];
      } else {
        current.additionalQuestionEntries.push(e);
      }
      continue;
    }

    if (isAssistantEntry(e)) {
      if (e.isSidechain && !includeSidechain) continue;
      if (!current) continue;
      if (current.finalAssistantEntry) {
        current.progressEntries.push(current.finalAssistantEntry);
      }
      current.finalAssistantEntry = e;
      continue;
    }
  }

  // Push the trailing pair (the last question of the session) too.
  // It may have no final assistant entry yet (session in progress) — in
  // that case the answer slot will simply be empty inside its
  // <!-- --> wrapper.
  if (current) pairs.push(current);

  if (recoverSlashCommandBody) recoverSlashCommandBodies(pairs);
  return pairs;
}
