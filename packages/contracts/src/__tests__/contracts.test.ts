import { describe, expect, it } from 'vitest';
import {
  CONTRACT_VERSION,
  DEFAULT_OFFLINE_POLICY,
  FREE_ENTITLEMENT,
  isArtifact,
} from '../index.js';

describe('contracts: version', () => {
  it('pins contract version at 1 for Phase 0', () => {
    expect(CONTRACT_VERSION).toBe(1);
  });
});

describe('contracts: artifact guard', () => {
  it('accepts a well-formed artifact', () => {
    expect(
      isArtifact({
        version: 1,
        kind: 'binary.number',
        id: 'art_1',
        producedBy: { toolId: 'binary', parserId: 'binary.decimal', parserVersion: 1 },
        producedAt: new Date().toISOString(),
        source: { kind: 'paste', bytes: 3 },
        value: 42,
      }),
    ).toBe(true);
  });

  it('rejects non-objects', () => {
    expect(isArtifact(null)).toBe(false);
    expect(isArtifact('artifact')).toBe(false);
    expect(isArtifact(42)).toBe(false);
  });

  it('rejects objects missing required fields', () => {
    expect(isArtifact({ kind: 'x', id: 'y' })).toBe(false);
  });
});

describe('contracts: offline policy default', () => {
  it('defaults to network-forbidden, zero collection, no account', () => {
    expect(DEFAULT_OFFLINE_POLICY.networkPolicy).toBe('network-forbidden');
    expect(DEFAULT_OFFLINE_POLICY.dataCollection).toBe('none');
    expect(DEFAULT_OFFLINE_POLICY.requiresAccount).toBe(false);
    expect(DEFAULT_OFFLINE_POLICY.requiresInternetForCoreFeatures).toBe(false);
    expect(DEFAULT_OFFLINE_POLICY.offlineSupported).toBe(true);
  });
});

describe('contracts: free entitlement', () => {
  it('grants no Pro features and carries no signature', () => {
    expect(FREE_ENTITLEMENT.tier).toBe('free');
    expect(FREE_ENTITLEMENT.features).toEqual([]);
    expect(FREE_ENTITLEMENT.signature).toBe('');
  });
});
