import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildCookiesRegistration,
  FIXED_CLOCK,
  COOKIE_KIND_PARSED,
  type CookieMode,
  type CookieParsedArtifact,
  type ParsedCookie,
} from '@nekotools/lens-cookies';
import type { Diagnostic, Entitlement } from '@nekotools/contracts';

/**
 * NekoCookies UI parse helper, extracted out of CookiesApp for testability
 * — the same engine-adapter seam the other tools' `*-parse.ts` modules
 * provide. The `mode` hint selects Set-Cookie (response, with attributes)
 * vs Cookie (request, name=value pairs) parsing. Output strings come from
 * the real engine exporters so the tab can't drift from the engine. The Pro
 * audit report + SARIF are gated: `runExporter` throws EntitlementError for a
 * free caller, surfaced here as null so the UI shows the Pro-lock.
 */

const SHARED_UTF8_ENCODER = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return SHARED_UTF8_ENCODER.encode(value).byteLength;
}

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildCookiesRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedCookieView {
  readonly valid: boolean;
  readonly mode: CookieMode;
  readonly cookies: readonly ParsedCookie[];
  readonly json: string;
  readonly normalized: string;
  readonly markdown: string;
  /** Pro: security & privacy audit report (markdown), or null when not entitled. */
  readonly auditReport: string | null;
  /** Pro: SARIF 2.1.0 of the cookie audit, or null when not entitled. */
  readonly sarif: string | null;
  readonly proUnlocked: boolean;
  readonly diagnostics: readonly Diagnostic[];
  readonly inputBytes: number;
}

export function parseCookieInput(
  raw: string,
  mode: CookieMode,
  entitlement: Entitlement = FREE_ENTITLEMENT,
): ParsedCookieView {
  const bytes = utf8ByteLength(raw);
  const result = runParser(registry, 'cookies', 'cookie.text', {
    raw,
    source: { kind: 'paste', bytes },
    hints: { mode },
  });

  const artifact = result.artifacts.find(
    (a): a is CookieParsedArtifact => a.kind === COOKIE_KIND_PARSED,
  );
  const value = artifact?.value;
  const exportInput = { artifacts: artifact ? [artifact] : [], diagnostics: result.diagnostics };

  const run = (id: string, fallback: string): string =>
    artifact ? String(runExporter(registry, 'cookies', id, exportInput).body) : fallback;
  const runPro = (id: string): string | null => {
    if (artifact === undefined) return null;
    try {
      return String(runExporter(registry, 'cookies', id, exportInput, entitlement).body);
    } catch {
      return null;
    }
  };

  return {
    valid: value?.valid ?? false,
    mode: value?.mode ?? mode,
    cookies: value?.cookies ?? [],
    json: run('cookie.export.json', '[]'),
    normalized: run('cookie.export.normalized', ''),
    markdown: run('cookie.export.markdown.summary', ''),
    auditReport: runPro('cookie.export.audit.report'),
    sarif: runPro('cookie.export.sarif'),
    proUnlocked: entitlement.tier !== 'free',
    diagnostics: result.diagnostics,
    inputBytes: bytes,
  };
}

export type { CookieMode };
