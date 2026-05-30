import { FREE_ENTITLEMENT, ToolRegistry, runExporter, runParser } from '@nekotools/tool-runtime';
import {
  buildHeadersRegistration,
  FIXED_CLOCK,
  HEADERS_KIND_DOCUMENT,
  type HeadersDocument,
  type HeadersDocumentArtifact,
} from '@nekotools/lens-headers';
import type { Diagnostic, Entitlement } from '@nekotools/contracts';

/**
 * NekoHeaders UI parse helper — the engine-adapter seam, mirroring
 * yaml-parse.ts / logs-parse.ts. Runs the real `@nekotools/lens-headers`
 * parser + exporters through a module-singleton registry. The Pro security
 * audit + CORS/CSP pack are gated: `runExporter` throws EntitlementError for a
 * free caller, surfaced here as null so the UI shows the Pro-lock.
 */

const SHARED_UTF8_ENCODER = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return SHARED_UTF8_ENCODER.encode(value).byteLength;
}

const registry = (() => {
  const r = new ToolRegistry();
  r.register(buildHeadersRegistration(FIXED_CLOCK(new Date().toISOString())));
  return r;
})();

export interface ParsedHeaders {
  readonly document: HeadersDocument | null;
  /** Headers as a JSON object (name -> value); null when there are none. */
  readonly jsonOutput: string | null;
  /** Value-free markdown summary; null when there are none. */
  readonly markdown: string | null;
  /** Pro: severity-ranked security audit (markdown), or null when not entitled. */
  readonly auditReport: string | null;
  /** Pro: hardened CORS/CSP header pack, or null when not entitled. */
  readonly corsCspPack: string | null;
  readonly proUnlocked: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseHeadersText(
  raw: string,
  entitlement: Entitlement = FREE_ENTITLEMENT,
): ParsedHeaders {
  const result = runParser(registry, 'headers', 'headers.text', {
    raw,
    source: { kind: 'paste', bytes: utf8ByteLength(raw) },
  });
  const doc = result.artifacts.find(
    (a): a is HeadersDocumentArtifact => a.kind === HEADERS_KIND_DOCUMENT,
  );
  const hasHeaders = doc !== undefined && doc.value.entries.length > 0;
  const input = { artifacts: doc ? [doc] : [], diagnostics: result.diagnostics };

  const run = (id: string): string | null =>
    hasHeaders ? String(runExporter(registry, 'headers', id, input).body) : null;
  const runPro = (id: string): string | null => {
    if (!hasHeaders) return null;
    try {
      return String(runExporter(registry, 'headers', id, input, entitlement).body);
    } catch {
      return null;
    }
  };

  return {
    document: doc?.value ?? null,
    jsonOutput: run('headers.export.json'),
    markdown: run('headers.export.markdown.summary'),
    auditReport: runPro('headers.export.audit.report'),
    corsCspPack: runPro('headers.export.cors-csp.pack'),
    proUnlocked: entitlement.tier !== 'free',
    diagnostics: result.diagnostics,
  };
}
