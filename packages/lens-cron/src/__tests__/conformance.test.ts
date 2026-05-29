import { describe, expect, it } from 'vitest';
import type { Artifact, Workspace } from '@nekotools/contracts';
import {
  ToolRegistry,
  jsonWorkspaceSerializer,
  runExporter,
  runParser,
  validateManifest,
} from '@nekotools/tool-runtime';
import { validate } from '@nekotools/schemas';

import { FIXED_CLOCK, buildCronRegistration, cronManifest } from '../index.js';
import type { CronParsedArtifact } from '../kinds.js';

// A Thursday, 00:00:00 UTC — fixed so next-run times are deterministic.
const clock = FIXED_CLOCK('2026-05-28T00:00:00.000Z');

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(buildCronRegistration(clock));
  return r;
}

function parse(raw: string) {
  return runParser(registry(), 'cron', 'cron.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });
}

function val(raw: string) {
  return (parse(raw).artifacts[0] as CronParsedArtifact).value;
}

function fieldValues(raw: string, name: string): readonly number[] {
  return val(raw).fields!.find((f) => f.name === name)!.values;
}

describe('NekoCron: manifest', () => {
  it('passes schema + cross-field validation', () => {
    const result = validateManifest(cronManifest);
    expect(result.ok, result.errors.join('; ')).toBe(true);
  });

  it('declares network-forbidden offline policy', () => {
    expect(cronManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });

  it('free entitlements match exactly the implemented vertical-slice set', () => {
    expect(new Set(cronManifest.entitlements.free)).toEqual(
      new Set([
        'parse',
        'inspect.fields',
        'describe',
        'next-runs',
        'diagnostics.range',
        'export.json',
        'export.next-runs',
        'export.markdown.summary',
        'copy.output',
        'workspace.save',
      ]),
    );
  });
});

describe('NekoCron: monetization safety', () => {
  const registration = buildCronRegistration(clock);
  const proExporterIds = ['cron.export.ical', 'cron.export.timezone.report'];

  it('no Pro exporter is registered, and each throws "unknown exporter"', () => {
    const registered = new Set(registration.exporters.map((e) => e.id));
    const r = registry();
    for (const id of proExporterIds) {
      expect(registered.has(id)).toBe(false);
      expect(cronManifest.exporters).toContain(id);
      expect(() => runExporter(r, 'cron', id, { artifacts: [], diagnostics: [] })).toThrow(
        /unknown exporter/,
      );
    }
  });
});

describe('NekoCron: field expansion', () => {
  it('expands */15 into [0,15,30,45]', () => {
    expect(fieldValues('*/15 * * * *', 'minute')).toEqual([0, 15, 30, 45]);
  });

  it('expands ranges (1-5)', () => {
    expect(fieldValues('1-5 * * * *', 'minute')).toEqual([1, 2, 3, 4, 5]);
  });

  it('expands month names (JAN-MAR)', () => {
    expect(fieldValues('0 0 1 JAN-MAR *', 'month')).toEqual([1, 2, 3]);
  });

  it('treats day-of-week 7 as Sunday (0)', () => {
    expect(fieldValues('0 0 * * 7', 'day-of-week')).toEqual([0]);
  });

  it('expands a comma list with a step', () => {
    expect(fieldValues('0 0,12 * * *', 'hour')).toEqual([0, 12]);
  });
});

describe('NekoCron: next run times (UTC, deterministic)', () => {
  it('every 15 minutes from midnight', () => {
    expect(val('*/15 * * * *').nextRuns.slice(0, 3)).toEqual([
      '2026-05-28T00:15:00.000Z',
      '2026-05-28T00:30:00.000Z',
      '2026-05-28T00:45:00.000Z',
    ]);
  });

  it('@daily → next midnight', () => {
    expect(val('@daily').nextRuns[0]).toBe('2026-05-29T00:00:00.000Z');
    expect(val('@daily').expression).toBe('0 0 * * *');
  });

  it('weekday 9am only lands on Mon–Fri at 09:00', () => {
    const runs = val('0 9 * * 1-5').nextRuns;
    expect(runs).toHaveLength(5);
    for (const r of runs) {
      expect(r.endsWith('T09:00:00.000Z')).toBe(true);
      const dow = new Date(r).getUTCDay();
      expect(dow >= 1 && dow <= 5).toBe(true);
    }
  });

  it('6-field (seconds) form steps by seconds', () => {
    expect(val('*/30 * * * * *').nextRuns[0]).toBe('2026-05-28T00:00:30.000Z');
    expect(val('*/30 * * * * *').kind).toBe('seconds');
  });

  it('a yearly date lands on the next occurrence', () => {
    expect(val('0 0 1 JAN *').nextRuns[0]).toBe('2027-01-01T00:00:00.000Z');
  });

  it('DOM and DOW both restricted is an OR (either matches)', () => {
    // 1st of the month OR any Monday.
    const runs = val('0 0 1 * MON').nextRuns;
    expect(runs.length).toBeGreaterThan(0);
    for (const r of runs) {
      const d = new Date(r);
      expect(d.getUTCDate() === 1 || d.getUTCDay() === 1).toBe(true);
    }
  });
});

describe('NekoCron: description', () => {
  it('describes a step schedule', () => {
    expect(val('*/15 * * * *').description).toContain('every 15 minutes');
  });

  it('describes a fixed time of day', () => {
    expect(val('30 9 * * *').description).toContain('at 09:30');
  });
});

describe('NekoCron: diagnostics', () => {
  it('emits cron.empty_input for empty input', () => {
    expect(parse('   ').diagnostics.map((d) => d.code)).toContain('cron.empty_input');
  });

  it('emits cron.parse_error for the wrong field count', () => {
    const d = parse('* * *').diagnostics.find((x) => x.code === 'cron.parse_error');
    expect(d?.severity).toBe('error');
    expect(val('* * *').valid).toBe(false);
  });

  it('emits cron.out_of_range for an out-of-range value', () => {
    expect(parse('99 * * * *').diagnostics.find((d) => d.code === 'cron.out_of_range')?.severity).toBe(
      'error',
    );
  });

  it('emits cron.unsupported for Quartz extensions (L/W/#/?)', () => {
    expect(parse('0 0 L * *').diagnostics.map((d) => d.code)).toContain('cron.unsupported');
  });

  it('@reboot is valid but produces no scheduled runs + a cron.reboot info', () => {
    const result = parse('@reboot');
    expect(result.diagnostics.map((d) => d.code)).toContain('cron.reboot');
    const v = (result.artifacts[0] as CronParsedArtifact).value;
    expect(v.valid).toBe(true);
    expect(v.nextRuns).toEqual([]);
  });

  it('produces a cron.parsed artifact that validates against the artifact schema', () => {
    const validation = validate('artifact', parse('*/5 * * * *').artifacts[0] as Artifact);
    expect(validation.ok, validation.errors.join('; ')).toBe(true);
  });
});

describe('NekoCron: exporters', () => {
  it('cron.export.json emits the parsed structure', () => {
    const out = runExporter(registry(), 'cron', 'cron.export.json', {
      artifacts: parse('*/15 * * * *').artifacts,
      diagnostics: [],
    });
    expect(JSON.parse(String(out.body)).expression).toBe('*/15 * * * *');
  });

  it('cron.export.next-runs emits one ISO timestamp per line', () => {
    const out = runExporter(registry(), 'cron', 'cron.export.next-runs', {
      artifacts: parse('*/15 * * * *').artifacts,
      diagnostics: [],
    });
    const rows = String(out.body).split('\n');
    expect(rows[0]).toBe('2026-05-28T00:15:00.000Z');
    expect(rows).toHaveLength(5);
  });

  it('cron.export.markdown.summary includes description + next runs', () => {
    const out = runExporter(registry(), 'cron', 'cron.export.markdown.summary', {
      artifacts: parse('*/15 * * * *').artifacts,
      diagnostics: [],
    });
    const body = String(out.body);
    expect(body).toContain('# NekoCron export');
    expect(body).toContain('Next runs (UTC)');
  });

  it('the exporter refuses a foreign artifact kind', () => {
    const foreign = { ...(parse('* * * * *').artifacts[0] as Artifact), kind: 'json.value' } as Artifact;
    for (const id of ['cron.export.json', 'cron.export.next-runs', 'cron.export.markdown.summary']) {
      expect(() =>
        runExporter(registry(), 'cron', id, { artifacts: [foreign], diagnostics: [] }),
      ).toThrow(/does not accept artifact kind/);
    }
  });
});

describe('NekoCron: workspace round-trip', () => {
  it('a parsed-cron workspace round-trips losslessly', () => {
    const parsed = parse('0 9 * * 1-5');
    const ws: Workspace = {
      version: 1,
      id: 'ws_cron_single',
      toolId: 'cron',
      toolVersion: 1,
      createdAt: '2026-05-28T00:00:00.000Z',
      updatedAt: '2026-05-28T00:00:00.000Z',
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
      uiState: { viewMode: 'next-runs' },
    };
    const back = jsonWorkspaceSerializer.deserialize(jsonWorkspaceSerializer.serialize(ws));
    expect(back).toEqual(ws);
  });
});
