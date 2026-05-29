import type { Diagnostic, Parser, ParserInput, ParserResult } from '@nekotools/contracts';
import { makeIdFactory, type Clock } from '@nekotools/lens-kit';

import {
  COOKIE_DIAGNOSTIC_CODES,
  DEFAULT_LARGE_COOKIE_BYTES,
  makeDiagnostic,
} from './diagnostics.js';
import {
  COOKIE_KIND_PARSED,
  emptyAttributes,
  type CookieArtifact,
  type CookieAttributes,
  type CookieMode,
  type CookieParsedArtifact,
  type CookieSet,
  type ParsedCookie,
} from './kinds.js';

const TOOL_ID = 'cookies';
const PARSER_ID = 'cookie.text';

export interface CookieTextParserDeps {
  readonly clock: Clock;
  /** Soft per-cookie byte limit for `cookie.large`. Defaults to 4096. */
  readonly largeCookieBytes?: number;
}

const SHARED_UTF8_ENCODER = new TextEncoder();
function utf8ByteLength(s: string): number {
  return SHARED_UTF8_ENCODER.encode(s).byteLength;
}

/**
 * The `cookie.text` parser. Decodes a `Set-Cookie` response header (one
 * cookie per line, with attributes) or a `Cookie` request header (name=value
 * pairs on one line) — selected by `hints.mode` ('set-cookie' default /
 * 'cookie'). Never throws; malformed segments produce diagnostics and a
 * best-effort artifact. Pure string analysis — no network, ever.
 */
export function createCookieTextParser(deps: CookieTextParserDeps): Parser<CookieArtifact> {
  return {
    version: 1,
    id: PARSER_ID,
    parserVersion: 1,
    toolId: TOOL_ID,
    accepts: ['text'],
    produces: [COOKIE_KIND_PARSED],
    parse(input: ParserInput): ParserResult<CookieArtifact> {
      return parseCookieText(input, deps);
    },
  };
}

function resolveMode(hints: ParserInput['hints']): CookieMode {
  return hints?.mode === 'cookie' ? 'cookie' : 'set-cookie';
}

function parseCookieText(input: ParserInput, deps: CookieTextParserDeps): ParserResult<CookieArtifact> {
  const artIds = makeIdFactory('art');
  const diagIds = makeIdFactory('diag');
  const producedAt = deps.clock.now();
  const diagnostics: Diagnostic[] = [];
  const mode = resolveMode(input.hints);
  const threshold = deps.largeCookieBytes ?? DEFAULT_LARGE_COOKIE_BYTES;
  const nowMs = Date.parse(producedAt);

  if (input.raw.trim() === '') {
    diagnostics.push(
      makeDiagnostic(diagIds(), 'info', COOKIE_DIAGNOSTIC_CODES.emptyInput, 'input is empty'),
    );
    return {
      artifacts: [makeArtifact(artIds(), producedAt, input, { valid: false, mode, cookies: [] })],
      diagnostics,
    };
  }

  const cookies: ParsedCookie[] = [];
  let fatal = false;

  const segments: string[] =
    mode === 'cookie'
      ? stripPrefix(input.raw.replace(/\r?\n/g, ' '), /^cookie:\s*/i)
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s !== '')
      : input.raw
          .split(/\r?\n/)
          .map((line) => stripPrefix(line, /^set-cookie:\s*/i).trim())
          .filter((line) => line !== '');

  for (const segment of segments) {
    if (mode === 'cookie') {
      const pair = splitPair(segment);
      if (pair === null) {
        diagnostics.push(
          makeDiagnostic(
            diagIds(),
            'error',
            COOKIE_DIAGNOSTIC_CODES.parseError,
            `cookie pair has no "=": ${truncate(segment)}`,
          ),
        );
        fatal = true;
        continue;
      }
      cookies.push({ name: pair.name, value: pair.value, attributes: emptyAttributes() });
      continue;
    }

    // set-cookie: name=value ; attr ; attr ...
    const parts = segment.split(';');
    const pair = splitPair((parts[0] ?? '').trim());
    if (pair === null) {
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'error',
          COOKIE_DIAGNOSTIC_CODES.parseError,
          `Set-Cookie has no "name=value": ${truncate(segment)}`,
        ),
      );
      fatal = true;
      continue;
    }
    const attributes = parseAttributes(parts.slice(1));
    const cookie: ParsedCookie = { name: pair.name, value: pair.value, attributes };
    cookies.push(cookie);

    emitSecurityDiagnostics(cookie, segment, threshold, nowMs, diagnostics, diagIds);
  }

  // Duplicate-name detection (both modes), deterministic first-appearance order.
  const counts = new Map<string, number>();
  for (const c of cookies) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
  const warnedDup = new Set<string>();
  for (const c of cookies) {
    if ((counts.get(c.name) ?? 0) > 1 && !warnedDup.has(c.name)) {
      warnedDup.add(c.name);
      diagnostics.push(
        makeDiagnostic(
          diagIds(),
          'warning',
          COOKIE_DIAGNOSTIC_CODES.duplicateName,
          `cookie name "${c.name}" appears ${counts.get(c.name)} times`,
        ),
      );
    }
  }

  const value: CookieSet = { valid: !fatal, mode, cookies };
  return { artifacts: [makeArtifact(artIds(), producedAt, input, value)], diagnostics };
}

