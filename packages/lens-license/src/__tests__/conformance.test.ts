import { describe, expect, it } from 'vitest';
import type { Artifact, Entitlement, Workspace } from '@nekotools/contracts';
import {
  EntitlementError,
  ToolRegistry,
  jsonWorkspaceSerializer,
  runExporter,
  runParser,
  validateManifest,
} from '@nekotools/tool-runtime';
import { validate } from '@nekotools/schemas';

import {
  FIXED_CLOCK,
  auditLicense,
  buildLicenseRegistration,
  detectLicense,
  licenseManifest,
} from '../index.js';
import type { LicenseParsedArtifact } from '../kinds.js';

const PRO: Entitlement = {
  version: 1,
  licenseId: 'TEST',
  licensee: 'Test User',
  tier: 'pro',
  features: ['*'],
  issuedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: null,
  signature: 'test',
};

const clock = FIXED_CLOCK('2026-05-28T00:00:00.000Z');

const MIT = 'MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software...';
const APACHE = 'Apache License\nVersion 2.0, January 2004\nhttp://www.apache.org/licenses/';
const GPL3 = 'GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007';
const BSD3 = 'Redistribution and use in source and binary forms, with or without modification...\nNeither the name of the copyright holder...';
const ISC = 'ISC License\n\nPermission to use, copy, modify, and/or distribute this software for any purpose...';

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(buildLicenseRegistration(clock));
  return r;
}

function parse(raw: string) {
  return runParser(registry(), 'license', 'license.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });
}

function report(raw: string) {
  return (parse(raw).artifacts[0] as LicenseParsedArtifact).value;
}

describe('NekoLicense: manifest', () => {
  it('passes schema + cross-field validation', () => {
    expect(validateManifest(licenseManifest).ok).toBe(true);
  });
  it('declares network-forbidden offline policy', () => {
    expect(licenseManifest.offlinePolicy.networkPolicy).toBe('network-forbidden');
  });
  it('free entitlements match the implemented slice', () => {
    expect(new Set(licenseManifest.entitlements.free)).toEqual(
      new Set([
        'detect',
        'inspect.terms',
        'read.spdx-tag',
        'diagnostics.detection',
        'export.json',
        'export.normalized',
        'export.markdown.summary',
        'copy.output',
        'workspace.save',
      ]),
    );
  });
});

describe('NekoLicense: monetization gating (single-build, entitlement-gated)', () => {
  const proExporterIds = ['license.export.audit.report', 'license.export.sarif'];

  it('Pro exporters are declared AND registered as proExporters, not free', () => {
    const reg = buildLicenseRegistration(clock);
    const proIds = new Set((reg.proExporters ?? []).map((e) => e.id));
    for (const id of proExporterIds) {
      expect(licenseManifest.exporters).toContain(id);
      expect(proIds.has(id)).toBe(true);
      expect(reg.exporters.some((e) => e.id === id)).toBe(false);
    }
  });

  it('does not register the future compatibility/notice generators as exporters', () => {
    expect(licenseManifest.exporters).not.toContain('license.export.compatibility');
    expect(licenseManifest.exporters).not.toContain('license.export.notice');
    expect(licenseManifest.entitlements.pro).toContain('export.compatibility');
    expect(licenseManifest.entitlements.pro).toContain('export.notice');
  });

  it('a free caller (default entitlement) is refused with EntitlementError', () => {
    const r = registry();
    const parsed = parse(GPL3);
    for (const id of proExporterIds) {
      expect(() => runExporter(r, 'license', id, parsed)).toThrow(EntitlementError);
    }
  });

  it('a Pro entitlement unlocks the obligations audit + SARIF exporters', () => {
    const r = registry();
    const parsed = parse(GPL3);

    const auditReport = String(
      runExporter(r, 'license', 'license.export.audit.report', parsed, PRO).body,
    );
    expect(auditReport).toContain('# NekoLicense obligations & risk audit');
    expect(auditReport).toContain('license.copyleft');

    const sarifResult = runExporter(r, 'license', 'license.export.sarif', parsed, PRO);
    expect(sarifResult.mimeType).toBe('application/sarif+json');
    expect(sarifResult.extension).toBe('sarif');
    const sarif = JSON.parse(String(sarifResult.body));
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs[0].tool.driver.name).toBe('NekoLicense');
    expect(sarif.runs[0].results.some((x: { ruleId: string }) => x.ruleId === 'license.copyleft')).toBe(true);
  });

  it('a truly unknown exporter id still throws "unknown exporter"', () => {
    expect(() =>
      runExporter(registry(), 'license', 'license.export.nope', { artifacts: [], diagnostics: [] }, PRO),
    ).toThrow(/unknown exporter/);
  });
});

