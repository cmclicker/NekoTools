import type { SecretSeverity } from './kinds.js';

/**
 * A pattern-based secret rule. `regex` MUST be global (`g`) — the scanner
 * uses `matchAll`. When `group` is set, the secret is that capture group
 * (used by rules where only part of the match is the credential, e.g. the
 * value in `key = value` or the password in a connection string),
 * otherwise the whole match is the secret.
 *
 * `reference` is a short human label for where the pattern comes from; it
 * powers the rules-reference doc and the in-app rule catalog. Rules are
 * deliberately specific (provider prefix + length/charset) to keep
 * precision high — the entropy pass in the scanner is the catch-all for
 * unknown high-randomness tokens.
 */
export interface SecretRule {
  readonly id: string;
  readonly description: string;
  readonly severity: SecretSeverity;
  readonly regex: RegExp;
  readonly group?: number;
  /** Provider / family label, e.g. "AWS", "GitHub", "Generic". */
  readonly provider: string;
}

export const SECRET_RULES: readonly SecretRule[] = [
  // --- Cloud providers --------------------------------------------------
  {
    id: 'aws.access-key',
    description: 'AWS access key id',
    severity: 'high',
    provider: 'AWS',
    regex: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g,
  },
  {
    id: 'azure.storage-key',
    description: 'Azure storage account key (connection string)',
    severity: 'high',
    provider: 'Azure',
    regex: /AccountKey=([A-Za-z0-9+/]{86}==)/g,
    group: 1,
  },
  {
    id: 'google.api-key',
    description: 'Google API key',
    severity: 'high',
    provider: 'Google',
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    id: 'google.oauth-token',
    description: 'Google OAuth access token',
    severity: 'medium',
    provider: 'Google',
    regex: /\bya29\.[0-9A-Za-z_-]{20,}\b/g,
  },
  {
    id: 'digitalocean.token',
    description: 'DigitalOcean personal access / OAuth token',
    severity: 'high',
    provider: 'DigitalOcean',
    regex: /\bdo[oprt]_v1_[a-f0-9]{64}\b/g,
  },
  {
    id: 'heroku.api-key',
    description: 'Heroku API key (heroku_*)',
    severity: 'high',
    provider: 'Heroku',
    regex: /\bheroku_[0-9a-fA-F]{32,}\b/g,
  },

  // --- Source control / package registries ------------------------------
  {
    id: 'github.token',
    description: 'GitHub access token',
    severity: 'high',
    provider: 'GitHub',
    regex: /\bgh[posru]_[A-Za-z0-9]{36}\b/g,
  },
  {
    id: 'github.pat',
    description: 'GitHub fine-grained PAT',
    severity: 'high',
    provider: 'GitHub',
    regex: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g,
  },
  {
    id: 'gitlab.pat',
    description: 'GitLab personal access token',
    severity: 'high',
    provider: 'GitLab',
    regex: /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    id: 'npm.token',
    description: 'npm access token',
    severity: 'high',
    provider: 'npm',
    regex: /\bnpm_[A-Za-z0-9]{36}\b/g,
  },
  {
    id: 'pypi.token',
    description: 'PyPI upload token',
    severity: 'high',
    provider: 'PyPI',
    regex: /\bpypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,}\b/g,
  },

  // --- Communications / messaging ---------------------------------------
  {
    id: 'slack.token',
    description: 'Slack token',
    severity: 'high',
    provider: 'Slack',
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,48}\b/g,
  },
  {
    id: 'slack.app-token',
    description: 'Slack app-level token',
    severity: 'high',
    provider: 'Slack',
    regex: /\bxapp-[0-9]-[A-Z0-9]+-[0-9]+-[a-z0-9]+\b/g,
  },
  {
    id: 'slack.webhook',
    description: 'Slack incoming webhook URL',
    severity: 'high',
    provider: 'Slack',
    regex: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_/]+/g,
  },
  {
    id: 'sendgrid.key',
    description: 'SendGrid API key',
    severity: 'high',
    provider: 'SendGrid',
    regex: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g,
  },
  {
    id: 'twilio.api-key',
    description: 'Twilio API key (SK…)',
    severity: 'high',
    provider: 'Twilio',
    regex: /\bSK[0-9a-fA-F]{32}\b/g,
  },
  {
    id: 'telegram.bot-token',
    description: 'Telegram bot token',
    severity: 'high',
    provider: 'Telegram',
    regex: /\b\d{8,10}:AA[A-Za-z0-9_-]{32,}\b/g,
  },
  {
    id: 'discord.bot-token',
    description: 'Discord bot token',
    severity: 'medium',
    provider: 'Discord',
    regex: /\b[MNO][A-Za-z0-9_-]{23,25}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}\b/g,
  },

  // --- Payments / commerce ----------------------------------------------
  {
    id: 'stripe.secret-live',
    description: 'Stripe live secret key',
    severity: 'high',
    provider: 'Stripe',
    regex: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/g,
  },
  {
    id: 'stripe.secret-test',
    description: 'Stripe test secret key',
    severity: 'medium',
    provider: 'Stripe',
    regex: /\b(?:sk|rk)_test_[A-Za-z0-9]{16,}\b/g,
  },
  {
    id: 'square.token',
    description: 'Square access / OAuth secret',
    severity: 'high',
    provider: 'Square',
    regex: /\bsq0(?:atp|csp)-[A-Za-z0-9_-]{22,}\b/g,
  },
  {
    id: 'shopify.token',
    description: 'Shopify access token',
    severity: 'high',
    provider: 'Shopify',
    regex: /\bshp(?:at|ca|pa|ss)_[a-fA-F0-9]{32}\b/g,
  },

  // --- AI providers -----------------------------------------------------
  {
    id: 'anthropic.key',
    description: 'Anthropic API key',
    severity: 'high',
    provider: 'Anthropic',
    regex: /\bsk-ant-(?:api|admin)[0-9]{2}-[A-Za-z0-9_-]{40,}\b/g,
  },
  {
    id: 'openai.key',
    description: 'OpenAI API key',
    severity: 'high',
    provider: 'OpenAI',
    regex: /\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    id: 'huggingface.token',
    description: 'Hugging Face access token',
    severity: 'high',
    provider: 'Hugging Face',
    regex: /\bhf_[A-Za-z0-9]{34,}\b/g,
  },

  // --- Keys, tokens & connection strings --------------------------------
  {
    id: 'private.key',
    description: 'PEM private key block',
    severity: 'high',
    provider: 'PEM',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/g,
  },
  {
    id: 'age.secret-key',
    description: 'age encryption secret key',
    severity: 'high',
    provider: 'age',
    regex: /\bAGE-SECRET-KEY-1[0-9A-Z]{58}\b/g,
  },
  {
    id: 'jwt',
    description: 'JSON Web Token',
    severity: 'medium',
    provider: 'JWT',
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  {
    id: 'uri.basic-auth',
    description: 'Credentials embedded in a URL / connection string',
    severity: 'high',
    provider: 'Generic',
    regex: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:([^\s:@/]{3,})@/g,
    group: 1,
  },
  {
    id: 'generic.assignment',
    description: 'Hardcoded secret assignment',
    severity: 'medium',
    provider: 'Generic',
    regex:
      /(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key)\s*[:=]\s*["']?([^\s"']{8,})/gi,
    group: 1,
  },
];

/** Lookup of a rule by id (for the UI rule catalog + the rules-reference doc). */
export const SECRET_RULES_BY_ID: ReadonlyMap<string, SecretRule> = new Map(
  SECRET_RULES.map((r) => [r.id, r]),
);

/** The synthetic id used by the entropy fallback (not in `SECRET_RULES`). */
export const ENTROPY_RULE_ID = 'entropy.high';
