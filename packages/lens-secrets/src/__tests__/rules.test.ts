import { describe, expect, it } from 'vitest';
import { ToolRegistry, runParser } from '@nekotools/tool-runtime';

import { FIXED_CLOCK, buildSecretsRegistration } from '../index.js';
import { ENTROPY_RULE_ID, SECRET_RULES, SECRET_RULES_BY_ID } from '../rules.js';
import type { SecretReportArtifact } from '../kinds.js';

const clock = FIXED_CLOCK('2026-05-28T00:00:00.000Z');

function registry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(buildSecretsRegistration(clock));
  return r;
}

function ruleIds(raw: string): string[] {
  const parsed = runParser(registry(), 'secrets', 'secret.text', {
    raw,
    source: { kind: 'paste', bytes: raw.length },
  });
  return (parsed.artifacts[0] as SecretReportArtifact).value.findings.map((f) => f.ruleId);
}

/** Synthetic but well-formed sample for each provider rule. None are real. */
const SAMPLES: ReadonlyArray<{ ruleId: string; sample: string }> = [
  { ruleId: 'aws.access-key', sample: 'AKIAIOSFODNN7EXAMPLE' },
  { ruleId: 'azure.storage-key', sample: `AccountKey=${'a'.repeat(86)}==` },
  { ruleId: 'google.api-key', sample: `AIza${'0'.repeat(35)}` },
  { ruleId: 'google.oauth-token', sample: `ya29.${'a'.repeat(40)}` },
  { ruleId: 'digitalocean.token', sample: `dop_v1_${'a'.repeat(64)}` },
  { ruleId: 'heroku.api-key', sample: `heroku_${'a'.repeat(32)}` },
  { ruleId: 'github.token', sample: `ghp_${'a'.repeat(36)}` },
  { ruleId: 'github.pat', sample: `github_pat_${'a'.repeat(30)}` },
  { ruleId: 'gitlab.pat', sample: `glpat-${'a'.repeat(20)}` },
  { ruleId: 'npm.token', sample: `npm_${'a'.repeat(36)}` },
  { ruleId: 'pypi.token', sample: `pypi-AgEIcHlwaS5vcmc${'a'.repeat(50)}` },
  { ruleId: 'slack.token', sample: `xoxb-${'1'.repeat(24)}` },
  { ruleId: 'slack.app-token', sample: 'xapp-1-A0B1C2-1234567890-abcdef0123' },
  { ruleId: 'slack.webhook', sample: 'https://hooks.slack.com/services/T000/B000/XXXXXXXX' },
  { ruleId: 'sendgrid.key', sample: `SG.${'a'.repeat(22)}.${'a'.repeat(43)}` },
  { ruleId: 'twilio.api-key', sample: `SK${'0'.repeat(32)}` },
  { ruleId: 'telegram.bot-token', sample: `123456789:AA${'a'.repeat(33)}` },
  { ruleId: 'discord.bot-token', sample: `M${'a'.repeat(24)}.${'a'.repeat(6)}.${'a'.repeat(27)}` },
  { ruleId: 'stripe.secret-live', sample: `sk_live_${'a'.repeat(24)}` },
  { ruleId: 'stripe.secret-test', sample: `sk_test_${'a'.repeat(24)}` },
  { ruleId: 'square.token', sample: `sq0atp-${'a'.repeat(22)}` },
  { ruleId: 'shopify.token', sample: `shpat_${'a'.repeat(32)}` },
  { ruleId: 'anthropic.key', sample: `sk-ant-api03-${'a'.repeat(50)}` },
  { ruleId: 'openai.key', sample: `sk-proj-${'a'.repeat(40)}` },
  { ruleId: 'huggingface.token', sample: `hf_${'a'.repeat(34)}` },
  { ruleId: 'private.key', sample: '-----BEGIN OPENSSH PRIVATE KEY-----' },
  { ruleId: 'age.secret-key', sample: `AGE-SECRET-KEY-1${'A'.repeat(58)}` },
  {
    ruleId: 'jwt',
    sample: `eyJ${'a'.repeat(16)}.eyJ${'b'.repeat(16)}.${'c'.repeat(20)}`,
  },
  { ruleId: 'uri.basic-auth', sample: 'postgres://admin:s3cr3tpassword@db.internal:5432/app' },
  { ruleId: 'generic.assignment', sample: 'password = "hunter2hunter2"' },
];

describe('NekoSecrets rule catalog', () => {
  it('every rule regex is global and has a stable, unique id', () => {
    const ids = new Set<string>();
    for (const rule of SECRET_RULES) {
      expect(rule.regex.global, `${rule.id} regex must be global`).toBe(true);
      expect(rule.id).not.toBe('');
      expect(rule.provider).not.toBe('');
      expect(rule.description).not.toBe('');
      expect(ids.has(rule.id), `duplicate rule id ${rule.id}`).toBe(false);
      ids.add(rule.id);
    }
    expect(SECRET_RULES_BY_ID.size).toBe(SECRET_RULES.length);
  });

  it('covers a sample for every catalog rule (no rule is untested)', () => {
    const tested = new Set(SAMPLES.map((s) => s.ruleId));
    for (const rule of SECRET_RULES) {
      expect(tested.has(rule.id), `no sample for rule ${rule.id}`).toBe(true);
    }
  });

  for (const { ruleId, sample } of SAMPLES) {
    it(`detects ${ruleId}`, () => {
      expect(ruleIds(`secret_token_value: ${sample}`)).toContain(ruleId);
    });
  }

  it('does not misclassify an Anthropic key as an OpenAI key', () => {
    const ids = ruleIds(`key=sk-ant-api03-${'a'.repeat(50)}`);
    expect(ids).toContain('anthropic.key');
    expect(ids).not.toContain('openai.key');
  });

  it('collapses an AWS key that is also a generic assignment to one high finding', () => {
    const parsed = runParser(registry(), 'secrets', 'secret.text', {
      raw: 'api_key=AKIAIOSFODNN7EXAMPLE',
      source: { kind: 'paste', bytes: 28 },
    });
    const findings = (parsed.artifacts[0] as SecretReportArtifact).value.findings;
    expect(findings).toHaveLength(1);
    expect(findings[0]!.ruleId).toBe('aws.access-key');
    expect(findings[0]!.severity).toBe('high');
  });

  it('exposes the entropy fallback id without listing it as a pattern rule', () => {
    expect(ENTROPY_RULE_ID).toBe('entropy.high');
    expect(SECRET_RULES_BY_ID.has(ENTROPY_RULE_ID)).toBe(false);
  });
});
