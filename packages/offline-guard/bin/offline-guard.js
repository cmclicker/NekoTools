#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { scan } from '../src/scanner.ts';

const root = path.resolve(process.argv[2] ?? path.join(process.cwd(), '..', '..'));

const report = await scan(root);

console.log(
  `[offline-guard] scanned ${report.scannedFiles} source files across ${report.scannedPackages} package.json files`,
);

if (report.violations.length === 0) {
  console.log('[offline-guard] no violations.');
  process.exit(0);
}

for (const v of report.violations) {
  console.error(`[offline-guard] ${v.kind}: ${v.file}: ${v.detail}`);
}

console.error(`[offline-guard] FAIL — ${report.violations.length} violation(s).`);
process.exit(1);
