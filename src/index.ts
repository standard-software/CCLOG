#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { getLogDirForProject } from './lib/pathResolver.js';
import { readJsonl } from './lib/jsonlReader.js';
import { buildPairs } from './lib/pairBuilder.js';
import { loadConfig, PACKAGE_ROOT, CONFIG_FILE_NAME } from './lib/config.js';
import {
  formatPair,
  buildSessionFileHeader,
  buildAllInOneFileHeader,
  smartWrite,
  ALL_IN_ONE_FILE,
  type WriteResult,
} from './lib/markdownWriter.js';
import type { CliOptions, Pair } from './lib/types.js';

const PKG_VERSION = (createRequire(import.meta.url)('../package.json') as { version: string }).version;

type ParseResult =
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'error'; msg: string }
  | { kind: 'ok'; opts: CliOptions };

function parseArgs(argv: string[]): ParseResult {
  const args = argv.slice(2);
  let projectPath: string | null = null;
  let outDir: string | null = null;
  let perSession = false;
  let dryRun = false;
  let verbose = false;
  let initTemplate = false;
  let backupJsonl = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--out') {
      const v = args[++i];
      if (!v) return { kind: 'error', msg: '--out requires a value' };
      outDir = v;
    } else if (a === '--per-session') {
      perSession = true;
    } else if (a === '--dry-run') {
      dryRun = true;
    } else if (a === '--verbose') {
      verbose = true;
    } else if (a === '--init-template') {
      initTemplate = true;
    } else if (a === '--backup-jsonl') {
      backupJsonl = true;
    } else if (a === '--version' || a === '-v' || a === '-V') {
      return { kind: 'version' };
    } else if (a === '--help' || a === '-h') {
      return { kind: 'help' };
    } else if (a.startsWith('--')) {
      return { kind: 'error', msg: `Unknown option: ${a}` };
    } else {
      if (projectPath === null) projectPath = a;
      else return { kind: 'error', msg: `Unexpected positional argument: ${a}` };
    }
  }

  const finalProjectPath = path.resolve(projectPath ?? process.cwd());
  const finalOutDir = path.resolve(outDir ?? path.join(finalProjectPath, 'CCLOG'));
  return {
    kind: 'ok',
    opts: {
      projectPath: finalProjectPath,
      outDir: finalOutDir,
      perSession,
      dryRun,
      verbose,
      initTemplate,
      backupJsonl,
    },
  };
}

function printHelp(): void {
  console.log(`cclog - Export Claude Code session logs to Markdown

Usage:
  cclog [project-path] [options]

Arguments:
  project-path           Project directory (defaults to the current directory).

Options:
  --out <dir>            Output directory (default: <project-path>/CCLOG).
  --per-session          Write one file per session (CCLOG/CCLOG_<sessionId>.md)
                         instead of the aggregated CCLOG/CCLOG_ALL.md.
  --init-template        Copy the currently-configured template (or the English
                         default if no config exists) from cclog's install
                         location into <out>/templates/ and rewrite
                         cclog.config.json to point at the local copy. Lets you
                         edit the template without touching the global install.
  --backup-jsonl         Copy the discovered source .jsonl logs into
                         <out>/backup_jsonl/<yyyy-mm-dd_hh-mm-ss>_<hostname>/
                         before exporting. Lets you preserve the raw session
                         logs locally (e.g. before swapping PCs, since the
                         source path encoding — and thus the log location —
                         changes per machine). The folder name embeds the
                         machine name (os.hostname()) so backups stay
                         attributable per PC.
  --dry-run              Don't write files; report what would be written.
  --verbose              Verbose logging.
  -v, -V, --version      Show version and exit.
  -h, --help             Show this help.

Whether — and how verbosely — the progress section appears is determined
entirely by the template (the default English template has no progress
section). Set "template" in CCLOG/cclog.config.json to one that contains:
  %Progress%      summarized tool calls (e.g. templates/english-with-progress.md
                  or templates/japanese-with-progress.md)
  %ProgressFull%  full tool input/output JSON + thinking
                  (templates/english-with-progress-full.md or
                  templates/japanese-with-progress-full.md)

Note: the output is regenerated from JSONL on every run, but the file is
only modified when its content would actually change. When the new
content is a strict append on top of the existing file, only the tail
is appended (so editors don't reload from the top).
`);
}

async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true });
}

