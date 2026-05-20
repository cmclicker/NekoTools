// offline-guard:allow — test fixtures intentionally contain banned patterns
// so the scanner has something to catch.
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scan } from '../scanner.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'offline-guard-'));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

async function write(rel: string, content: string) {
  const full = path.join(tmp, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content);
}

describe('offline-guard scanner', () => {
  it('passes a clean tree', async () => {
    await write('packages/x/package.json', JSON.stringify({ name: 'x', dependencies: {} }));
    await write('packages/x/src/index.ts', 'export const ok = 1;\n');
    const report = await scan(tmp);
    expect(report.violations).toEqual([]);
  });

  it('flags a forbidden dependency', async () => {
    await write(
      'packages/x/package.json',
      JSON.stringify({
        name: 'x',
        dependencies: { '@sentry/node': '^7.0.0' },
      }),
    );
    const report = await scan(tmp);
    expect(report.violations.some((v) => v.kind === 'dependency')).toBe(true);
  });

  it('flags a forbidden dev dependency', async () => {
    await write(
      'packages/x/package.json',
      JSON.stringify({
        name: 'x',
        devDependencies: { 'posthog-js': '^1.0.0' },
      }),
    );
    const report = await scan(tmp);
    expect(report.violations.some((v) => v.kind === 'dependency')).toBe(true);
  });

  it('flags a remote CDN reference in source', async () => {
    await write('packages/x/package.json', JSON.stringify({ name: 'x' }));
    await write(
      'packages/x/src/index.ts',
      "import x from 'https://cdn.jsdelivr.net/npm/foo';\n",
    );
    const report = await scan(tmp);
    expect(report.violations.some((v) => v.kind === 'import')).toBe(true);
  });

  it('flags a literal fetch() to an external URL', async () => {
    await write('packages/x/package.json', JSON.stringify({ name: 'x' }));
    await write(
      'packages/x/src/index.ts',
      "export async function load() { return fetch('https://example.com/api'); }\n",
    );
    const report = await scan(tmp);
    expect(report.violations.some((v) => v.kind === 'fetch')).toBe(true);
  });

  it('skips node_modules', async () => {
    await write(
      'node_modules/@sentry/node/package.json',
      JSON.stringify({ name: '@sentry/node', dependencies: { '@sentry/types': '*' } }),
    );
    const report = await scan(tmp);
    expect(report.violations).toEqual([]);
  });
});
