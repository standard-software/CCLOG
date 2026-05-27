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

export interface BuildPairsOptions {
  includeSidechain?: boolean;
}

export function buildPairs(entries: LogEntry[], options: BuildPairsOptions = {}): Pair[] {
  const { includeSidechain = false } = options;
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
  return pairs;
}