async function listSessionFiles(logDir: string, recursive = false): Promise<string[]> {
  try {
    if (recursive) {
      const entries = await fs.readdir(logDir, { recursive: true, withFileTypes: true });
      const out: string[] = [];
      for (const e of entries) {
        if (!e.isFile() || !e.name.endsWith('.jsonl')) continue;
        const parent = (e as { parentPath?: string; path?: string }).parentPath
          ?? (e as { path?: string }).path
          ?? logDir;
        out.push(path.join(parent, e.name));
      }
      return out.sort();
    }
    const entries = await fs.readdir(logDir);
    return entries
      .filter(n => n.endsWith('.jsonl'))
      .map(n => path.join(logDir, n))
      .sort();
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return [];
    throw e;
  }
}

async function rmIfExists(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== 'ENOENT') throw e;
  }
}

const LEGACY_STATE_FILES = [
  '.cclog-state.json',
  '.cclog-state.json.bak',
  '.cclog-state.json.tmp',
  '.cclog-state.lock',
  '.cclogtofile-state.json',
  '.cclogtofile-state.json.bak',
  '.cclogtofile-state.json.tmp',
  '.cclogtofile-state.lock',
];

async function cleanupLegacyStateFiles(outDir: string, verbose: boolean): Promise<void> {
  for (const name of LEGACY_STATE_FILES) {
    const p = path.join(outDir, name);
    try {
      await fs.stat(p);
      await fs.unlink(p);
      if (verbose) console.log(`  removed legacy: ${name}`);
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') throw e;
    }
  }
}

interface SessionData {
  sessionId: string;
  jsonlPath: string;
  allPairs: Pair[];
  skippedLines: number;
}

interface DiscoveredFile {
  filePath: string;
  logDir: string;
}

function sessionIdFor(file: DiscoveredFile): string {
  // For top-level files this is just "<uuid>". For recursive finds
  // (subagent jsonls etc.) embed the subpath so the source is visible
  // in the per-session filename and the Session: line.
  const rel = path.relative(file.logDir, file.filePath).replace(/\.jsonl$/, '');
  return rel.replace(/[\\/]/g, '__');
}

async function readAllSessions(
  files: DiscoveredFile[],
  includeSidechain: boolean,
): Promise<SessionData[]> {
  const out: SessionData[] = [];
  for (const f of files) {
    const r = await readJsonl(f.filePath);
    out.push({
      sessionId: sessionIdFor(f),
      jsonlPath: f.filePath,
      allPairs: buildPairs(r.entries, { includeSidechain }),
      skippedLines: r.skippedLines,
    });
  }
  return out;
}

// Machine name (Windows COMPUTERNAME / Unix hostname), sanitized so it is
// safe as a single path segment: anything outside [A-Za-z0-9._-] (e.g. the
// dots of an FQDN are kept, but spaces/slashes are not) becomes "_". Falls
// back to "unknown-host" if the hostname is empty/unavailable.
function backupHostName(): string {
  const raw = (() => {
    try {
      return os.hostname();
    } catch {
      return '';
    }
  })();
  const safe = raw.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^_+|_+$/g, '');
  return safe || 'unknown-host';
}

// Folder name is "<yyyy-mm-dd_hh-mm-ss>_<hostname>" so backups sort
// chronologically while still recording which machine they came from.
function backupFolderName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_`
    + `${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  return `${stamp}_${backupHostName()}`;
}

const BACKUP_DIR_NAME = 'backup_jsonl';

// Copy every discovered source .jsonl into
// <outDir>/backup_jsonl/<yyyy-mm-dd_hh-mm-ss>_<hostname>/ so the raw logs
// survive a machine swap (where the source path encoding, and thus the log
// location, changes) and stay attributable to the machine they came from.
// File names come from sessionIdFor so a plain top-level session keeps its
// original "<uuid>.jsonl" name; collisions across multiple log dirs are
// disambiguated with a numeric suffix.
async function backupJsonlFiles(
  files: DiscoveredFile[],
  outDir: string,
  verbose: boolean,
): Promise<void> {
  const destDir = path.join(outDir, BACKUP_DIR_NAME, backupFolderName(new Date()));
  await fs.mkdir(destDir, { recursive: true });

  const usedNames = new Set<string>();
  let copied = 0;
  for (const f of files) {
    const base = sessionIdFor(f);
    let name = `${base}.jsonl`;
    for (let i = 2; usedNames.has(name); i++) name = `${base}__${i}.jsonl`;
    usedNames.add(name);
    await fs.copyFile(f.filePath, path.join(destDir, name));
    copied++;
    if (verbose) console.log(`  backup: ${f.filePath} -> ${name}`);
  }
  console.log(`Backed up ${copied} jsonl file(s) to ${destDir}`);
}

