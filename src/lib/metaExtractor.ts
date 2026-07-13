import type { Pair, AssistantEntry } from './types.js';

// The parsed JSONL entries carry many more fields than the narrow
// UserEntry / AssistantEntry interfaces declare (model, usage, version,
// gitBranch, cwd, …). They survive JSON.parse untouched, so we read them
// through a permissive record cast rather than widening the shared types.
type Raw = Record<string, unknown>;

function raw(e: unknown): Raw {
  return (e && typeof e === 'object' ? e : {}) as Raw;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

// "8730" -> "8,730". Kept locale-independent (toLocaleString varies by
// environment) so the exported Markdown is byte-stable across machines.
function comma(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Assistant turns that belong to a pair, oldest → newest: the ones demoted
// into progress plus the final answer entry.
function assistantEntries(pair: Pair): AssistantEntry[] {
  const list: AssistantEntry[] = [];
  for (const e of pair.progressEntries) {
    if (e.type === 'assistant') list.push(e as AssistantEntry);
  }
  if (pair.finalAssistantEntry) list.push(pair.finalAssistantEntry);
  return list;
}

// System-generated placeholder messages (e.g. an interruption stub) carry
// model "<synthetic>". Skip those so %Model% reflects the real model that
// produced the answer.
const SYNTHETIC = '<synthetic>';

export function extractModel(pair: Pair): string {
  const asst = assistantEntries(pair);
  for (let i = asst.length - 1; i >= 0; i--) {
    const m = raw(asst[i].message).model;
    if (typeof m === 'string' && m && m !== SYNTHETIC) return m;
  }
  return '';
}

// version / gitBranch / cwd live at the top level of every entry. The
// question entry is the natural "when/where this pair started" anchor;
// fall back through the rest of the pair for the rare entry that lacks it.
function anchorField(pair: Pair, key: string): string {
  const candidates: unknown[] = [
    pair.questionEntry,
    ...pair.additionalQuestionEntries,
    pair.finalAssistantEntry,
    ...pair.progressEntries,
  ];
  for (const e of candidates) {
    if (!e) continue;
    const v = raw(e)[key];
    if (typeof v === 'string' && v) return v;
  }
  return '';
}

export function extractVersion(pair: Pair): string { return anchorField(pair, 'version'); }
export function extractGitBranch(pair: Pair): string { return anchorField(pair, 'gitBranch'); }
export function extractCwd(pair: Pair): string { return anchorField(pair, 'cwd'); }

export interface TokenTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
}

// Sum message.usage across every assistant turn in the pair. A single
// answer often spans several API calls (thinking, tool_use, then text), so
// per-pair totals require accumulating them all.
export function extractTokenTotals(pair: Pair): TokenTotals {
  const t: TokenTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 };
  for (const a of assistantEntries(pair)) {
    const usage = raw(a.message).usage;
    if (!usage || typeof usage !== 'object') continue;
    const u = usage as Raw;
    t.input += num(u.input_tokens);
    t.output += num(u.output_tokens);
    t.cacheRead += num(u.cache_read_input_tokens);
    const cc = u.cache_creation;
    if (cc && typeof cc === 'object') {
      t.cacheWrite5m += num((cc as Raw).ephemeral_5m_input_tokens);
      t.cacheWrite1h += num((cc as Raw).ephemeral_1h_input_tokens);
    } else {
      // Older logs expose only the flat cache_creation_input_tokens.
      t.cacheWrite5m += num(u.cache_creation_input_tokens);
    }
  }
  return t;
}

export function hasTokens(t: TokenTotals): boolean {
  return t.input > 0 || t.output > 0 || t.cacheRead > 0 || t.cacheWrite5m > 0 || t.cacheWrite1h > 0;
}

export function formatTokens(t: TokenTotals): string {
  if (!hasTokens(t)) return '';
  const cacheWrite = t.cacheWrite5m + t.cacheWrite1h;
  return `in ${comma(t.input)}, out ${comma(t.output)}, cache read ${comma(t.cacheRead)}, cache write ${comma(cacheWrite)}`;
}
