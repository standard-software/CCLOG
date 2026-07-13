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

// Approximate USD pricing per MILLION tokens, standard tier, keyed by a
// model-id substring (first match wins — keep specific entries above the
// generic family fallbacks). These rates drift over time and vary by
// tier/region, so %Cost% is a rough estimate, not a bill — edit the table
// to match current pricing. Anthropic's standard cache multipliers let us
// derive the rest from the input rate: cache-read ≈ 0.1× input, 5-minute
// cache-write ≈ 1.25× input, 1-hour cache-write ≈ 2× input. An
// unrecognized model yields '' (blank) rather than a misleading guess.
const PRICING: Array<{ match: string; input: number; output: number }> = [
  { match: 'fable', input: 10, output: 50 },
  { match: 'mythos', input: 10, output: 50 },
  // Legacy Opus generations (4.1 and earlier) were $15/$75.
  { match: 'opus-4-1', input: 15, output: 75 },
  { match: 'opus-4-2025', input: 15, output: 75 },
  { match: '3-opus', input: 15, output: 75 },
  // Current Opus tier (4.5+) is $5/$25.
  { match: 'opus', input: 5, output: 25 },
  { match: 'sonnet', input: 3, output: 15 },
  { match: 'haiku', input: 1, output: 5 },
];

export function estimateCostUsd(model: string, t: TokenTotals): number | null {
  const m = model.toLowerCase();
  const p = PRICING.find(x => m.includes(x.match));
  if (!p) return null;
  const perM = (n: number, rate: number) => (n / 1_000_000) * rate;
  return (
    perM(t.input, p.input) +
    perM(t.output, p.output) +
    perM(t.cacheRead, p.input * 0.1) +
    perM(t.cacheWrite5m, p.input * 1.25) +
    perM(t.cacheWrite1h, p.input * 2.0)
  );
}

export function formatCost(model: string, t: TokenTotals): string {
  if (!hasTokens(t)) return '';
  const c = estimateCostUsd(model, t);
  if (c === null) return '';
  return `$${c.toFixed(4)}`;
}
