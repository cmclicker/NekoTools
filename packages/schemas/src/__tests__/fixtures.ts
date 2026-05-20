/**
 * Canonical valid / invalid fixtures per contract. The schema tests load
 * these and assert that valid examples pass and invalid examples fail.
 *
 * The invalid examples are intentional — each one breaks exactly one
 * constraint so a regression in the schema is easy to localize.
 */
import type { SchemaName } from '../index.js';

interface FixtureSet {
  readonly valid: readonly unknown[];
  readonly invalid: readonly unknown[];
}

const nowIso = '2026-05-19T12:00:00.000Z';

const artifactValid = {
  version: 1,
  kind: 'binary.number',
  id: 'art_1',
  producedBy: { toolId: 'binary', parserId: 'binary.decimal', parserVersion: 1 },
  producedAt: nowIso,
  source: { kind: 'paste', bytes: 3 },
  value: 42,
};

const diagnosticValid = {
  version: 1,
  id: 'diag_1',
  severity: 'warning',
  code: 'binary.invalid_digit',
  message: 'invalid binary digit "2"',
  span: { startOffset: 4, endOffset: 5 },
};

const offlinePolicyValid = {
  version: 1,
  networkPolicy: 'network-forbidden',
  dataCollection: 'none',
  requiresAccount: false,
  requiresInternetForCoreFeatures: false,
  offlineSupported: true,
};