async function resolveRealPath(p: string): Promise<string> {
  try {
    return await fs.realpath(p);
  } catch {
    return p;
  }
}

async function processProject(opts: CliOptions): Promise<void> {
  // Load config from the output dir (CCLOG/cclog.config.json).
  const { config, source: configSource, path: configPath } = await loadConfig(opts.outDir);

  // Candidate log dirs:
  //   1. raw cwd encoding
  //   2. realpath cwd encoding (covers junction / symlink launches)
  //   3. each config.extraCwds entry (encoded the same way)
  //   4. each config.extraLogDirs entry verbatim
  const realProjectPath = await resolveRealPath(opts.projectPath);
  const candidateLogDirs = Array.from(new Set([
    getLogDirForProject(opts.projectPath),
    getLogDirForProject(realProjectPath),
    ...config.extraCwds.map(c => getLogDirForProject(c)),
    ...config.extraLogDirs,
  ]));
  const logDirs: string[] = [];
  for (const d of candidateLogDirs) {
    try {
      const st = await fs.stat(d);
      if (st.isDirectory()) logDirs.push(d);
    } catch {
      // missing — skip
    }
  }

  const files: DiscoveredFile[] = [];
  for (const d of logDirs) {
    const found = await listSessionFiles(d, config.recursive);
    for (const f of found) files.push({ filePath: f, logDir: d });
  }

  if (opts.verbose) {
    console.log(`Project: ${opts.projectPath}`);
    if (realProjectPath !== opts.projectPath) {
      console.log(`  (resolved via junction/symlink to: ${realProjectPath})`);
    }
    if (configSource === 'file') {
      console.log(`Config:  ${configPath}`);
      if (config.extraCwds.length) console.log(`  extraCwds:        ${config.extraCwds.length}`);
      if (config.extraLogDirs.length) console.log(`  extraLogDirs:     ${config.extraLogDirs.length}`);
      console.log(`  recursive:        ${config.recursive}`);
      console.log(`  includeSidechain: ${config.includeSidechain}`);
    }
    if (logDirs.length === 1 && candidateLogDirs.length === 1) {
      console.log(`Log dir: ${logDirs[0]}`);
    } else if (logDirs.length === 0) {
      console.log(`Log dir candidates (none found on disk):`);
      for (const d of candidateLogDirs) console.log(`  - ${d}`);
    } else {
      console.log(`Log dirs (${logDirs.length} of ${candidateLogDirs.length} candidates found):`);
      for (const d of candidateLogDirs) {
        const mark = logDirs.includes(d) ? '+' : '-';
        console.log(`  ${mark} ${d}`);
      }
    }
    console.log(`Out dir: ${opts.outDir}`);
    console.log(`Mode:    ${opts.perSession ? 'per-session' : 'aggregate (CCLOG_ALL.md)'}`);
    console.log(`Sessions: ${files.length}`);
  }

  if (files.length === 0) {
    if (candidateLogDirs.length === 1) {
      console.error(`No session logs found in: ${candidateLogDirs[0]}`);
    } else {
      console.error(`No session logs found in any of:`);
      for (const d of candidateLogDirs) console.error(`  - ${d}`);
    }
    return;
  }

  if (!opts.dryRun) {
    await ensureDir(opts.outDir);
    await cleanupLegacyStateFiles(opts.outDir, opts.verbose);
  }

  if (opts.backupJsonl) {
    if (opts.dryRun) {
      console.log(
        `(dry run) would back up ${files.length} jsonl file(s) to `
        + `${path.join(opts.outDir, BACKUP_DIR_NAME, backupFolderName(new Date()))}`,
      );
    } else {
      await backupJsonlFiles(files, opts.outDir, opts.verbose);
    }
  }

  const sessions = await readAllSessions(files, config.includeSidechain);
  const formatOpts = {
    template: config.template,
  };

  if (opts.perSession) {
    let totalPairs = 0;
    for (const s of sessions) {
      const filePath = path.join(opts.outDir, `CCLOG_${s.sessionId}.md`);
      const skipNote = s.skippedLines ? ` [${s.skippedLines} unparseable lines]` : '';

      if (s.allPairs.length === 0) {
        if (!opts.dryRun) await rmIfExists(filePath);
        console.log(`[${s.sessionId.slice(0, 8)}] 0 pair(s) (file removed)`);
        continue;
      }

      const content =
        buildSessionFileHeader(s.sessionId, s.jsonlPath, opts.projectPath) +
        s.allPairs.map(p => formatPair(p, formatOpts)).join('');

      let result: WriteResult | 'dry-run' = 'dry-run';
      if (!opts.dryRun) {
        result = await smartWrite(filePath, content);
      }
      console.log(`[${s.sessionId.slice(0, 8)}] ${s.allPairs.length} pair(s) [${result}]${skipNote}`);
      totalPairs += s.allPairs.length;
    }
    console.log(`Done. ${totalPairs} pair(s) total${opts.dryRun ? ' (dry run)' : ''}.`);
    return;
  }

  // Aggregate mode: merge all sessions' pairs, sort chronologically.
  interface AggItem {
    sessionId: string;
    pair: Pair;
  }
  const items: AggItem[] = [];
  for (const s of sessions) {
    for (const p of s.allPairs) {
      items.push({ sessionId: s.sessionId, pair: p });
    }
  }
  items.sort((a, b) => {
    const ta = Date.parse(a.pair.questionEntry.timestamp) || 0;
    const tb = Date.parse(b.pair.questionEntry.timestamp) || 0;
    return ta - tb;
  });

  const content =
    buildAllInOneFileHeader(opts.projectPath) +
    items.map(it => formatPair(it.pair, formatOpts, it.sessionId)).join('');

  const filePath = path.join(opts.outDir, ALL_IN_ONE_FILE);
  let result: WriteResult | 'dry-run' = 'dry-run';
  if (!opts.dryRun) {
    result = await smartWrite(filePath, content);
  }

  for (const s of sessions) {
    const skipNote = s.skippedLines ? ` [${s.skippedLines} unparseable lines]` : '';
    console.log(`[${s.sessionId.slice(0, 8)}] ${s.allPairs.length} pair(s)${skipNote}`);
  }
  console.log(`Done. ${items.length} pair(s) total [${result}]${opts.dryRun ? ' (dry run)' : ''}.`);
}

