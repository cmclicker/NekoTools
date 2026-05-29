import { describe, expect, it } from 'vitest';
import type { Entitlement } from '@nekotools/contracts';
import { EntitlementError, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';

import {
  FIXED_CLOCK,
  buildSecretsRegistration,
  createSecretTextParser,
} from '../index.js';
import type { SecretReport, SecretReportArtifact } from '../kinds.js';

/**
 * Full-exposure edge-case suite for NekoSecrets — the gold-standard template
 * the rest of the suite follows. Exercises adversarial input shapes (CRLF,
 * BOM, surrogate pairs, NUL/control bytes, huge buffers), detection boundary
 * conditions, redaction coalescing, configurable entropy deps, Pro export
 * corners, and — most importantly — the no-leak invariant: a raw secret must
 * never survive into ANY artifact or export.
 *
 * NOTE: NUL/control bytes are written as JS escapes (`\x00`…) so git keeps
 * this as a text blob, not a binary one; the runtime strings are identical.
 */

const clock = FIXED_CLOCK('2026-05-28T00:00:00.000Z');

const PRO: Entitlement = {
  version: 1,
  licenseId: 'TEST',
  licensee: 'Edge Tester',
  tier: 'pro',
  features: ['*'],
  issuedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: null,
  signature: 'test',
};

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(buildSecretsRegistration(clock));
  return r;
}