export const fixtures: Record<SchemaName, FixtureSet> = {
  artifact: {
    valid: [
      artifactValid,
      {
        ...artifactValid,
        source: { kind: 'file', bytes: 99, filename: 'in.txt' },
      },
      {
        ...artifactValid,
        source: { kind: 'derived', from: ['art_1'] },
      },
    ],
    invalid: [
      { ...artifactValid, version: 2 },
      { ...artifactValid, kind: '' },
      (() => {
        const { id: _id, ...rest } = artifactValid;
        return rest;
      })(),
      { ...artifactValid, source: { kind: 'fetch', url: 'https://x' } },
      { ...artifactValid, producedAt: 'yesterday' },
    ],
  },

  parser: {
    valid: [
      {
        version: 1,
        id: 'binary.decimal',
        parserVersion: 1,
        toolId: 'binary',
        accepts: ['decimal'],
        produces: ['binary.number'],
      },
    ],
    invalid: [
      { version: 1, id: '', parserVersion: 1, toolId: 'binary', accepts: [], produces: ['x'] },
      { version: 1, id: 'p', parserVersion: 0, toolId: 'binary', accepts: [], produces: ['x'] },
      { version: 1, id: 'p', parserVersion: 1, toolId: 'binary', accepts: [], produces: [] },
    ],
  },

  diagnostic: {
    valid: [
      diagnosticValid,
      { ...diagnosticValid, severity: 'error', span: undefined },
    ],
    invalid: [
      { ...diagnosticValid, severity: 'fatal' },
      { ...diagnosticValid, message: '' },
      { ...diagnosticValid, span: { startOffset: -1, endOffset: 0 } },
    ],
  },

  export: {
    valid: [
      {
        version: 1,
        id: 'binary.export.json',
        toolId: 'binary',
        target: 'json',
        accepts: ['binary.number'],
        producesMimeType: 'application/json',
        producesExtension: 'json',
      },
    ],
    invalid: [
      {
        version: 1,
        id: 'x',
        toolId: 'binary',
        target: 'pdf',
        accepts: ['binary.number'],
        producesMimeType: 'application/pdf',
        producesExtension: 'pdf',
      },
      {
        version: 1,
        id: 'x',
        toolId: 'binary',
        target: 'json',
        accepts: [],
        producesMimeType: 'application/json',
        producesExtension: 'json',
      },
    ],
  },

  workspace: {
    valid: [
      {
        version: 1,
        id: 'ws_1',
        toolId: 'binary',
        toolVersion: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        artifacts: [artifactValid],
        diagnostics: [diagnosticValid],
      },
    ],
    invalid: [
      {
        version: 1,
        id: 'ws_1',
        toolId: 'binary',
        toolVersion: 1,
        createdAt: 'not-a-date',
        updatedAt: nowIso,
        artifacts: [],
        diagnostics: [],
      },
      {
        version: 1,
        id: 'ws_1',
        toolId: 'binary',
        toolVersion: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        artifacts: [{ ...artifactValid, kind: '' }],
        diagnostics: [],
      },
    ],
  },

  graph: {
    valid: [
      {
        version: 1,
        id: 'g_1',
        toolId: 'binary',
        fromArtifactIds: ['art_1'],
        nodes: [{ id: 'n1', label: '42', kind: 'binary.number' }],
        edges: [],
      },
    ],
    invalid: [
      {
        version: 1,
        id: 'g_1',
        toolId: 'binary',
        fromArtifactIds: ['art_1'],
        nodes: [{ id: '', label: 'x', kind: 'k' }],
        edges: [],
      },
      {
        version: 1,
        id: 'g_1',
        toolId: 'binary',
        fromArtifactIds: ['art_1'],
        nodes: [],
        edges: [{ id: 'e1', from: 'n1', to: 'n2', kind: '' }],
      },
    ],
  },

  toolManifest: {
    valid: [
      {
        version: 1,
        id: 'binary',
        name: 'NekoBinary',
        toolVersion: 1,
        summary: 'Convert and inspect binary, hex, decimal, base64, and UTF-8.',
        artifactKinds: ['binary.number', 'binary.bytes', 'binary.text'],
        parsers: ['binary.decimal', 'binary.binary', 'binary.hex', 'binary.base64', 'binary.utf8'],
        exporters: ['binary.export.json', 'binary.export.markdown', 'binary.export.plaintext'],
        offlinePolicy: offlinePolicyValid,
        capabilities: {
          canSaveWorkspace: true,
          canExport: true,
          canDiff: false,
          canProjectGraph: false,
        },
        entitlements: { free: ['parse', 'export.basic'], pro: [] },
        outOfScope: ['fetching live data', 'arbitrary binary file parsing'],
      },
    ],
    invalid: [
      {
        version: 1,
        id: 'binary',
        name: '',
        toolVersion: 1,
        summary: 's',
        artifactKinds: ['k'],
        parsers: ['p'],
        exporters: [],
        offlinePolicy: offlinePolicyValid,
        capabilities: {
          canSaveWorkspace: true,
          canExport: true,
          canDiff: false,
          canProjectGraph: false,
        },
        entitlements: { free: [], pro: [] },
        outOfScope: [],
      },
      {
        version: 1,
        id: 'binary',
        name: 'NekoBinary',
        toolVersion: 1,
        summary: 's',
        artifactKinds: [],
        parsers: ['p'],
        exporters: [],
        offlinePolicy: offlinePolicyValid,
        capabilities: {
          canSaveWorkspace: true,
          canExport: true,
          canDiff: false,
          canProjectGraph: false,
        },
        entitlements: { free: [], pro: [] },
        outOfScope: [],
      },
    ],
  },

  entitlement: {
    valid: [
      {
        version: 1,
        licenseId: 'free',
        licensee: 'free build',
        tier: 'free',
        features: [],
        issuedAt: nowIso,
        expiresAt: null,
        signature: '',
      },
      {
        version: 1,
        licenseId: 'pro-2026-0001',
        licensee: 'Cody Moore',
        tier: 'pro',
        features: ['json.graph', 'json.migration'],
        issuedAt: nowIso,
        expiresAt: null,
        signature: 'BASE64SIG',
      },
    ],
    invalid: [
      {
        version: 1,
        licenseId: 'x',
        licensee: 'x',
        tier: 'enterprise',
        features: [],
        issuedAt: nowIso,
        expiresAt: null,
        signature: '',
      },
      {
        version: 1,
        licenseId: '',
        licensee: 'x',
        tier: 'free',
        features: [],
        issuedAt: nowIso,
        expiresAt: null,
        signature: '',
      },
    ],
  },

  offlinePolicy: {
    valid: [offlinePolicyValid, { ...offlinePolicyValid, networkPolicy: 'explicit-import-only' }],
    invalid: [
      { ...offlinePolicyValid, networkPolicy: 'optional-user-initiated-network' },
      { ...offlinePolicyValid, requiresAccount: true },
      { ...offlinePolicyValid, dataCollection: 'aggregate' },
      { ...offlinePolicyValid, offlineSupported: false },
    ],
  },
};
