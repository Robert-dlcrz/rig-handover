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

export function readNight(runsDir: string, night: string): NightDigest {
  void runsDir;
  void night;
  throw new Error('readNight is not implemented');
}
