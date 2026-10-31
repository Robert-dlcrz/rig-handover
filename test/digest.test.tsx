import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';

function appFor(runsDir: string) {
  const config: RigConfig = {
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  };
  return createApp(config);
}

function jobsIn(html: string): string[] {
  const body = html.split('<tbody>')[1]?.split('</tbody>')[0] ?? '';
  return [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((row) => {
    const cell = row[1].match(/<td[^>]*>([\s\S]*?)<\/td>/);
    return cell?.[1] ?? '';
  });
}

describe('digest routes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(
    join(dir, '2026-10-28.jsonl'),
    [
      '{"at":"2026-10-28T01:00:00+01:00","job":"b","status":"ok","owner":"rook"}',
      '{"at":"2026-10-28T02:00:00+01:00","job":"a","status":"fail","owner":null,"error":"disk full"}',
      'not json',
      '',
    ].join('\n'),
  );
  writeFileSync(join(dir, '2026-10-27.jsonl'), '');

  it('renders 2026-10-28, marks a fail, and keeps a bad line', async () => {
    const res = await appFor(dir).request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<!doctype html>');
    expect(jobsIn(html)).toEqual(['a', 'b']);
    expect(html).toContain('disk full');
    expect(html).toContain('>—</td>');
    expect(html).toContain('class="warn">fail');
    expect(html).not.toContain('<script');
  });

  it('returns the same jobs in the same order as JSON', async () => {
    const page = await appFor(dir).request('/digest/2026-10-28');
    const api = await appFor(dir).request('/api/digest/2026-10-28');
    const body = (await api.json()) as { rows: { job: string }[]; badLines: number };
    expect(api.status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.rows.map((row) => row.job)).toEqual(jobsIn(await page.text()));
  });

  it('returns 404 when the night has no file', async () => {
    const page = await appFor(dir).request('/digest/2026-10-01');
    const api = await appFor(dir).request('/api/digest/2026-10-01');
    expect(page.status).toBe(404);
    expect(api.status).toBe(404);
  });

  it('renders nothing ran for an empty file', async () => {
    const page = await appFor(dir).request('/digest/2026-10-27');
    const api = await appFor(dir).request('/api/digest/2026-10-27');
    const body = (await api.json()) as { rows: unknown[] };
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');
    expect(api.status).toBe(200);
    expect(body.rows).toEqual([]);
  });
});
