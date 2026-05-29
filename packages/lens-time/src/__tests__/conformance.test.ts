import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import type { Workspace } from '@nekotools/contracts';
import {
  ToolRegistry,
  jsonWorkspaceSerializer,
  runExporter,
  runParser,
  validateManifest,
} from '@nekotools/tool-runtime';
import { validate } from '@nekotools/schemas';

import {
  buildTimeRegistration,
  FIXED_CLOCK,
  resolveTimeInput,
  timeManifest,
  TIME_KIND_INSTANT,
} from '../index.js';
import type { TimeInstant, TimeInstantArtifact } from '../kinds.js';

const NOW = '2026-05-27T00:00:00.000Z';
const NOW_MS = Date.parse(NOW);
const clock = FIXED_CLOCK(NOW);

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(buildTimeRegistration(clock));
  return r;
}

function parse(raw: string) {
  return runParser(registry(), 'time', 'time.parse', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });
}

function instantOf(raw: string): TimeInstant {
  const artifact = parse(raw).artifacts.find(
    (a) => a.kind === TIME_KIND_INSTANT,
  ) as TimeInstantArtifact;
  return artifact.value;
}

describe('NekoTime: manifest', () => {
  it('passes schema + cross-field validation', () => {
    const result = validateManifest(timeManifest);
    expect(result.ok, result.errors.join('; ')).toBe(true);
  });

  it('declares a network-forbidden offline policy', () => {
    expect(timeManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });

  it('declares Pro features even though the free build ships only free ones', () => {
    expect(timeManifest.entitlements.pro.length).toBeGreaterThan(0);
    expect(timeManifest.entitlements.free).toContain('parse');
  });

  it('capabilities reflect current-build truth (no diff, no graph)', () => {
    expect(timeManifest.capabilities.canSaveWorkspace).toBe(true);
    expect(timeManifest.capabilities.canExport).toBe(true);
    expect(timeManifest.capabilities.canDiff).toBe(false);
    expect(timeManifest.capabilities.canProjectGraph).toBe(false);
  });

  it('declares an out-of-scope list covering cron + calendars', () => {
    expect(timeManifest.outOfScope.some((s) => /cron/i.test(s))).toBe(true);
    expect(timeManifest.outOfScope.some((s) => /calendar/i.test(s))).toBe(true);
  });
});

describe('NekoTime: monetization safety', () => {
  const registration = buildTimeRegistration(clock);
  const proExporterIds = ['time.export.batch.csv', 'time.export.timezone.board'];

  it('no Pro exporter is registered in the free build', () => {
    const registered = new Set(registration.exporters.map((e) => e.id));
    for (const id of proExporterIds) expect(registered.has(id)).toBe(false);
  });

  it('no graph projector is registered in the free build', () => {
    expect(registration.graphProjectors ?? []).toHaveLength(0);
  });

  it('runExporter throws "unknown exporter" for every Pro exporter id', () => {
    const r = registry();
    for (const id of proExporterIds) {
      expect(() => runExporter(r, 'time', id, { artifacts: [], diagnostics: [] })).toThrow(
        /unknown exporter/,
      );
    }
  });

  it('the manifest declares Pro exporters that are NOT in the registered set', () => {
    const registered = new Set(registration.exporters.map((e) => e.id));
    for (const id of proExporterIds) {
      expect(timeManifest.exporters).toContain(id);
      expect(registered.has(id)).toBe(false);
    }
  });

  it('free entitlements match exactly the implemented vertical-slice set', () => {
    const expectedFree = new Set([
      'parse',
      'convert.units',
      'inspect.offset',
      'relative.age',
      'export.json',
      'export.markdown.summary',
      'workspace.save',
      'view.summary',
      'copy.value',
    ]);
    expect(new Set(timeManifest.entitlements.free)).toEqual(expectedFree);
  });
});

describe('NekoTime: time.parse parser', () => {
  it('reads a bare integer as Unix seconds', () => {
    const result = parse('1700000000');
    expect(result.artifacts).toHaveLength(1);
    const instant = (result.artifacts[0] as TimeInstantArtifact).value;
    expect(instant.interpretation).toBe('unix-seconds');
    expect(instant.iso).toBe('2023-11-14T22:13:20.000Z');
    expect(instant.epochSeconds).toBe(1700000000);
    expect(instant.epochMillis).toBe(1700000000000);
  });

  it('reads a large bare integer as Unix milliseconds', () => {
    const instant = instantOf('1700000000000');
    expect(instant.interpretation).toBe('unix-milliseconds');
    expect(instant.iso).toBe('2023-11-14T22:13:20.000Z');
    expect(instant.epochSeconds).toBe(1700000000);
  });

  it('parses an ISO-8601 UTC string', () => {
    const instant = instantOf('2023-11-14T22:13:20.000Z');
    expect(instant.interpretation).toBe('iso-8601');
    expect(instant.epochMillis).toBe(1700000000000);
  });

  it('parses an ISO date-only string as UTC midnight', () => {
    const instant = instantOf('2026-05-27');
    expect(instant.interpretation).toBe('iso-8601');
    expect(instant.iso).toBe('2026-05-27T00:00:00.000Z');
  });

  it('emits time.invalid_input (error, no artifact) for unrecognizable input', () => {
    const result = parse('definitely not a date');
    expect(result.artifacts).toHaveLength(0);
    const diag = result.diagnostics.find((d) => d.code === 'time.invalid_input');
    expect(diag?.severity).toBe('error');
  });

  it('emits time.empty_input (info, no artifact) for empty / whitespace input', () => {
    for (const raw of ['', '   ']) {
      const result = parse(raw);
      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics.find((d) => d.code === 'time.empty_input')?.severity).toBe('info');
    }
  });

  it('emits the time.unit_heuristic note for numeric input, naming the chosen unit', () => {
    const seconds = parse('1700000000');
    const sDiag = seconds.diagnostics.find((d) => d.code === 'time.unit_heuristic');
    expect(sDiag?.severity).toBe('info');
    expect(sDiag?.message).toMatch(/seconds/);

    const millis = parse('1700000000000');
    const mDiag = millis.diagnostics.find((d) => d.code === 'time.unit_heuristic');
    expect(mDiag?.message).toMatch(/milliseconds/);
  });

  it('applies the seconds/ms boundary heuristic at 1e11', () => {
    // Just below the boundary → seconds; at/above → milliseconds.
    expect(instantOf('99999999999').interpretation).toBe('unix-seconds');
    expect(instantOf('100000000000').interpretation).toBe('unix-milliseconds');
  });

  it('flags a non-ISO human date string as ambiguous (locale-dependent)', () => {
    const result = parse('May 27 2026');
    expect(result.artifacts).toHaveLength(1);
    expect((result.artifacts[0] as TimeInstantArtifact).value.interpretation).toBe('date-string');
    expect(result.diagnostics.find((d) => d.code === 'time.ambiguous_input')?.severity).toBe(
      'warning',
    );
  });

  it('emits time.out_of_range (error, no artifact) for an over-large numeric timestamp', () => {
    const result = parse('99999999999999999999');
    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics.find((d) => d.code === 'time.out_of_range')?.severity).toBe('error');
  });

  it('never throws on hostile input and surfaces an error diagnostic', () => {
    const call = () => parse('@#$%^&*');
    expect(call).not.toThrow();
    expect(call().diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });

  it('produces a time.instant artifact that validates against the artifact schema', () => {
    const artifact = parse('1700000000').artifacts.find((a) => a.kind === TIME_KIND_INSTANT)!;
    const validation = validate('artifact', artifact);
    expect(validation.ok, validation.errors.join('; ')).toBe(true);
  });

  it('exposes resolveTimeInput as a pure, clock-injected core', () => {
    const { instant } = resolveTimeInput('1700000000', NOW_MS);
    expect(instant?.interpretation).toBe('unix-seconds');
    expect(instant?.iso).toBe('2023-11-14T22:13:20.000Z');
  });
});