function scan(raw: string) {
  return runParser(registry(), 'secrets', 'secret.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });
}

function report(raw: string): SecretReport {
  return (scan(raw).artifacts[0] as SecretReportArtifact).value;
}

function ruleIds(raw: string): string[] {
  return report(raw).findings.map((f) => f.ruleId);
}

/** Every export surface (free + Pro) plus the raw artifact JSON. */
function everyExport(raw: string): string[] {
  const r = registry();
  const parsed = scan(raw);
  const payload = { artifacts: parsed.artifacts, diagnostics: [] };
  return [
    JSON.stringify(parsed.artifacts),
    String(runExporter(r, 'secrets', 'secret.export.json', payload).body),
    String(runExporter(r, 'secrets', 'secret.export.csv', payload).body),
    String(runExporter(r, 'secrets', 'secret.export.markdown.summary', payload).body),
    String(runExporter(r, 'secrets', 'secret.export.sarif', payload, PRO).body),
    String(runExporter(r, 'secrets', 'secret.export.redacted', payload, PRO).body),
    String(runExporter(r, 'secrets', 'secret.export.html', payload, PRO).body),
    String(runExporter(r, 'secrets', 'secret.export.baseline', payload, PRO).body),
  ];
}

function sarifResults(raw: string): Array<{ ruleId: string; level: string }> {
  const r = registry();
  const parsed = scan(raw);
  const body = String(
    runExporter(r, 'secrets', 'secret.export.sarif', { artifacts: parsed.artifacts, diagnostics: [] }, PRO).body,
  );
  return JSON.parse(body).runs[0].results;
}

const AWS = 'AKIAIOSFODNN7EXAMPLE'; // 20 chars, high severity
const AWS2 = 'AKIA1234567890ABCDEF'; // a second valid AWS key

describe('NekoSecrets edge: input shape & encoding', () => {
  it('treats CRLF line endings the same as LF for line/column', () => {
    const f = report(`x\r\nk=${AWS}`).findings.find((x) => x.ruleId === 'aws.access-key')!;
    expect(f.line).toBe(2);
    expect(f.column).toBe(3); // "k=" then the key at column 3
  });

  it('locates a secret at the very start of input (line 1, column 1)', () => {
    const f = report(AWS).findings[0]!;
    expect(f.ruleId).toBe('aws.access-key');
    expect(f.line).toBe(1);
    expect(f.column).toBe(1);
  });

  it('detects a secret with no trailing character (end of buffer)', () => {
    expect(ruleIds(`token=${AWS}`)).toContain('aws.access-key');
  });

  it('survives NUL + control bytes without throwing and still detects', () => {
    const noisy = '\x00\x01\x02\tk=' + AWS;
    expect(() => report(noisy)).not.toThrow();
    expect(ruleIds(noisy)).toContain('aws.access-key');
  });

  it('handles a leading UTF-8 BOM', () => {
    expect(ruleIds('﻿k=' + AWS)).toContain('aws.access-key');
  });

  it('redacts correctly across a surrogate-pair prefix (code-unit slicing)', () => {
    const red = report(`\u{1F600} k=${AWS}`).redactedText;
    expect(red).toBe('\u{1F600} k=[REDACTED:aws.access-key]');
    expect(red).not.toContain(AWS);
  });

  it('preserves multibyte text around a redacted secret', () => {
    const red = report(`café=☕ ${AWS} end`).redactedText;
    expect(red).toContain('café=☕');
    expect(red).toContain('end');
    expect(red).not.toContain(AWS);
  });
});

describe('NekoSecrets edge: detection boundaries', () => {
  it('does not double-report an AWS key via the entropy fallback', () => {
    const ids = ruleIds(AWS);
    expect(ids).toEqual(['aws.access-key']);
    expect(ids).not.toContain('entropy.high');
  });

  it('finds multiple secrets on one line with distinct columns', () => {
    const f = report(`${AWS} ${AWS2}`).findings.filter((x) => x.ruleId === 'aws.access-key');
    expect(f).toHaveLength(2);
    expect(f[0]!.column).toBe(1);
    expect(f[1]!.column).toBe(AWS.length + 2);
  });

  it('captures only the VALUE of a generic assignment, not the key', () => {
    const f = report('password = "hunter2hunter2"').findings.find((x) => x.ruleId === 'generic.assignment')!;
    expect(f.length).toBe('hunter2hunter2'.length);
    expect(f.column).toBe(13); // value starts after `password = "`
  });

  it('generic-assignment key matching is case-insensitive', () => {
    expect(ruleIds('PASSWORD: supersecretvalue')).toContain('generic.assignment');
  });

  it('ignores high-entropy tokens shorter than the 20-char minimum', () => {
    // 19 distinct chars, space-delimited so the tokenizer can't absorb a
    // neighbouring `=` (which is part of the entropy charset) to reach 20.
    expect(report('pad 0123456789abcdefghi end').findingCount).toBe(0);
  });

  it('ignores a long but low-entropy run (e.g. repeated chars)', () => {
    expect(report('pad=' + 'a'.repeat(40)).findingCount).toBe(0);
  });

  it('does not flag ordinary multi-line prose', () => {
    expect(report('the quick brown fox\njumps over\nthe lazy dog').findingCount).toBe(0);
  });
});

describe('NekoSecrets edge: redaction correctness & safety', () => {
  it('preserves surrounding text verbatim', () => {
    expect(report(`prefix ${AWS} suffix`).redactedText).toBe('prefix [REDACTED:aws.access-key] suffix');
  });

  it('coalesces overlapping rule hits into a single redaction', () => {
    // aws.access-key and generic.assignment both span the same value.
    const red = report(`api_key=${AWS}`).redactedText;
    expect(red).not.toContain(AWS);
    expect((red.match(/\[REDACTED:/g) ?? []).length).toBe(1);
  });

  it('redacts adjacent secrets separated only by punctuation', () => {
    const red = report(`${AWS},${AWS2}`).redactedText;
    expect(red).toBe('[REDACTED:aws.access-key],[REDACTED:aws.access-key]');
    expect(red).not.toContain(AWS);
    expect(red).not.toContain(AWS2);
  });

  it('returns the input unchanged when nothing is flagged', () => {
    expect(report('hello world').redactedText).toBe('hello world');
  });

  it('returns whitespace-only input unchanged (empty branch)', () => {
    expect(report('   ').redactedText).toBe('   ');
  });
});

describe('NekoSecrets edge: the no-leak invariant (full exposure)', () => {
  const cases: ReadonlyArray<{ label: string; line: string; raw: string }> = [
    { label: 'aws', line: `aws=${AWS}`, raw: AWS },
    { label: 'github', line: `gh=ghp_${'a'.repeat(36)}`, raw: `ghp_${'a'.repeat(36)}` },
    { label: 'stripe-live', line: `sk=sk_live_${'b'.repeat(24)}`, raw: `sk_live_${'b'.repeat(24)}` },
    { label: 'generic', line: 'password = "hunter2hunter2"', raw: 'hunter2hunter2' },
    {
      label: 'entropy',
      line: 'blob = Zk7Q9pX2vL4mN8rT1yB6cF3hJ0dK5sW7aE2gU9iO',
      raw: 'Zk7Q9pX2vL4mN8rT1yB6cF3hJ0dK5sW7aE2gU9iO',
    },
  ];

  for (const c of cases) {
    it(`never leaks the raw ${c.label} secret into any export`, () => {
      for (const out of everyExport(c.line)) {
        expect(out).not.toContain(c.raw);
      }
    });
  }

  it('never leaks any secret from a kitchen-sink multi-secret input', () => {
    const input = cases.map((c) => c.line).join('\n');
    const outs = everyExport(input);
    for (const c of cases) {
      for (const out of outs) expect(out).not.toContain(c.raw);
    }
    expect(report(input).findingCount).toBeGreaterThanOrEqual(cases.length);
  });

  it('masks short secrets (<=8 chars) entirely', () => {
    // An 8-char generic value is fully bulleted (no head/tail revealed).
    const f = report('pwd = "abcdefgh"').findings.find((x) => x.ruleId === 'generic.assignment')!;
    expect(f.preview).toBe('•'.repeat(8));
  });
});

describe('NekoSecrets edge: configurable entropy deps', () => {
  function findingsWith(raw: string, opts: { entropyThreshold?: number; entropyMinLength?: number }) {
    const parser = createSecretTextParser({ clock, ...opts });
    const art = parser.parse({ raw, source: { kind: 'paste', bytes: raw.length } })
      .artifacts[0] as SecretReportArtifact;
    return art.value.findings;
  }

  const TOKEN20 = '0123456789abcdefghij'; // 20 distinct chars → entropy ≈ 4.32

  it('a raised entropy threshold suppresses a borderline token', () => {
    expect(findingsWith(`x=${TOKEN20}`, {}).some((f) => f.ruleId === 'entropy.high')).toBe(true);
    expect(findingsWith(`x=${TOKEN20}`, { entropyThreshold: 4.5 }).some((f) => f.ruleId === 'entropy.high')).toBe(
      false,
    );
  });

  it('a raised minimum length suppresses a 25-char token', () => {
    const t = '0123456789abcdefghijklmno'; // 25 distinct chars
    expect(findingsWith(`x=${t}`, {}).some((f) => f.ruleId === 'entropy.high')).toBe(true);
    expect(findingsWith(`x=${t}`, { entropyMinLength: 30 }).some((f) => f.ruleId === 'entropy.high')).toBe(false);
  });
});

describe('NekoSecrets edge: Pro export corners', () => {
  it('emits valid SARIF with zero results for clean input', () => {
    const results = sarifResults('nothing to see here');
    expect(results).toEqual([]);
  });

  it('maps severities to SARIF levels (high→error, medium→warning, low→note)', () => {
    expect(sarifResults(AWS).find((r) => r.ruleId === 'aws.access-key')!.level).toBe('error');
    expect(
      sarifResults('password = "hunter2hunter2"').find((r) => r.ruleId === 'generic.assignment')!.level,
    ).toBe('warning');
    expect(
      sarifResults('blob = Zk7Q9pX2vL4mN8rT1yB6cF3hJ0dK5sW7aE2gU9iO').find((r) => r.ruleId === 'entropy.high')!
        .level,
    ).toBe('note');
  });

  it('the redacted exporter of clean input equals the input verbatim', () => {
    const r = registry();
    const parsed = scan('plain text, nothing secret');
    const body = String(
      runExporter(r, 'secrets', 'secret.export.redacted', { artifacts: parsed.artifacts, diagnostics: [] }, PRO).body,
    );
    expect(body).toBe('plain text, nothing secret');
  });

  it('still refuses Pro exports for a free caller even on clean input', () => {
    const r = registry();
    const parsed = scan('plain text');
    expect(() =>
      runExporter(r, 'secrets', 'secret.export.sarif', { artifacts: parsed.artifacts, diagnostics: [] }),
    ).toThrow(EntitlementError);
  });
});

describe('NekoSecrets edge: scale & determinism', () => {
  it('finds a single planted secret in a large (20k-line) buffer', () => {
    const prose = Array.from({ length: 20_000 }, () => 'the quick brown fox').join('\n');
    const r = report(`${prose}\nleak=${AWS}`);
    const aws = r.findings.filter((f) => f.ruleId === 'aws.access-key');
    expect(aws).toHaveLength(1);
    expect(aws[0]!.line).toBe(20_001);
  });

  it('is deterministic across repeated scans', () => {
    const input = `aws=${AWS}\npassword = "hunter2hunter2"\nblob = Zk7Q9pX2vL4mN8rT1yB6cF3hJ0dK5sW7aE2gU9iO`;
    expect(report(input).findings).toEqual(report(input).findings);
  });

  it('keeps findingCount in lockstep with findings.length', () => {
    for (const input of ['', '   ', 'clean', AWS, `${AWS}\n${AWS2}`]) {
      const rep = report(input);
      expect(rep.findingCount).toBe(rep.findings.length);
    }
  });

  it('returns findings sorted by line, then column', () => {
    const rep = report(`z=${AWS2}\na=${AWS}`);
    const lines = rep.findings.map((f) => f.line);
    expect(lines).toEqual([...lines].sort((a, b) => a - b));
  });
});
