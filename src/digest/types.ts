import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type DigestStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: DigestStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type StatusCounts = { ok: number; retry: number; fail: number };

export type NightDigest = {
  rows: DigestRow[];
  badLines: number;
  counts: StatusCounts;
};

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = new Set<DigestStatus>(['ok', 'retry', 'fail']);

type ParsedLine = {
  at: string;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error: string | null;
};

type Acc = DigestRow & { firstMs: number; lastMs: number; errorAt: string; errorMs: number };

export function isNight(night: string): boolean {
  return NIGHT.test(night);
}

function earlier(a: string, aMs: number, b: string, bMs: number): boolean {
  if (!Number.isNaN(aMs) && !Number.isNaN(bMs)) return aMs < bMs;
  return a < b;
}

function parseLine(line: string): ParsedLine | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.at !== 'string' || typeof row.job !== 'string') return null;
  if (typeof row.status !== 'string' || !STATUSES.has(row.status as DigestStatus)) return null;
  if (!(typeof row.owner === 'string' || row.owner === null)) return null;
  if (row.error !== undefined && typeof row.error !== 'string') return null;
  return {
    at: row.at,
    job: row.job,
    status: row.status as DigestStatus,
    owner: row.owner,
    error: typeof row.error === 'string' ? row.error : null,
  };
}

// One row per job. A line that does not parse is counted and skipped.
// `lastError` is the latest error that job logged, kept as written.
export function readNight(runsDir: string, night: string): NightDigest {
  const text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;
  const byJob = new Map<string, Acc>();

  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const parsed = parseLine(line);
    if (!parsed) {
      badLines += 1;
      continue;
    }
    const ms = Date.parse(parsed.at);
    counts[parsed.status] += 1;
    const prev = byJob.get(parsed.job);
    if (!prev) {
      byJob.set(parsed.job, {
        job: parsed.job,
        owner: parsed.owner,
        runs: 1,
        retries: parsed.status === 'retry' ? 1 : 0,
        lastStatus: parsed.status,
        lastError: parsed.error,
        firstAt: parsed.at,
        lastAt: parsed.at,
        firstMs: ms,
        lastMs: ms,
        errorAt: parsed.error ? parsed.at : '',
        errorMs: parsed.error ? ms : Number.NaN,
      });
      continue;
    }
    prev.runs += 1;
    if (parsed.status === 'retry') prev.retries += 1;
    if (earlier(parsed.at, ms, prev.firstAt, prev.firstMs)) {
      prev.firstAt = parsed.at;
      prev.firstMs = ms;
    }
    if (!earlier(parsed.at, ms, prev.lastAt, prev.lastMs)) {
      prev.lastAt = parsed.at;
      prev.lastMs = ms;
      prev.lastStatus = parsed.status;
      prev.owner = parsed.owner;
    }
    if (parsed.error && (prev.errorAt === '' || !earlier(parsed.at, ms, prev.errorAt, prev.errorMs))) {
      prev.lastError = parsed.error;
      prev.errorAt = parsed.at;
      prev.errorMs = ms;
    }
  }

  const rows: DigestRow[] = [...byJob.values()]
    .sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0))
    .map(({ firstMs: _f, lastMs: _l, errorAt: _a, errorMs: _e, ...row }) => row);

  return { rows, badLines, counts };
}

export function loadNight(runsDir: string, night: string): NightDigest | null {
  if (!isNight(night)) return null;
  const file = join(runsDir, `${night}.jsonl`);
  if (!existsSync(file)) return null;
  return readNight(runsDir, night);
}