describe('NekoTime: relative age (from the injected clock)', () => {
  it('labels a past instant as "ago" and not future', () => {
    const past = instantOf('2020-01-01T00:00:00.000Z');
    expect(past.relative.isFuture).toBe(false);
    expect(past.relative.label).toMatch(/ago$/);
    expect(past.relative.deltaMs).toBeGreaterThan(0);
  });

  it('labels a future instant as "in …"', () => {
    const future = instantOf('2030-01-01T00:00:00.000Z');
    expect(future.relative.isFuture).toBe(true);
    expect(future.relative.label).toMatch(/^in /);
    expect(future.relative.deltaMs).toBeLessThan(0);
  });

  it('labels an instant equal to now as "just now"', () => {
    const here = instantOf(NOW);
    expect(here.relative.deltaMs).toBe(0);
    expect(here.relative.label).toBe('just now');
    expect(here.relative.isFuture).toBe(false);
  });
});

describe('NekoTime: local time + offset', () => {
  it('produces a well-formed offset label, numeric offset, and a host zone', () => {
    const local = instantOf('1700000000').local;
    expect(local.offsetLabel).toMatch(/^[+-]\d{2}:\d{2}$/);
    expect(typeof local.offsetMinutes).toBe('number');
    expect(local.timeZone.length).toBeGreaterThan(0);
    expect(local.formatted.length).toBeGreaterThan(0);
  });
});

