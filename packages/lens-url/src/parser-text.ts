import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import {
  DEFAULT_LONG_QUERY_BYTES,
  INSECURE_SCHEME_UPGRADES,
  URL_DIAGNOSTIC_CODES,
  makeDiagnostic,
} from './diagnostics.js';
import {
  URL_KIND_PARSED,
  type ParsedUrl,
  type UrlArtifact,
  type UrlComponents,
  type UrlParsedArtifact,
  type UrlQueryParam,
} from './kinds.js';

const TOOL_ID = 'url';
const PARSER_ID = 'url.text';

export interface UrlTextParserDeps {
  readonly clock: Clock;
  /** Soft byte threshold for `url.long_query`. Defaults to 512 bytes. */
  readonly longQueryBytes?: number;
}

/**
 * The `url.text` parser. Accepts a single absolute URL and emits one
 * `url.parsed` artifact plus structured diagnostics. Never throws — an
 * empty, relative, or malformed input produces diagnostics and a
 * best-effort (`valid: false`) artifact rather than an exception.
 */
export function createUrlTextParser(deps: UrlTextParserDeps): Parser<UrlArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text', 'url'],
    produces: [URL_KIND_PARSED],
    parse(input: ParserInput): ParserResult<UrlArtifact> {
      return parseUrlText(input, deps);
    },
  };
}

function parseUrlText(input: ParserInput, deps: UrlTextParserDeps): ParserResult<UrlArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const producedAt = deps.clock.now();
  const diagnostics: Diagnostic[] = [];

  const trimmed = input.raw.trim();

  // Empty / whitespace-only input: info diagnostic, still produce an
  // artifact (charter policy — every run yields an artifact).
  if (trimmed === '') {
    diagnostics.push(
      makeDiagnostic(diagIds(), 'info', URL_DIAGNOSTIC_CODES.emptyInput, 'input is empty'),
    );
    return {
      artifacts: [makeArtifact(artIds(), producedAt, input, invalidValue())],
      diagnostics,
    };
  }

  const parsed = tryParseUrl(trimmed);
  if (parsed === null) {
    // Distinguish a relative URL (parses against a base) from genuine garbage.
    if (parsesWithBase(trimmed)) {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'warning',
          URL_DIAGNOSTIC_CODES.relativeUrl,
          'input is a relative URL',
          undefined,
          'NekoURL parses absolute URLs only; prefix a scheme + host (e.g. https://host) — it never assumes a base.',
        ),
      );
    } else {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'error',
          URL_DIAGNOSTIC_CODES.parseError,
          'input is not a valid absolute URL',
        ),
      );
    }
    return {
      artifacts: [makeArtifact(artIds(), producedAt, input, invalidValue())],
      diagnostics,
    };
  }

  const { url, hasUsername, hasPassword } = parsed;
  const queryParams = collectQueryParams(url);
  const components: UrlComponents = {
    protocol: url.protocol,
    scheme: url.protocol.replace(/:$/, ''),
    hasUsername,
    hasPassword,
    host: url.host,
    hostname: url.hostname,
    port: url.port,
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
    origin: url.origin,
    queryParams,
  };

  // Security / privacy hints.
  if (hasUsername || hasPassword) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'warning',
        URL_DIAGNOSTIC_CODES.credentialsPresent,
        'credentials are embedded in the URL userinfo',
        undefined,
        'credentials in a URL leak into logs, browser history, and Referer headers. NekoURL does not echo them.',
      ),
    );
  }

  const upgrade = INSECURE_SCHEME_UPGRADES[components.scheme];
  if (upgrade !== undefined) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'warning',
        URL_DIAGNOSTIC_CODES.insecureScheme,
        `scheme "${components.scheme}" transmits data in cleartext`,
        undefined,
        `prefer "${upgrade}" for transport security.`,
      ),
    );
  }

  const threshold = deps.longQueryBytes ?? DEFAULT_LONG_QUERY_BYTES;
  const queryBytes = utf8ByteLength(url.search);
  if (queryBytes > threshold) {
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'info',
        URL_DIAGNOSTIC_CODES.longQuery,
        `query string is ${queryBytes} bytes; exceeds soft threshold of ${threshold} bytes`,
        undefined,
        'long query strings often carry tracking parameters or encoded payloads.',
      ),
    );
  }

  for (const key of duplicateKeys(queryParams)) {
    const count = queryParams.filter((p) => p.key === key).length;
    diagnostics.push(
      makeDiagnostic(
        diagIds(),
        'warning',
        URL_DIAGNOSTIC_CODES.duplicateQueryKey,
        `query key "${key}" appears ${count} times`,
        undefined,
        'servers disagree on which value wins for a repeated key.',
      ),
    );
  }

  const value: ParsedUrl = {
    valid: true,
    sanitizedHref: sanitizedHref(url),
    components,
  };
  return { artifacts: [makeArtifact(artIds(), producedAt, input, value)], diagnostics };
}

interface ParsedOk {
  readonly url: URL;
  readonly hasUsername: boolean;
  readonly hasPassword: boolean;
}

function tryParseUrl(raw: string): ParsedOk | null {
  try {
    const url = new URL(raw);
    return { url, hasUsername: url.username !== '', hasPassword: url.password !== '' };
  } catch {
    return null;
  }
}

/**
 * A fixed, unreachable base used purely to classify a parse failure as
 * "relative" vs "garbage". `.invalid` is the reserved TLD (RFC 6761), so
 * this is never a real host and nothing is ever fetched.
 */
const CLASSIFY_BASE = 'https://base.invalid/';

function parsesWithBase(raw: string): boolean {
  try {
    void new URL(raw, CLASSIFY_BASE);
    return true;
  } catch {
    return false;
  }
}

/** Credential-free `href`: clears userinfo before serializing. */
function sanitizedHref(url: URL): string {
  const copy = new URL(url.href);
  copy.username = '';
  copy.password = '';
  return copy.href;
}

function collectQueryParams(url: URL): readonly UrlQueryParam[] {
  const out: UrlQueryParam[] = [];
  for (const [key, value] of url.searchParams) {
    out.push({ key, value });
  }
  return out;
}

function duplicateKeys(params: readonly UrlQueryParam[]): readonly string[] {
  const counts = new Map<string, number>();
  for (const { key } of params) counts.set(key, (counts.get(key) ?? 0) + 1);
  // First-appearance order, deterministic.
  const seen = new Set<string>();
  const dups: string[] = [];
  for (const { key } of params) {
    if ((counts.get(key) ?? 0) > 1 && !seen.has(key)) {
      seen.add(key);
      dups.push(key);
    }
  }
  return dups;
}

function invalidValue(): ParsedUrl {
  return { valid: false, sanitizedHref: null, components: null };
}

function makeArtifact(
  id: string,
  producedAt: string,
  input: ParserInput,
  value: ParsedUrl,
): UrlParsedArtifact {
  return {
    version: 1,
    kind: URL_KIND_PARSED,
    id,
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt,
    source: input.source,
    value,
  };
}

const SHARED_UTF8_ENCODER = new TextEncoder();
function utf8ByteLength(s: string): number {
  return SHARED_UTF8_ENCODER.encode(s).byteLength;
}