function emitSecurityDiagnostics(
  cookie: ParsedCookie,
  rawSegment: string,
  threshold: number,
  nowMs: number,
  diagnostics: Diagnostic[],
  diagIds: () => string,
): void {
  const a = cookie.attributes;
  const push = (severity: Diagnostic['severity'], code: string, message: string, hint?: string): void => {
    diagnostics.push(makeDiagnostic(diagIds(), severity, code, message, undefined, hint));
  };

  if (!a.secure) {
    push(
      'warning',
      COOKIE_DIAGNOSTIC_CODES.insecure,
      `"${cookie.name}" has no Secure attribute`,
      'without Secure the cookie is sent over plain HTTP and can be intercepted.',
    );
  }
  if (!a.httpOnly) {
    push(
      'warning',
      COOKIE_DIAGNOSTIC_CODES.noHttpOnly,
      `"${cookie.name}" has no HttpOnly attribute`,
      'without HttpOnly the value is readable via document.cookie (XSS exfiltration risk).',
    );
  }

  const sameSite = a.sameSite?.toLowerCase() ?? null;
  if (sameSite === null) {
    push(
      'info',
      COOKIE_DIAGNOSTIC_CODES.sameSiteMissing,
      `"${cookie.name}" has no SameSite attribute`,
      'modern browsers default to SameSite=Lax; set it explicitly to be unambiguous.',
    );
  } else if (sameSite === 'none' && !a.secure) {
    push(
      'warning',
      COOKIE_DIAGNOSTIC_CODES.sameSiteNoneInsecure,
      `"${cookie.name}" is SameSite=None without Secure`,
      'browsers reject SameSite=None cookies that are not also Secure.',
    );
  }

  if (cookie.name.startsWith('__Secure-') && !a.secure) {
    push(
      'warning',
      COOKIE_DIAGNOSTIC_CODES.securePrefix,
      `"${cookie.name}" uses the __Secure- prefix but is not Secure`,
      'the __Secure- prefix requires the Secure attribute or the browser rejects it.',
    );
  }
  if (cookie.name.startsWith('__Host-') && (!a.secure || a.path !== '/' || a.domain !== null)) {
    push(
      'warning',
      COOKIE_DIAGNOSTIC_CODES.hostPrefix,
      `"${cookie.name}" violates __Host- rules (needs Secure, Path=/, and no Domain)`,
      'the __Host- prefix is the strongest binding; misuse means the browser rejects it.',
    );
  }

  const expired =
    (a.maxAge !== null && a.maxAge <= 0) ||
    (a.expires !== null &&
      !Number.isNaN(Date.parse(a.expires)) &&
      !Number.isNaN(nowMs) &&
      Date.parse(a.expires) <= nowMs);
  if (expired) {
    push(
      'info',
      COOKIE_DIAGNOSTIC_CODES.expired,
      `"${cookie.name}" is already expired (deletes the cookie)`,
    );
  }

  if (utf8ByteLength(rawSegment) > threshold) {
    push(
      'info',
      COOKIE_DIAGNOSTIC_CODES.large,
      `"${cookie.name}" exceeds the ${threshold}-byte soft limit`,
      'oversized cookies may be dropped by the browser or proxies.',
    );
  }
}

function parseAttributes(parts: readonly string[]): CookieAttributes {
  let domain: string | null = null;
  let path: string | null = null;
  let expires: string | null = null;
  let maxAge: number | null = null;
  let sameSite: string | null = null;
  let secure = false;
  let httpOnly = false;
  let partitioned = false;
  const extras: Record<string, string> = {};

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed === '') continue;
    const eq = trimmed.indexOf('=');
    const key = (eq < 0 ? trimmed : trimmed.slice(0, eq)).trim();
    const val = eq < 0 ? null : trimmed.slice(eq + 1).trim();
    switch (key.toLowerCase()) {
      case 'domain':
        domain = val;
        break;
      case 'path':
        path = val;
        break;
      case 'expires':
        expires = val;
        break;
      case 'max-age': {
        const n = val === null ? NaN : Number(val);
        maxAge = Number.isNaN(n) ? null : n;
        break;
      }
      case 'samesite':
        sameSite = val;
        break;
      case 'secure':
        secure = true;
        break;
      case 'httponly':
        httpOnly = true;
        break;
      case 'partitioned':
        partitioned = true;
        break;
      default:
        if (key !== '') extras[key] = val ?? '';
    }
  }

  return { domain, path, expires, maxAge, sameSite, secure, httpOnly, partitioned, extras };
}

interface Pair {
  readonly name: string;
  readonly value: string;
}

function splitPair(s: string): Pair | null {
  const eq = s.indexOf('=');
  if (eq < 0) return null;
  const name = s.slice(0, eq).trim();
  if (name === '') return null;
  return { name, value: s.slice(eq + 1).trim() };
}

function stripPrefix(s: string, prefix: RegExp): string {
  return s.replace(prefix, '');
}

function truncate(s: string): string {
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
}

function makeArtifact(
  id: string,
  producedAt: string,
  input: ParserInput,
  value: CookieSet,
): CookieParsedArtifact {
  return {
    version: 1,
    kind: COOKIE_KIND_PARSED,
    id,
    producedBy: { toolId: TOOL_ID, parserId: PARSER_ID, parserVersion: 1 },
    producedAt,
    source: input.source,
    value,
  };
}