describe('NekoTime: exporters', () => {
  it('time.export.json emits the instant as JSON', () => {
    const r = registry();
    const artifact = parse('1700000000').artifacts.find((a) => a.kind === TIME_KIND_INSTANT)!;
    const out = runExporter(r, 'time', 'time.export.json', { artifacts: [artifact], diagnostics: [] });
    const parsed = JSON.parse(String(out.body));
    expect(parsed.iso).toBe('2023-11-14T22:13:20.000Z');
    expect(parsed.epochSeconds).toBe(1700000000);
  });

  it('time.export.iso emits just the ISO UTC string', () => {
    const r = registry();
    const artifact = parse('1700000000').artifacts.find((a) => a.kind === TIME_KIND_INSTANT)!;
    const out = runExporter(r, 'time', 'time.export.iso', { artifacts: [artifact], diagnostics: [] });
    expect(String(out.body)).toBe('2023-11-14T22:13:20.000Z');
    expect(out.extension).toBe('txt');
  });

  it('time.export.markdown.summary describes the instant + diagnostics', () => {
    const r = registry();
    const parsed = parse('1700000000');
    const artifact = parsed.artifacts.find((a) => a.kind === TIME_KIND_INSTANT)!;
    const out = runExporter(r, 'time', 'time.export.markdown.summary', {
      artifacts: [artifact],
      diagnostics: parsed.diagnostics,
    });
    const body = String(out.body);
    expect(body).toContain('# NekoTime');
    expect(body).toContain('ISO (UTC)');
    expect(body).toContain('2023-11-14T22:13:20.000Z');
    expect(body).toContain('time.unit_heuristic');
  });
});

describe('NekoTime: workspace round-trip', () => {
  it('a single-instant workspace round-trips losslessly', () => {
    const parsed = parse('1700000000');
    const ws: Workspace = {
      version: 1,
      id: 'ws_time_single',
      toolId: 'time',
      toolVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
      uiState: { viewMode: 'summary' },
    };
    const back = jsonWorkspaceSerializer.deserialize(jsonWorkspaceSerializer.serialize(ws));
    expect(back).toEqual(ws);
  });
});

describe('NekoTime: engine determinism', () => {
  it('never calls no-arg new Date() in the engine source (now comes from the clock)', () => {
    const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');
    const noArgNewDate = /new Date\(\s*\)/;
    const offenders: string[] = [];
    for (const file of collectEngineTsFiles(srcDir)) {
      // Scan code only — strip comments so prose that *mentions*
      // `new Date()` (such as this guard's own rationale in the engine
      // doc-comments) is not mistaken for a call.
      const code = stripComments(readFileSync(file, 'utf8'));
      if (noArgNewDate.test(code)) offenders.push(file);
    }
    expect(offenders, `no-arg new Date() found in: ${offenders.join(', ')}`).toEqual([]);
  });
});

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments (JSDoc included)
    .replace(/\/\/.*$/gm, ''); // line comments
}

function collectEngineTsFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__') continue; // guard the engine, not the tests
      collectEngineTsFiles(full, acc);
    } else if (name.endsWith('.ts')) {
      acc.push(full);
    }
  }
  return acc;
}
