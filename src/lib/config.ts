import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_TEMPLATE } from './templates.js';

// Resolve the cclog package root (two levels up from dist/lib/config.js).
// Used so a relative "template" path in the config can first be looked
// up against the shipped templates/ dir before falling back to the
// project's own CCLOG/.
export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface CclogConfig {
  extraCwds: string[];
  extraLogDirs: string[];
  recursive: boolean;
  includeSidechain: boolean;
  /**
   * Loaded template content. Whether — and how verbosely — the progress
   * section is rendered is determined by which placeholder this string
   * contains: `%Progress%` (summary), `%ProgressFull%` (full dump), or
   * neither (no progress).
   */
  template: string;
}

export const DEFAULT_CONFIG: CclogConfig = {
  extraCwds: [],
  extraLogDirs: [],
  recursive: false,
  includeSidechain: false,
  template: DEFAULT_TEMPLATE,
};

export const CONFIG_FILE_NAME = 'cclog.config.json';

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

/**
 * Load <outDir>/cclog.config.json, falling back to defaults if missing
 * or malformed. Throws only if the file exists but is unreadable for a
 * reason other than ENOENT.
 */
export async function loadConfig(outDir: string): Promise<{
  config: CclogConfig;
  source: 'file' | 'default';
  path: string;
}> {
  const fpath = path.join(outDir, CONFIG_FILE_NAME);
  let raw: string;
  try {
    raw = await fs.readFile(fpath, 'utf-8');
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      return { config: DEFAULT_CONFIG, source: 'default', path: fpath };
    }
    throw e;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(`Warning: ${fpath} is not valid JSON — using defaults.`);
    return { config: DEFAULT_CONFIG, source: 'default', path: fpath };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { config: DEFAULT_CONFIG, source: 'default', path: fpath };
  }
  const obj = parsed as Record<string, unknown>;
  const template = await resolveTemplate(outDir, obj.template, DEFAULT_TEMPLATE, 'template');
  const config: CclogConfig = {
    extraCwds: asStringArray(obj.extraCwds),
    extraLogDirs: asStringArray(obj.extraLogDirs),
    recursive: asBool(obj.recursive, DEFAULT_CONFIG.recursive),
    includeSidechain: asBool(obj.includeSidechain, DEFAULT_CONFIG.includeSidechain),
    template,
  };
  return { config, source: 'file', path: fpath };
}

async function resolveTemplate(
  configDir: string,
  raw: unknown,
  fallback: string,
  label: string,
): Promise<string> {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;

  // Absolute path: use as-is, no fallback search.
  if (path.isAbsolute(raw)) {
    try {
      return await fs.readFile(raw, 'utf-8');
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      console.warn(`Warning: cclog ${label} not found at ${raw} (${err.code ?? 'error'}) — falling back to default.`);
      return fallback;
    }
  }

  // Relative path: try cclog's package dir first (so the shipped
  // templates/japanese.md works without copying it everywhere), then
  // fall back to the project's own CCLOG/ next to the config file,
  // and finally the project root (so an ejected template written as
  // "CCLOG/templates/japanese.md" by --init-template also resolves).
  const candidates = [
    path.join(PACKAGE_ROOT, raw),
    path.join(configDir, raw),
    path.join(path.dirname(configDir), raw),
  ];
  for (const p of candidates) {
    try {
      return await fs.readFile(p, 'utf-8');
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') throw e;
      // try next candidate
    }
  }
  console.warn(`Warning: cclog ${label} not found in any of:\n  ${candidates.join('\n  ')}\n  — falling back to default.`);
  return fallback;
}
