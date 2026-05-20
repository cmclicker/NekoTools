import { promises as fs } from 'node:fs';
import type { Dirent } from 'node:fs';
import path from 'node:path';

import { DEPENDENCY_DENYLIST, IMPORT_DENYLIST, SOURCE_URL_PATTERN } from './denylist.js';

export interface ScanReport {
  readonly violations: readonly Violation[];
  readonly scannedFiles: number;
  readonly scannedPackages: number;
}

export interface Violation {
  readonly kind: 'dependency' | 'import' | 'fetch';
  readonly file: string;
  readonly detail: string;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

const SKIP_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.turbo',
  '.cache',
  'coverage',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

/**
 * The scanner itself must contain the patterns it scans for — they are
 * its data. A file may opt out with the marker below. Use sparingly: any
 * exempt file is a place where the doctrine is enforced by hand, not by
 * CI.
 */
const ALLOW_MARKER = 'offline-guard:allow';

/**
 * Walks the repo from `root`, scanning package.json files against the
 * dependency denylist and source files against the import/URL denylists.
 * Test directories are scanned too — telemetry imports do not get a pass
 * because they are "only in a test."
 */
export async function scan(root: string): Promise<ScanReport> {
  const violations: Violation[] = [];
  let scannedFiles = 0;
  let scannedPackages = 0;

  async function walk(dir: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.github') continue;
      if (SKIP_DIRECTORIES.has(entry.name)) continue;

      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }

      if (entry.name === 'package.json') {
        scannedPackages += 1;
        violations.push(...(await scanPackageJson(full)));
        continue;
      }

      const ext = path.extname(entry.name);
      if (SOURCE_EXTENSIONS.has(ext)) {
        scannedFiles += 1;
        violations.push(...(await scanSourceFile(full)));
      }
    }
  }

  await walk(root);
  return { violations, scannedFiles, scannedPackages };
}

async function scanPackageJson(file: string): Promise<Violation[]> {
  const raw = await fs.readFile(file, 'utf8');
  let pkg: PackageJson;
  try {
    pkg = JSON.parse(raw) as PackageJson;
  } catch {
    return [];
  }
  const out: Violation[] = [];
  const sections: Array<keyof PackageJson> = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ];
  for (const section of sections) {
    const deps = pkg[section];
    if (!deps) continue;
    for (const name of Object.keys(deps)) {
      for (const banned of DEPENDENCY_DENYLIST) {
        if (name === banned || name.startsWith(banned)) {
          out.push({
            kind: 'dependency',
            file,
            detail: `forbidden ${section} entry: ${name} (matches "${banned}")`,
          });
        }
      }
    }
  }
  return out;
}

async function scanSourceFile(file: string): Promise<Violation[]> {
  const raw = await fs.readFile(file, 'utf8');
  const out: Violation[] = [];

  if (raw.includes(ALLOW_MARKER)) {
    return out;
  }

  for (const banned of IMPORT_DENYLIST) {
    if (raw.includes(banned)) {
      out.push({
        kind: 'import',
        file,
        detail: `forbidden remote reference: ${banned}`,
      });
    }
  }

  SOURCE_URL_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SOURCE_URL_PATTERN.exec(raw)) !== null) {
    out.push({
      kind: 'fetch',
      file,
      detail: `literal fetch() to an external URL: "${match[0]}..."`,
    });
  }

  return out;
}