const DEFAULT_TEMPLATE_REL = 'templates/english.md';

async function initTemplate(opts: CliOptions): Promise<void> {
  const configPath = path.join(opts.outDir, CONFIG_FILE_NAME);

  // Read existing config as raw JSON so we preserve unknown fields and
  // can see the original "template" string (loadConfig only returns
  // resolved template content, not the path).
  let rawConfig: Record<string, unknown> = {};
  try {
    const text = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      rawConfig = parsed as Record<string, unknown>;
    }
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== 'ENOENT') {
      // Malformed JSON etc. — warn but proceed with empty config.
      console.warn(`Warning: could not read ${configPath} (${err.message ?? err.code}). Starting with empty config.`);
    }
  }

  const currentTemplate = typeof rawConfig.template === 'string' && rawConfig.template.trim()
    ? rawConfig.template
    : DEFAULT_TEMPLATE_REL;

  const baseName = path.basename(currentTemplate);
  const sourcePath = path.join(PACKAGE_ROOT, 'templates', baseName);

  try {
    await fs.stat(sourcePath);
  } catch {
    console.error(`Error: source template not found in cclog install: ${sourcePath}`);
    console.error(`(Derived from config template "${currentTemplate}".)`);
    process.exit(1);
  }

  const destDir = path.join(opts.outDir, 'templates');
  const destPath = path.join(destDir, baseName);
  await fs.mkdir(destDir, { recursive: true });

  let copied = false;
  try {
    await fs.stat(destPath);
    console.error(`Error: ${destPath} already exists. Skipping copy.`);
  } catch {
    await fs.copyFile(sourcePath, destPath);
    console.log(`Copied: ${sourcePath}`);
    console.log(`     -> ${destPath}`);
    copied = true;
  }

  // Rewrite config template field as "<outDirBasename>/templates/<name>",
  // resolved relative to the project root by the resolver.
  const outBase = path.basename(opts.outDir);
  const newTemplate = `${outBase}/templates/${baseName}`.replaceAll('\\', '/');
  rawConfig.template = newTemplate;

  await fs.mkdir(opts.outDir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(rawConfig, null, 2) + '\n', 'utf-8');
  console.log(`Updated: ${configPath}`);
  console.log(`     template: "${newTemplate}"`);

  if (!copied) {
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const r = parseArgs(process.argv);
  if (r.kind === 'help') { printHelp(); return; }
  if (r.kind === 'version') { console.log(PKG_VERSION); return; }
  if (r.kind === 'error') {
    console.error(r.msg);
    printHelp();
    process.exit(1);
  }
  const opts = r.opts;

  if (opts.initTemplate) {
    await initTemplate(opts);
    return;
  }

  await processProject(opts);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
