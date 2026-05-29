import type { SecretSeverity } from './kinds.js';

/**
 * A pattern-based secret rule. `regex` MUST be global (`g`) — the scanner
 * uses `matchAll`. When `group` is set, the secret is that capture group
 * (used by the generic `key = value` rule, where only the value is the
 * secret), otherwise the whole match is the secret.
 */
export interface SecretRule {
  readonly id: string;
  readonly description: string;
  readonly severity: SecretSeverity;
  readonly regex: RegExp;
  readonly group?: number;
}

/**
 * Known-provider credential patterns. These are deliberately specific
 * (provider prefixes + length) to keep precision high; the entropy pass in
 * the scanner is the catch-all for unknown high-randomness tokens.
 */
export const SECRET_RULES: readonly SecretRule[] = [
  {
    id: 'aws.access-key',
    description: 'AWS access key id',
    severity: 'high',
    regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  },
  {
    id: 'github.token',
    description: 'GitHub access token',
    severity: 'high',
    regex: /\bgh[posru]_[A-Za-z0-9]{36}\b/g,
  },
  {
    id: 'github.pat',
    description: 'GitHub fine-grained PAT',
    severity: 'high',
    regex: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g,
  },
  {
    id: 'slack.token',
    description: 'Slack token',
    severity: 'high',
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,48}\b/g,
  },
  {
    id: 'slack.webhook',
    description: 'Slack incoming webhook URL',
    severity: 'high',
    regex: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_/]+/g,
  },
  {
    id: 'google.api-key',
    description: 'Google API key',
    severity: 'high',
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    id: 'stripe.secret-live',
    description: 'Stripe live secret key',
    severity: 'high',
    regex: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/g,
  },
  {
    id: 'stripe.secret-test',
    description: 'Stripe test secret key',
    severity: 'medium',
    regex: /\b(?:sk|rk)_test_[A-Za-z0-9]{16,}\b/g,
  },
  {
    id: 'openai.key',
    description: 'OpenAI API key',
    severity: 'high',
    regex: /\bsk-[A-Za-z0-9-]{20,}\b/g,
  },
  {
    id: 'private.key',
    description: 'PEM private key block',
    severity: 'high',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
  },
  {
    id: 'jwt',
    description: 'JSON Web Token',
    severity: 'medium',
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  {
    id: 'generic.assignment',
    description: 'Hardcoded secret assignment',
    severity: 'medium',
    regex:
      /(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\s*[:=]\s*["']?([^\s"']{8,})/gi,
    group: 1,
  },
];