describe('NekoLicense: obligations & risk audit', () => {
  const audit = (raw: string) => auditLicense(report(raw));

  it('ranks a strong copyleft license (GPL-3.0) as high and adds its obligations', () => {
    const findings = audit(GPL3);
    expect(findings.find((f) => f.ruleId === 'license.copyleft')?.severity).toBe('high');
    const ids = findings.map((f) => f.ruleId);
    expect(ids).toContain('license.disclose_source');
    expect(ids).toContain('license.same_license');
  });

  it('treats a permissive license (MIT) as clean (no findings)', () => {
    expect(audit(MIT)).toEqual([]);
  });

  it('flags a weak-copyleft license (MPL-2.0) as medium', () => {
    const findings = auditLicense(
      report('Mozilla Public License Version 2.0\n\n1. Definitions'),
    );
    expect(findings.find((f) => f.ruleId === 'license.weak_copyleft')?.severity).toBe('medium');
  });

  it('flags an unidentified license for manual review', () => {
    expect(audit('this is just some random text, not a license').map((f) => f.ruleId)).toContain(
      'license.unknown',
    );
  });

  it('flags an SPDX tag that disagrees with the detected text', () => {
    expect(audit(`SPDX-License-Identifier: GPL-3.0\n${MIT}`).map((f) => f.ruleId)).toContain(
      'license.tag_mismatch',
    );
  });

  it('returns nothing for an absent report', () => {
    expect(auditLicense(undefined)).toEqual([]);
  });
});

describe('NekoLicense: detection', () => {
  it('detects MIT', () => {
    const v = report(MIT);
    expect(v.primary).toBe('MIT');
    expect(v.meta?.category).toBe('permissive');
  });
  it('detects Apache-2.0 (incl. patent permission)', () => {
    const v = report(APACHE);
    expect(v.primary).toBe('Apache-2.0');
    expect(v.meta?.permissions).toContain('patent use');
  });
  it('detects GPL-3.0 as copyleft', () => {
    expect(report(GPL3).primary).toBe('GPL-3.0');
    expect(report(GPL3).meta?.category).toBe('copyleft');
  });
  it('distinguishes BSD-3-Clause from BSD-2 via the "Neither the name" clause', () => {
    expect(report(BSD3).primary).toBe('BSD-3-Clause');
    expect(detectLicense('Redistribution and use in source and binary forms, with or without modification...').primary).toBe('BSD-2-Clause');
  });
  it('detects ISC', () => {
    expect(report(ISC).primary).toBe('ISC');
  });
  it('honors an SPDX-License-Identifier tag', () => {
    const v = report('SPDX-License-Identifier: Apache-2.0\n(some short header)');
    expect(v.spdxTag).toBe('Apache-2.0');
    expect(v.primary).toBe('Apache-2.0');
  });
  it('flags a tag that disagrees with the detected text', () => {
    const codes = parse(`SPDX-License-Identifier: GPL-3.0\n${MIT}`).diagnostics.map((d) => d.code);
    expect(codes).toContain('license.tag_mismatch');
  });
});

describe('NekoLicense: diagnostics', () => {
  it('emits license.detected on a match', () => {
    expect(parse(MIT).diagnostics.map((d) => d.code)).toContain('license.detected');
  });
  it('emits license.unknown when nothing matches', () => {
    expect(parse('this is just some random text, not a license').diagnostics.map((d) => d.code)).toContain('license.unknown');
  });
  it('emits license.empty_input for empty input', () => {
    expect(parse('   ').diagnostics.map((d) => d.code)).toContain('license.empty_input');
  });
  it('produces a schema-valid artifact', () => {
    expect(validate('artifact', parse(MIT).artifacts[0] as Artifact).ok).toBe(true);
  });
});

describe('NekoLicense: exporters', () => {
  it('license.export.normalized emits the SPDX id', () => {
    const out = runExporter(registry(), 'license', 'license.export.normalized', {
      artifacts: parse(MIT).artifacts,
      diagnostics: [],
    });
    expect(String(out.body)).toBe('MIT');
  });
  it('license.export.markdown.summary lists permissions', () => {
    const out = runExporter(registry(), 'license', 'license.export.markdown.summary', {
      artifacts: parse(APACHE).artifacts,
      diagnostics: [],
    });
    expect(String(out.body)).toContain('# NekoLicense export');
    expect(String(out.body)).toContain('Apache-2.0');
    expect(String(out.body)).toContain('permissions');
  });
  it('refuses a foreign artifact kind', () => {
    const foreign = { ...(parse(MIT).artifacts[0] as Artifact), kind: 'json.value' } as Artifact;
    expect(() =>
      runExporter(registry(), 'license', 'license.export.json', { artifacts: [foreign], diagnostics: [] }),
    ).toThrow(/does not accept artifact kind/);
  });
});

describe('NekoLicense: workspace round-trip', () => {
  it('round-trips losslessly', () => {
    const parsed = parse(MIT);
    const ws: Workspace = {
      version: 1,
      id: 'ws_license_single',
      toolId: 'license',
      toolVersion: 1,
      createdAt: '2026-05-28T00:00:00.000Z',
      updatedAt: '2026-05-28T00:00:00.000Z',
      artifacts: parsed.artifacts,
      diagnostics: parsed.diagnostics,
      uiState: { viewMode: 'summary' },
    };
    const back = jsonWorkspaceSerializer.deserialize(jsonWorkspaceSerializer.serialize(ws));
    expect(back).toEqual(ws);
  });
});
